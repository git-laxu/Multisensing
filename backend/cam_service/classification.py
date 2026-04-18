# -*- coding: utf-8 -*-
import os
import sys
import glob
import json
import tempfile
import subprocess
from typing import Dict, List, Optional

import cv2
import numpy as np
import torch


class OnlineActionClassifier:
    """
    双环境版在线动作分类器

    当前文件运行在 PyTorch 环境中，负责：
    1. 读取 clip 图像
    2. 使用 deep_sort 的 Extractor 提取图像特征
    3. 生成临时 .npy 特征文件
    4. 调用 TensorFlow 环境中的 tf_infer.py 完成分类
    5. 读取并返回分类结果
    """

    DEFAULT_LABEL_MAP = {
        "noaction": 0,
        "put down sleeves": 1,
        "hands around neck": 2,
        "warm hands": 3,
        "folded arm": 4,
        "getting dressed": 5,
        "shoulder shaking": 6,
        "wrapping clothes": 7,
        "rubbing": 8,
        "scratch head": 9,
        "roll up sleeves": 10,
        "take off clothes": 11,
        "hold cooler": 12,
        "Fanning": 13,
        "shaking T-shirt": 14,
        "wiping sweat": 15,
        "splayed posture": 16
    }

    def __init__(
        self,
        tf_python_exe: str,
        tf_infer_script: str,
        classifier_model_path: str,
        reid_model_path: Optional[str] = None,
        sequence_length: int = 80,
        feature_dim: int = 512,
        use_cuda: Optional[bool] = None,
        keep_temp_files: bool = False
    ):
        """
        参数说明
        ----------
        tf_python_exe        : TensorFlow 环境里的 python.exe 路径
        tf_infer_script      : tf_infer.py 的路径
        classifier_model_path: .h5 分类模型路径
        reid_model_path      : ckpt.t7 路径
        sequence_length      : 序列长度，默认 80
        feature_dim          : 单帧特征维度，默认 512
        use_cuda             : 是否使用 CUDA 提取图像特征
        keep_temp_files      : 是否保留临时特征文件，默认 False
        """
        self.base_dir = os.path.dirname(os.path.abspath(__file__))

        self.tf_python_exe = tf_python_exe
        self.tf_infer_script = tf_infer_script
        self.classifier_model_path = classifier_model_path
        self.sequence_length = int(sequence_length)
        self.feature_dim = int(feature_dim)
        self.keep_temp_files = bool(keep_temp_files)

        if use_cuda is None:
            use_cuda = torch.cuda.is_available()
        self.use_cuda = bool(use_cuda)

        if reid_model_path is None:
            reid_model_path = os.path.join(
                self.base_dir,
                "tracking",
                "deep_sort",
                "deep",
                "checkpoint",
                "ckpt.t7"
            )
        self.reid_model_path = reid_model_path

        # 基础文件检查
        if not os.path.isfile(self.tf_python_exe):
            raise FileNotFoundError(f"未找到 TensorFlow 环境的 python.exe：{self.tf_python_exe}")

        if not os.path.isfile(self.tf_infer_script):
            raise FileNotFoundError(f"未找到 tf_infer.py：{self.tf_infer_script}")

        if not os.path.isfile(self.classifier_model_path):
            raise FileNotFoundError(f"未找到分类模型文件：{self.classifier_model_path}")

        if not os.path.isfile(self.reid_model_path):
            raise FileNotFoundError(f"未找到图像特征提取模型文件：{self.reid_model_path}")

        self.id2label = {v: k for k, v in self.DEFAULT_LABEL_MAP.items()}

        self._setup_import_path()
        self.feature_extractor = self._load_feature_extractor()

        print(
            f"[Classifier] initialized | "
            f"tf_python={self.tf_python_exe} | "
            f"tf_infer={self.tf_infer_script} | "
            f"classifier_model={self.classifier_model_path} | "
            f"reid_model={self.reid_model_path} | "
            f"use_cuda={self.use_cuda}"
        )

    def _setup_import_path(self):
        tracking_dir = os.path.join(self.base_dir, "tracking")
        if tracking_dir not in sys.path:
            sys.path.append(tracking_dir)

    def _load_feature_extractor(self):
        from deep_sort.deep.feature_extractor import Extractor
        extractor = Extractor(self.reid_model_path, use_cuda=self.use_cuda)
        return extractor

    @staticmethod
    def _list_clip_images(clip_dir: str) -> List[str]:
        patterns = ["*.jpg", "*.jpeg", "*.png", "*.bmp"]
        files = []
        for p in patterns:
            files.extend(glob.glob(os.path.join(clip_dir, p)))
        return sorted(files)

    # @staticmethod
    # def _read_images(image_paths: List[str]) -> List[np.ndarray]:
    #     imgs = []
    #     for p in image_paths:
    #         img = cv2.imread(p)
    #         if img is None:
    #             print(f"[WARN] 图像读取失败，已跳过：{p}")
    #             continue
    #         imgs.append(img)
    #     return imgs
    @staticmethod
    def _safe_imread(img_path: str):
        """
        兼容 Windows 中文路径的图像读取。
        成功返回 BGR 图像，失败返回 None。
        """
        try:
            data = np.fromfile(img_path, dtype=np.uint8)
            if data is None or data.size == 0:
                return None
            img = cv2.imdecode(data, cv2.IMREAD_COLOR)
            return img
        except Exception:
            return None


    @classmethod
    def _read_images(cls, image_paths):
        """
        读取图像列表，兼容中文路径。
        """
        imgs = []
        for p in image_paths:
            img = cls._safe_imread(p)
            if img is None:
                print(f"[WARN] 图像读取失败，已跳过：{p}")
                continue
            imgs.append(img)
        return imgs

    def _fix_feature_sequence_length(self, feature_seq: np.ndarray) -> np.ndarray:
        """
        把特征序列修正到固定长度 sequence_length
        正常情况下你现在的 clip 就应该是 80 张图
        """
        feature_seq = np.asarray(feature_seq, dtype=np.float32)

        if feature_seq.ndim != 2:
            raise ValueError(f"feature_seq 维度错误，实际为 {feature_seq.shape}")

        n, d = feature_seq.shape
        if d != self.feature_dim:
            raise ValueError(f"feature_dim 不匹配，期望 {self.feature_dim}，实际为 {d}")

        if n == self.sequence_length:
            return feature_seq

        if n > self.sequence_length:
            return feature_seq[:self.sequence_length]

        if n == 0:
            return np.zeros((self.sequence_length, self.feature_dim), dtype=np.float32)

        # 不足 80 时，重复最后一帧特征补齐
        pad_count = self.sequence_length - n
        last_feat = feature_seq[-1:]
        pad_feats = np.repeat(last_feat, pad_count, axis=0)
        return np.concatenate([feature_seq, pad_feats], axis=0).astype(np.float32)

    def extract_features_from_images(self, images: List[np.ndarray]) -> np.ndarray:
        """
        直接从图像列表提取特征，返回 (80, 512)
        """
        if len(images) == 0:
            raise ValueError("输入图像列表为空，无法提取特征")

        feature_seq = self.feature_extractor(images)
        feature_seq = np.asarray(feature_seq, dtype=np.float32)

        if feature_seq.ndim != 2:
            raise ValueError(f"提取出的特征形状异常：{feature_seq.shape}")

        feature_seq = self._fix_feature_sequence_length(feature_seq)
        return feature_seq

    def _run_tf_inference(self, feature_seq: np.ndarray) -> Dict:
        """
        调用 TensorFlow 环境里的 tf_infer.py 做分类
        """
        feature_seq = self._fix_feature_sequence_length(feature_seq)

        tmp_dir = tempfile.mkdtemp(prefix="action_cls_")
        feature_path = os.path.join(tmp_dir, "feature_seq.npy")

        np.save(feature_path, feature_seq)

        cmd = [
            self.tf_python_exe,
            self.tf_infer_script,
            "--feature_path", feature_path,
            "--model_path", self.classifier_model_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )

            if result.returncode != 0:
                raise RuntimeError(
                    "TensorFlow 分类子进程执行失败。\n"
                    f"returncode={result.returncode}\n"
                    f"stdout=\n{result.stdout}\n"
                    f"stderr=\n{result.stderr}"
                )

            stdout_text = result.stdout.strip()
            if not stdout_text:
                raise RuntimeError("TensorFlow 分类子进程没有返回任何结果")

            # 取最后一行 JSON
            lines = [line.strip() for line in stdout_text.splitlines() if line.strip()]
            json_line = lines[-1]
            cls_result = json.loads(json_line)

            return cls_result

        finally:
            if not self.keep_temp_files:
                try:
                    if os.path.isfile(feature_path):
                        os.remove(feature_path)
                    if os.path.isdir(tmp_dir):
                        os.rmdir(tmp_dir)
                except Exception:
                    pass

    def classify_feature_sequence(self, feature_seq: np.ndarray) -> Dict:
        """
        对已提取好的 (80, 512) 特征序列做分类
        """
        feature_seq = self._fix_feature_sequence_length(feature_seq)
        result = self._run_tf_inference(feature_seq)
        return result

    def classify_clip_dir(self, clip_dir: str) -> Dict:
        """
        对一个 clip 文件夹做：
        图像读取 -> 特征提取 -> 外部 TensorFlow 分类
        """
        if not os.path.isdir(clip_dir):
            raise FileNotFoundError(f"未找到 clip 文件夹：{clip_dir}")

        image_paths = self._list_clip_images(clip_dir)
        if len(image_paths) == 0:
            raise ValueError(f"clip 文件夹下没有图像：{clip_dir}")

        images = self._read_images(image_paths)
        if len(images) == 0:
            raise ValueError(f"clip 图像读取后为空：{clip_dir}")

        feature_seq = self.extract_features_from_images(images)
        cls_result = self.classify_feature_sequence(feature_seq)

        cls_result.update({
            "clip_dir": clip_dir,
            "num_images": len(images)
        })
        return cls_result

    @staticmethod
    def build_clip_dir(
        person_clips_root: str,
        view_name: str,
        track_id: int,
        start_frame: int,
        end_frame: int
    ) -> str:
        """
        根据 extractor 的目录命名规则，定位 clip 文件夹
        """
        return os.path.join(
            person_clips_root,
            str(view_name),
            f"id_{int(track_id):03d}",
            f"clip_{int(start_frame):06d}_{int(end_frame):06d}"
        )

    def classify_saved_clip_info(self, saved_info: Dict, person_clips_root: str) -> Dict:
        """
        直接接收 extractor 返回的保存信息 dict，然后自动定位 clip 并分类
        saved_info 应包含：
            view_name
            track_id
            start_frame
            end_frame
        """
        clip_dir = self.build_clip_dir(
            person_clips_root=person_clips_root,
            view_name=saved_info["view_name"],
            track_id=saved_info["track_id"],
            start_frame=saved_info["start_frame"],
            end_frame=saved_info["end_frame"]
        )

        result = self.classify_clip_dir(clip_dir)
        result.update({
            "view_name": saved_info["view_name"],
            "track_id": saved_info["track_id"],
            "start_frame": saved_info["start_frame"],
            "end_frame": saved_info["end_frame"]
        })
        return result