# backend/temp_service/reader.py
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import re
import time
from typing import Optional, Dict, Any

from common_sensor.serial_reader import BaseSerialSensorReader


class TemperatureHumidityReader(BaseSerialSensorReader):
    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        line = line.strip()
        if not line:
            return None

        # JSON 格式
        if line.startswith("{") and line.endswith("}"):
            try:
                obj = json.loads(line)
                temp = float(obj.get("temperature"))
                hum = float(obj.get("humidity"))
                return {
                    "timestamp": time.time(),
                    "air_temperature": temp,
                    "relative_humidity": hum,
                }
            except Exception:
                pass

        # T=24.6,H=58.2
        m = re.match(r".*?T\s*=\s*([-\d.]+)\s*[,; ]\s*H\s*=\s*([-\d.]+).*", line, re.I)
        if m:
            return {
                "timestamp": time.time(),
                "air_temperature": float(m.group(1)),
                "relative_humidity": float(m.group(2)),
            }

        # 24.6,58.2
        parts = [x.strip() for x in line.split(",")]
        if len(parts) >= 2:
            try:
                return {
                    "timestamp": time.time(),
                    "air_temperature": float(parts[0]),
                    "relative_humidity": float(parts[1]),
                }
            except Exception:
                return None

        return None