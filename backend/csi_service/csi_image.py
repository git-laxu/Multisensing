import json
import queue
import threading
import time
from pathlib import Path
from typing import Dict, Optional

# import matplotlib
# matplotlib.use("Agg")  # 子线程里只保存图片，不开GUI
import matplotlib.pyplot as plt
import numpy as np


class CSIImageConverter:
    """
    负责：
    1) 接收 slicer 生成的 fragment/slices 任务
    2) 将每个 slice 转为彩图 PNG
    3) 按所属 fragment 建立文件夹保存图片
    4) 保存一个简单的元数据 json
    """

    def __init__(self, save_dir: str | Path, image_size: int = 224) -> None:
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)

        self.image_size = int(image_size)
        self.total_tasks = 0
        self.total_images = 0
        self.lock = threading.Lock()

    def get_status(self) -> Dict:
        with self.lock:
            return {
                "total_tasks": self.total_tasks,
                "total_images": self.total_images,
                "save_dir": str(self.save_dir),
            }

    def process_fragment_slices(
        self,
        fragment_id: int,
        slices: Dict[str, np.ndarray],
        fragment_meta: Optional[Dict] = None,
    ) -> None:
        """
        slices: {"slice_001": np.ndarray, "slice_002": np.ndarray, ...}
        每个 slice 形状通常为 [slice_window, 181]
        """
        fragment_folder = self.save_dir / f"fragment_{fragment_id:06d}"
        fragment_folder.mkdir(parents=True, exist_ok=True)

        meta_out = {
            "fragment_id": int(fragment_id),
            "num_slices": int(len(slices)),
            "image_size": self.image_size,
            "created_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if fragment_meta is not None:
            meta_out["fragment_meta"] = fragment_meta

        with self.lock:
            self.total_tasks += 1

        for slice_name, slice_data in slices.items():
            try:
# 关掉保存=============================================================
                img = self._slice_to_rgb_image(slice_data)
                # save_path = fragment_folder / f"{slice_name}_amp.png"
                # plt.imsave(save_path, img)
                # with self.lock:
                #     self.total_images += 1
            except Exception as e:
                print(f"[ERROR] image convert failed: fragment={fragment_id} slice={slice_name} err={e}")

# 关掉保存=============================================================
        # meta_path = fragment_folder / "image_meta.json"
        # with open(meta_path, "w", encoding="utf-8") as f:
        #     json.dump(meta_out, f, ensure_ascii=False, indent=2)     

    def _slice_to_rgb_image(self, slice_data: np.ndarray) -> np.ndarray:
        """
        对应 MATLAB 逻辑：
        1. 读取振幅前90列
        2. 按各子载波平均振幅降序排列
        3. 转置：子载波 × 时间
        4. 归一化到 [0,1]
        5. 转为彩图
        """
        if slice_data.ndim != 2 or slice_data.shape[1] < 90:
            raise ValueError(f"slice_data shape invalid: {slice_data.shape}")

        amp_data = slice_data[:, 0:90]  # 振幅部分
        mean_vals = np.mean(amp_data, axis=0)
        sort_index = np.argsort(mean_vals)[::-1]
        amp_data_sorted = amp_data[:, sort_index]

        amp_img = amp_data_sorted.T  # [90, time]
        vmin = np.min(amp_img)
        vmax = np.max(amp_img)

        if np.isclose(vmax, vmin):
            amp_norm = np.zeros_like(amp_img, dtype=np.float32)
        else:
            amp_norm = (amp_img - vmin) / (vmax - vmin)
            amp_norm = amp_norm.astype(np.float32)

        # 用 matplotlib colormap 转为 RGB
        cmap = plt.get_cmap("viridis")
        rgba = cmap(amp_norm)              # [H, W, 4]
        rgb = rgba[:, :, :3]               # [H, W, 3]

        # 调整到目标尺寸（224x224）
        rgb_resized = self._resize_rgb_nearest(rgb, self.image_size, self.image_size)
        return rgb_resized

    @staticmethod
    def _resize_rgb_nearest(img: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
        """
        纯 numpy 最近邻缩放，避免额外依赖 PIL/cv2
        img: [H, W, 3]
        """
        in_h, in_w, c = img.shape
        row_idx = np.linspace(0, in_h - 1, out_h).astype(int)
        col_idx = np.linspace(0, in_w - 1, out_w).astype(int)
        out = img[row_idx][:, col_idx]
        return out