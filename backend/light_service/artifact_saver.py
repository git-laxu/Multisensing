# backend/light_service/artifact_saver.py
# -*- coding: utf-8 -*-

from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, Optional

from common_sensor.base_artifact_saver import BaseSensorSessionArtifactSaver


class LightSessionArtifactSaver(BaseSensorSessionArtifactSaver):
    DEFAULT_SAVE_OPTIONS = {
        "save_csv": True,
        "save_jsonl": False,
    }

    def __init__(
        self,
        base_save_dir: Path,
        project_name: str,
        save_options: Optional[Dict[str, Any]] = None,
    ):
        options = dict(self.DEFAULT_SAVE_OPTIONS)
        if save_options:
            options.update(save_options)

        super().__init__(
            base_save_dir=base_save_dir,
            project_name=project_name,
            sensor_type="illuminance",
            save_options=options,
        )