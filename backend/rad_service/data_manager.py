# backend/rad_service/data_manager.py
# -*- coding: utf-8 -*-

from __future__ import annotations

from pathlib import Path
from common_sensor.base_data_manager import BaseSensorDataManager


class RadDataManager(BaseSensorDataManager):
    def __init__(self, base_save_dir: Path):
        super().__init__(base_save_dir=base_save_dir, sensor_type="thermal_radiation")