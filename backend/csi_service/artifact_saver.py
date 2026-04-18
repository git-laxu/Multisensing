# -*- coding: utf-8 -*-
"""
CSI 采集产物统一保存器
职责：
1. 为每次采集创建独立 session 目录
2. 根据保存开关返回原始数据 / 切片数据 / 图像数据的保存目录
3. 保存 session 元信息
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional


class CSISessionArtifactSaver:
    DEFAULT_SAVE_OPTIONS = {
        "save_raw_data": True,          # 保存原始CSI包/原始流
        "save_processed_data": True,    # 保存预处理后的row数据
        "save_fragment_data": True,     # 保存fragment/slice数据
        "save_fragment_images": True,   # 保存切片转图像
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

        self.session_id: Optional[str] = None
        self.session_root: Optional[Path] = None
        self.paths: Dict[str, Path] = {}

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
            "raw": self.session_root / "raw",
            "processed": self.session_root / "processed",
            "processed_rows": self.session_root / "processed" / "processed_rows",
            "fragment_slice": self.session_root / "processed" / "fragment_slice",
            "fragment_images": self.session_root / "processed" / "fragment_images",
            "logs": self.session_root / "logs",
        }

        for p in self.paths.values():
            p.mkdir(parents=True, exist_ok=True)

        meta = {
            "project_name": self.project_name,
            "session_id": self.session_id,
            "started_at": datetime.now().isoformat(),
            "save_options": self.save_options,
            "sensor_type": "csi",
        }
        if extra_meta:
            meta.update(extra_meta)

        with open(self.session_root / "session_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        return self.paths