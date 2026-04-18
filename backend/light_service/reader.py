# backend/light_service/reader.py
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import re
import time
from typing import Optional, Dict, Any

from common_sensor.serial_reader import BaseSerialSensorReader


class IlluminanceReader(BaseSerialSensorReader):
    """
    照明/照度传感器读取器

    支持以下常见串口输出格式：
    1. JSON:
       {"illuminance": 523.4}
       {"illuminance": 523.4, "color_temperature": 4100}

    2. 键值对:
       LUX=523.4
       LUX=523.4,CCT=4100
       ILL=523.4

    3. CSV:
       523.4
       523.4,4100
    """

    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        line = line.strip()
        if not line:
            return None

        # 1) JSON 格式
        if line.startswith("{") and line.endswith("}"):
            try:
                obj = json.loads(line)

                record = {
                    "timestamp": time.time(),
                    "illuminance": None,
                    "color_temperature": None,
                    "spectral_value": None,
                }

                if "illuminance" in obj:
                    record["illuminance"] = float(obj["illuminance"])

                if "lux" in obj and record["illuminance"] is None:
                    record["illuminance"] = float(obj["lux"])

                if "color_temperature" in obj:
                    record["color_temperature"] = float(obj["color_temperature"])

                if "cct" in obj and record["color_temperature"] is None:
                    record["color_temperature"] = float(obj["cct"])

                if "spectral_value" in obj:
                    record["spectral_value"] = float(obj["spectral_value"])

                if (
                    record["illuminance"] is None
                    and record["color_temperature"] is None
                    and record["spectral_value"] is None
                ):
                    return None

                return record
            except Exception:
                pass

        # 2) 键值对
        record = {
            "timestamp": time.time(),
            "illuminance": None,
            "color_temperature": None,
            "spectral_value": None,
        }

        patterns = [
            (r"\bLUX\s*=\s*([-\d.]+)", "illuminance"),
            (r"\bILL\s*=\s*([-\d.]+)", "illuminance"),
            (r"\bCCT\s*=\s*([-\d.]+)", "color_temperature"),
            (r"\bCT\s*=\s*([-\d.]+)", "color_temperature"),
            (r"\bSPEC\s*=\s*([-\d.]+)", "spectral_value"),
        ]

        matched_any = False
        for pattern, key in patterns:
            m = re.search(pattern, line, re.I)
            if m:
                try:
                    record[key] = float(m.group(1))
                    matched_any = True
                except Exception:
                    pass

        if matched_any:
            return record

        # 3) CSV
        parts = [x.strip() for x in line.split(",")]
        try:
            if len(parts) == 1:
                value = float(parts[0])
                return {
                    "timestamp": time.time(),
                    "illuminance": value,
                    "color_temperature": None,
                    "spectral_value": None,
                }

            if len(parts) >= 2:
                return {
                    "timestamp": time.time(),
                    "illuminance": float(parts[0]),
                    "color_temperature": float(parts[1]),
                    "spectral_value": None,
                }
        except Exception:
            pass

        return None