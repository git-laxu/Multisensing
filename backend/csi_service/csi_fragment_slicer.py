import json
import threading
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np


class CSIFragmentSlicer:
    """
    两级切片：
    1) 从连续的预处理后 CSI 流中提取固定长度 fragment
    2) 对每个 fragment 再按 MATLAB 风格做二次切片
    """

    def __init__(
        self,
        save_dir: str | Path,
        fragment_window: int = 4000,
        fragment_step: int = 4000,
        slice_window: int = 1000,
        slice_step: int = 500,
        max_stream_cache: int = 30000,
    ) -> None:
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)

        self.fragment_dir = self.save_dir / "fragments"
        self.slice_dir = self.save_dir / "slices"
        self.meta_dir = self.save_dir / "meta"

        self.fragment_dir.mkdir(parents=True, exist_ok=True)
        self.slice_dir.mkdir(parents=True, exist_ok=True)
        self.meta_dir.mkdir(parents=True, exist_ok=True)

        self.fragment_window = int(fragment_window)
        self.fragment_step = int(fragment_step)
        self.slice_window = int(slice_window)
        self.slice_step = int(slice_step)

        self.stream_cache: Deque[np.ndarray] = deque(maxlen=max_stream_cache)
        self.meta_cache: Deque[Tuple[int, int]] = deque(maxlen=max_stream_cache)  # (seq, ts_ns)

        self.last_fragment_start = 0
        self.fragment_count = 0
        self.slice_count = 0

        self.lock = threading.Lock()

        self.latest_fragment: Optional[np.ndarray] = None
        self.latest_fragment_meta: Optional[Dict] = None

    def get_status(self) -> Dict:
        with self.lock:
            return {
                "fragment_count": self.fragment_count,
                "slice_count": self.slice_count,
                "stream_cache_rows": len(self.stream_cache),
                "last_fragment_start": self.last_fragment_start,
                "fragment_window": self.fragment_window,
                "fragment_step": self.fragment_step,
                "slice_window": self.slice_window,
                "slice_step": self.slice_step,
            }

    def add_processed_row(self, row_181: np.ndarray, seq: int, ts_ns: int):
        with self.lock:
            self.stream_cache.append(np.asarray(row_181, dtype=np.float64))
            self.meta_cache.append((int(seq), int(ts_ns)))
            return self._try_generate_fragments_locked()

    def _try_generate_fragments_locked(self):
        total_rows = len(self.stream_cache)
        latest_result = None

        while self.last_fragment_start + self.fragment_window <= total_rows:
            start = self.last_fragment_start
            end = start + self.fragment_window

            stream_arr = np.asarray(self.stream_cache, dtype=np.float64)
            meta_arr = np.asarray(self.meta_cache, dtype=np.int64)

            current_fragment = stream_arr[start:end, :]
            current_meta = meta_arr[start:end, :]

            frag_id = self.fragment_count
            self.fragment_count += 1

# 关掉保存的调用入口=============================================================
            # self._save_fragment_locked(frag_id, current_fragment, current_meta)

            slice_result_list = self._slice_fragment(current_fragment)

            # 转成 dict，便于图像线程直接用
            slice_result_dict = {}
            for i, s in enumerate(slice_result_list, start=1):
                slice_result_dict[f"slice_{i:03d}"] = s

# 关掉保存的调用入口（一劳永逸）（但易引起后续与页面交互是否需要保存时的操作）=============================================================
            # self._save_slices_locked(frag_id, slice_result_list)

            fragment_meta = {
                "fragment_id": frag_id,
                "start_idx_in_cache": start,
                "end_idx_in_cache": end - 1,
                "rows": int(current_fragment.shape[0]),
                "num_slices": len(slice_result_list),
                "fragment_window": self.fragment_window,
                "fragment_step": self.fragment_step,
                "slice_window": self.slice_window,
                "slice_step": self.slice_step,
                "seq_start": int(current_meta[0, 0]),
                "seq_end": int(current_meta[-1, 0]),
                "ts_start": int(current_meta[0, 1]),
                "ts_end": int(current_meta[-1, 1]),
            }

            self.latest_fragment = current_fragment
            self.latest_fragment_meta = fragment_meta

            latest_result = {
                "fragment_id": frag_id,
                "fragment": current_fragment,
                "slices": slice_result_dict,
                "fragment_meta": fragment_meta,
            }

            self.last_fragment_start += self.fragment_step

        overflow = len(self.stream_cache) - self.stream_cache.maxlen // 2
        if overflow > 0 and self.last_fragment_start > overflow:
            self.last_fragment_start -= overflow

        return latest_result


    def _slice_fragment(self, current_fragment: np.ndarray) -> List[np.ndarray]:
        n_rows = current_fragment.shape[0]
        out: List[np.ndarray] = []

        for start_idx in range(0, n_rows - self.slice_window + 1, self.slice_step):
            end_idx = start_idx + self.slice_window
            sliced = current_fragment[start_idx:end_idx, :]
            out.append(sliced)

        return out

    def _save_fragment_locked(
        self,
        frag_id: int,
        fragment: np.ndarray,
        meta_arr: np.ndarray,
    ) -> None:
        
        frag_file = self.fragment_dir / f"fragment_{frag_id:06d}.npz"
        np.savez_compressed(
            frag_file,
            fragment=fragment,
            meta=meta_arr,
        )

    def _save_slices_locked(
        self,
        frag_id: int,
        slices: List[np.ndarray],
    ) -> None:
        slice_dict = {}
        meta = {
            "fragment_id": frag_id,
            "slice_window": self.slice_window,
            "slice_step": self.slice_step,
            "num_slices": len(slices),
        }

        for i, s in enumerate(slices, start=1):
            slice_dict[f"slice_{i:03d}"] = s
            self.slice_count += 1

        slice_file = self.slice_dir / f"fragment_{frag_id:06d}_slices.npz"
        np.savez_compressed(slice_file, **slice_dict)

        meta_file = self.meta_dir / f"fragment_{frag_id:06d}_meta.json"
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    def get_latest_fragment_amplitude(self) -> Optional[np.ndarray]:
        with self.lock:
            if self.latest_fragment is None:
                return None
            return self.latest_fragment[:, :90].copy()