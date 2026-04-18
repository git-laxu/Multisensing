# -*- coding: utf-8 -*-
"""
采集产物统一保存器
职责：
1. 为每次采集创建独立 session 目录
2. 根据保存开关落盘原始视频 / 跟踪视频 / 原始图像 / 跟踪图像
3. 保存分类结果
4. 在停止时安全释放 VideoWriter
"""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import cv2


class SessionArtifactSaver:
    DEFAULT_SAVE_OPTIONS = {
        "save_raw_video": False,
        "save_tracked_video": False,
        "save_raw_images": False,
        "save_tracked_images": False,
        "save_person_clips": True,
        "save_classification_results": False,
        "raw_image_interval": 30,
        "tracked_image_interval": 30,
        "video_fps": 20,
        "raw_video_view": "both",         # "left" / "right" / "both"
        "tracked_video_view": "right",    # "left" / "right"
        "tracked_image_views": "both",    # "left" / "right" / "both"
        "raw_image_views": "both",        # "left" / "right" / "both"
    }

    def __init__(
        self,
        base_save_dir: Path,
        project_name: str,
        save_options: Optional[Dict[str, Any]] = None
    ):
        self.base_save_dir = Path(base_save_dir)
        self.base_save_dir.mkdir(parents=True, exist_ok=True)

        self.project_name = self._normalize_project_name(project_name)

        options = dict(self.DEFAULT_SAVE_OPTIONS)
        if save_options:
            options.update(save_options)
        self.save_options = options

        # 运行期状态
        self.session_id: Optional[str] = None
        self.session_root: Optional[Path] = None
        self.paths: Dict[str, Path] = {}

        # 视频写入器
        self._raw_video_writer = None
        self._tracked_video_writer = None
        self._raw_video_path = None
        self._tracked_video_path = None

        # 分类结果文件
        self._classification_csv_path = None

    @staticmethod
    def _normalize_project_name(name: Optional[str]) -> str:
        if not name:
            return "default_project"

        name = str(name).strip()
        if not name:
            return "default_project"

        name = re.sub(r'[\\/:*?"<>|]+', "_", name)
        name = name.strip(". ")
        return name or "default_project"

    def start_session(self, extra_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Path]:
        self.session_id = datetime.now().strftime("session_%Y%m%d_%H%M%S")

        project_root = self.base_save_dir / "projects" / self.project_name
        sessions_root = project_root / "sessions"
        self.session_root = sessions_root / self.session_id

        self.paths = {
            "project_root": project_root,
            "sessions_root": sessions_root,
            "session_root": self.session_root,
            "raw_video": self.session_root / "raw_video",
            "tracked_video": self.session_root / "tracked_video",
            "raw_images_left": self.session_root / "raw_images" / "left",
            "raw_images_right": self.session_root / "raw_images" / "right",
            "tracked_images_left": self.session_root / "tracked_images" / "left",
            "tracked_images_right": self.session_root / "tracked_images" / "right",
            "person_clips": self.session_root / "person_clips",
            "logs": self.session_root / "logs",
        }

        for p in self.paths.values():
            p.mkdir(parents=True, exist_ok=True)

        meta = {
            "project_name": self.project_name,
            "session_id": self.session_id,
            "started_at": datetime.now().isoformat(),
            "save_options": self.save_options,
        }
        if extra_meta:
            meta.update(extra_meta)

        with open(self.session_root / "session_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        self._raw_video_path = self.paths["raw_video"] / "raw_video.mp4"
        tracked_name = f'{self.save_options.get("tracked_video_view", "right")}_tracked.mp4'
        self._tracked_video_path = self.paths["tracked_video"] / tracked_name
        self._classification_csv_path = self.paths["logs"] / "classification_results.csv"

        return self.paths

    @staticmethod
    def _safe_imwrite(path: Path, img, jpg_quality: int = 95) -> bool:
        try:
            if img is None:
                return False
            ok, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(jpg_quality)])
            if not ok:
                return False
            buffer.tofile(str(path))
            return True
        except Exception as e:
            print(f"[ArtifactSaver] 图像保存失败: {path} | {e}")
            return False

    @staticmethod
    def _make_writer(path: Path, frame_size, fps: int):
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        return cv2.VideoWriter(str(path), fourcc, float(fps), frame_size)

    def _ensure_raw_video_writer(self, frame):
        if self._raw_video_writer is None and frame is not None:
            h, w = frame.shape[:2]
            self._raw_video_writer = self._make_writer(
                self._raw_video_path, (w, h), int(self.save_options["video_fps"])
            )

    def _ensure_tracked_video_writer(self, frame):
        if self._tracked_video_writer is None and frame is not None:
            h, w = frame.shape[:2]
            self._tracked_video_writer = self._make_writer(
                self._tracked_video_path, (w, h), int(self.save_options["video_fps"])
            )

    def save_from_result(self, result: Dict[str, Any]):
        if not self.session_root:
            return

        frame_id = int(result.get("frame_id", 0))
        raw_frame = result.get("raw_frame")
        left_raw = result.get("left_frame_raw")
        right_raw = result.get("right_frame_raw")
        left_vis = result.get("left_vis")
        right_vis = result.get("right_vis")

        # 1) 原始视频
        if self.save_options.get("save_raw_video", False):
            raw_video_view = self.save_options.get("raw_video_view", "both")

            if raw_video_view == "both":
                raw_video_frame = raw_frame
            elif raw_video_view == "left":
                raw_video_frame = left_raw
            else:
                raw_video_frame = right_raw

            if raw_video_frame is not None:
                self._ensure_raw_video_writer(raw_video_frame)
                if self._raw_video_writer is not None:
                    self._raw_video_writer.write(raw_video_frame)

        # 2) 跟踪后视频
        if self.save_options.get("save_tracked_video", False):
            tracked_view = self.save_options.get("tracked_video_view", "right")
            tracked_frame = left_vis if tracked_view == "left" else right_vis
            if tracked_frame is not None:
                self._ensure_tracked_video_writer(tracked_frame)
                if self._tracked_video_writer is not None:
                    self._tracked_video_writer.write(tracked_frame)

        # 3) 原始左右图像（按间隔）
        if self.save_options.get("save_raw_images", False):
            interval = max(1, int(self.save_options.get("raw_image_interval", 30)))
            if frame_id % interval == 0:
                raw_views = self.save_options.get("raw_image_views", "both")
                if raw_views in ("left", "both") and left_raw is not None:
                    self._safe_imwrite(self.paths["raw_images_left"] / f"{frame_id:06d}.jpg", left_raw)
                if raw_views in ("right", "both") and right_raw is not None:
                    self._safe_imwrite(self.paths["raw_images_right"] / f"{frame_id:06d}.jpg", right_raw)

        # 4) 跟踪后左右图像（按间隔）
        if self.save_options.get("save_tracked_images", False):
            interval = max(1, int(self.save_options.get("tracked_image_interval", 30)))
            if frame_id % interval == 0:
                tracked_views = self.save_options.get("tracked_image_views", "both")
                if tracked_views in ("left", "both") and left_vis is not None:
                    self._safe_imwrite(self.paths["tracked_images_left"] / f"{frame_id:06d}.jpg", left_vis)
                if tracked_views in ("right", "both") and right_vis is not None:
                    self._safe_imwrite(self.paths["tracked_images_right"] / f"{frame_id:06d}.jpg", right_vis)

    def save_classification_result(self, cls_result: Dict[str, Any]):
        if not self.session_root:
            return
        if not self.save_options.get("save_classification_results", False):
            return

        csv_path = self._classification_csv_path
        file_exists = csv_path.exists()

        with open(csv_path, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow([
                    "view_name", "track_id", "start_frame", "end_frame",
                    "pred_label", "confidence"
                ])
            writer.writerow([
                cls_result.get("view_name", ""),
                cls_result.get("track_id", ""),
                cls_result.get("start_frame", ""),
                cls_result.get("end_frame", ""),
                cls_result.get("pred_label", ""),
                cls_result.get("confidence", ""),
            ])

    def close(self):
        try:
            if self._raw_video_writer is not None:
                self._raw_video_writer.release()
                self._raw_video_writer = None
        except Exception:
            pass

        try:
            if self._tracked_video_writer is not None:
                self._tracked_video_writer.release()
                self._tracked_video_writer = None
        except Exception:
            pass