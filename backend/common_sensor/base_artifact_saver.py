# backend/common_sensor/base_artifact_saver.py
# -*- coding: utf-8 -*-

from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional


class BaseSensorSessionArtifactSaver:
    DEFAULT_SAVE_OPTIONS = {
        "save_csv": True,
        "save_jsonl": False,
    }

    def __init__(
        self,
        base_save_dir: Path,
        project_name: str,
        sensor_type: str,
        save_options: Optional[Dict[str, Any]] = None,
    ):
        self.base_save_dir = Path(base_save_dir)
        self.base_save_dir.mkdir(parents=True, exist_ok=True)

        self.project_name = self._normalize_project_name(project_name)
        self.sensor_type = sensor_type

        options = dict(self.DEFAULT_SAVE_OPTIONS)
        if save_options:
            options.update(save_options)
        self.save_options = options

        self.session_id: Optional[str] = None
        self.session_root: Optional[Path] = None
        self.paths: Dict[str, Path] = {}

        self._csv_file = None
        self._csv_writer = None
        self._jsonl_file = None
        self._fieldnames = None

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
            "data": self.session_root / "data",
            "logs": self.session_root / "logs",
        }

        for p in self.paths.values():
            p.mkdir(parents=True, exist_ok=True)

        meta = {
            "project_name": self.project_name,
            "sensor_type": self.sensor_type,
            "session_id": self.session_id,
            "started_at": datetime.now().isoformat(),
            "save_options": self.save_options,
        }
        if extra_meta:
            meta.update(extra_meta)

        with open(self.session_root / "session_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        return self.paths

    def save_record(self, record: Dict[str, Any]):
        if not self.session_root:
            return

        if self.save_options.get("save_csv", True):
            self._save_csv(record)

        if self.save_options.get("save_jsonl", False):
            self._save_jsonl(record)

    def _save_csv(self, record: Dict[str, Any]):
        csv_path = self.paths["data"] / f"{self.sensor_type}_data.csv"

        if self._csv_file is None:
            self._csv_file = open(csv_path, "a", newline="", encoding="utf-8-sig")
            self._fieldnames = list(record.keys())
            self._csv_writer = csv.DictWriter(self._csv_file, fieldnames=self._fieldnames)

            if csv_path.stat().st_size == 0:
                self._csv_writer.writeheader()

        self._csv_writer.writerow(record)
        self._csv_file.flush()

    def _save_jsonl(self, record: Dict[str, Any]):
        jsonl_path = self.paths["logs"] / f"{self.sensor_type}_data.jsonl"

        if self._jsonl_file is None:
            self._jsonl_file = open(jsonl_path, "a", encoding="utf-8")

        self._jsonl_file.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._jsonl_file.flush()

    def close(self):
        try:
            if self._csv_file is not None:
                self._csv_file.close()
                self._csv_file = None
        except Exception:
            pass

        try:
            if self._jsonl_file is not None:
                self._jsonl_file.close()
                self._jsonl_file = None
        except Exception:
            pass