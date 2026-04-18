# -*- coding: utf-8 -*-
"""
CSI 采集数据管理器
职责：
1. 扫描 csi_data/projects/<project_name>/sessions/<session_id> 目录
2. 返回项目列表
3. 返回某个项目下的 session 列表
4. 删除 session / 删除项目
5. 打包下载 session / 项目
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional


class CSIDataManager:
    def __init__(self, base_save_dir: Path):
        self.base_save_dir = Path(base_save_dir)
        self.projects_root = self.base_save_dir / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)

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

    @staticmethod
    def _dir_size_bytes(path: Path) -> int:
        total = 0
        if not path.exists():
            return 0
        for p in path.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except Exception:
                    pass
        return total

    @staticmethod
    def _count_files(path: Path, pattern: str = "*") -> int:
        if not path.exists():
            return 0
        return sum(1 for p in path.rglob(pattern) if p.is_file())

    @staticmethod
    def _iso_or_none(ts: Optional[float]) -> Optional[str]:
        if ts is None:
            return None
        try:
            return datetime.fromtimestamp(ts).isoformat()
        except Exception:
            return None

    def _read_json(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _project_path(self, project_name: str) -> Path:
        return self.projects_root / self._normalize_project_name(project_name)

    def _sessions_path(self, project_name: str) -> Path:
        return self._project_path(project_name) / "sessions"

    def _session_path(self, project_name: str, session_id: str) -> Path:
        return self._sessions_path(project_name) / session_id

    def list_projects(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        if not self.projects_root.exists():
            return results

        for project_dir in sorted(self.projects_root.iterdir(), key=lambda p: p.name.lower()):
            if not project_dir.is_dir():
                continue

            sessions_dir = project_dir / "sessions"
            session_dirs = [p for p in sessions_dir.iterdir()] if sessions_dir.exists() else []
            session_dirs = [p for p in session_dirs if p.is_dir()]

            total_size_bytes = self._dir_size_bytes(project_dir)

            try:
                project_ctime = project_dir.stat().st_mtime
            except Exception:
                project_ctime = None

            results.append({
                "project_name": project_dir.name,
                "project_path": str(project_dir),
                "created_at": self._iso_or_none(project_ctime),
                "session_count": len(session_dirs),
                "total_size_bytes": total_size_bytes,
                "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
                "sensor_type": "csi",
            })

        return results

    def list_sessions(self, project_name: str) -> List[Dict[str, Any]]:
        sessions_dir = self._sessions_path(project_name)
        if not sessions_dir.exists():
            return []

        results: List[Dict[str, Any]] = []

        session_dirs = [p for p in sessions_dir.iterdir() if p.is_dir()]
        session_dirs.sort(key=lambda p: p.name, reverse=True)

        for session_dir in session_dirs:
            meta = self._read_json(session_dir / "session_meta.json")

            raw_dir = session_dir / "raw"
            processed_rows_dir = session_dir / "processed" / "processed_rows"
            fragment_slice_dir = session_dir / "processed" / "fragment_slice"
            fragment_images_dir = session_dir / "processed" / "fragment_images"

            total_size_bytes = self._dir_size_bytes(session_dir)

            try:
                session_mtime = session_dir.stat().st_mtime
            except Exception:
                session_mtime = None

            results.append({
                "session_id": session_dir.name,
                "session_name": session_dir.name,
                "session_path": str(session_dir),
                "created_at": meta.get("started_at") or self._iso_or_none(session_mtime),
                "project_name": meta.get("project_name", self._normalize_project_name(project_name)),
                "save_options": meta.get("save_options", {}),
                "sensor_type": "csi",
                "total_size_bytes": total_size_bytes,
                "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
                "artifacts": {
                    "raw_file_count": self._count_files(raw_dir),
                    "processed_row_file_count": self._count_files(processed_rows_dir),
                    "fragment_slice_file_count": self._count_files(fragment_slice_dir),
                    "fragment_image_file_count": self._count_files(fragment_images_dir),
                    "has_raw_data": raw_dir.exists(),
                    "has_fragment_data": fragment_slice_dir.exists(),
                    "has_fragment_images": fragment_images_dir.exists(),
                }
            })

        return results

    def get_session_info(self, project_name: str, session_id: str) -> Dict[str, Any]:
        sessions = self.list_sessions(project_name)
        for s in sessions:
            if s["session_id"] == session_id:
                return s
        raise FileNotFoundError(f"未找到 session: {project_name}/{session_id}")

    def delete_session(self, project_name: str, session_id: str) -> Dict[str, Any]:
        session_path = self._session_path(project_name, session_id)
        if not session_path.exists():
            raise FileNotFoundError(f"未找到 session 目录：{session_path}")

        shutil.rmtree(session_path, ignore_errors=False)

        return {
            "success": True,
            "message": "CSI session 删除成功",
            "project_name": self._normalize_project_name(project_name),
            "session_id": session_id,
            "sensor_type": "csi",
        }

    def delete_project(self, project_name: str) -> Dict[str, Any]:
        project_path = self._project_path(project_name)
        if not project_path.exists():
            raise FileNotFoundError(f"未找到项目目录：{project_path}")

        shutil.rmtree(project_path, ignore_errors=False)

        return {
            "success": True,
            "message": "CSI 项目删除成功",
            "project_name": self._normalize_project_name(project_name),
            "sensor_type": "csi",
        }

    @staticmethod
    def _zip_directory(src_dir: Path, zip_path: Path):
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in src_dir.rglob("*"):
                if p.is_file():
                    arcname = p.relative_to(src_dir.parent)
                    zf.write(p, arcname)

    def build_session_zip(self, project_name: str, session_id: str) -> Path:
        session_path = self._session_path(project_name, session_id)
        if not session_path.exists():
            raise FileNotFoundError(f"未找到 session 目录：{session_path}")

        fd, tmp_zip = tempfile.mkstemp(
            prefix=f"{self._normalize_project_name(project_name)}_{session_id}_",
            suffix=".zip"
        )
        os.close(fd)
        zip_path = Path(tmp_zip)

        self._zip_directory(session_path, zip_path)
        return zip_path

    def build_project_zip(self, project_name: str) -> Path:
        project_path = self._project_path(project_name)
        if not project_path.exists():
            raise FileNotFoundError(f"未找到项目目录：{project_path}")

        fd, tmp_zip = tempfile.mkstemp(
            prefix=f"{self._normalize_project_name(project_name)}_all_",
            suffix=".zip"
        )
        os.close(fd)
        zip_path = Path(tmp_zip)

        self._zip_directory(project_path, zip_path)
        return zip_path