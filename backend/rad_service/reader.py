# backend/rad_service/reader.py
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import re
import time
from typing import Optional, Dict, Any

from common_sensor.serial_reader import BaseSerialSensorReader


class ThermalRadiationReader(BaseSerialSensorReader):
    """
    热辐射传感器读取器

    支持以下常见串口输出格式：
    1. JSON:
       {"black_globe_temperature": 31.2}
       {"radiation_temperature": 29.6, "radiation_flux": 412.5}

    2. 键值对:
       BGT=31.2
       RT=29.6,RAD=412.5
       T=31.2

    3. CSV:
       31.2
       31.2,412.5
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
                    "black_globe_temperature": None,
                    "radiation_temperature": None,
                    "radiation_flux": None,
                }

                if "black_globe_temperature" in obj:
                    record["black_globe_temperature"] = float(obj["black_globe_temperature"])

                if "radiation_temperature" in obj:
                    record["radiation_temperature"] = float(obj["radiation_temperature"])

                if "radiation_flux" in obj:
                    record["radiation_flux"] = float(obj["radiation_flux"])

                if "temperature" in obj and record["black_globe_temperature"] is None:
                    record["black_globe_temperature"] = float(obj["temperature"])

                if (
                    record["black_globe_temperature"] is None
                    and record["radiation_temperature"] is None
                    and record["radiation_flux"] is None
                ):
                    return None

                return record
            except Exception:
                pass

        # 2) BGT=31.2 / RT=29.6 / RAD=412.5
        record = {
            "timestamp": time.time(),
            "black_globe_temperature": None,
            "radiation_temperature": None,
            "radiation_flux": None,
        }

        patterns = [
            (r"\bBGT\s*=\s*([-\d.]+)", "black_globe_temperature"),
            (r"\bT\s*=\s*([-\d.]+)", "black_globe_temperature"),
            (r"\bRT\s*=\s*([-\d.]+)", "radiation_temperature"),
            (r"\bRAD\s*=\s*([-\d.]+)", "radiation_flux"),
            (r"\bFLUX\s*=\s*([-\d.]+)", "radiation_flux"),
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

        # 3) CSV 单值/双值
        parts = [x.strip() for x in line.split(",")]
        try:
            if len(parts) == 1:
                value = float(parts[0])
                return {
                    "timestamp": time.time(),
                    "black_globe_temperature": value,
                    "radiation_temperature": None,
                    "radiation_flux": None,
                }

            if len(parts) >= 2:
                return {
                    "timestamp": time.time(),
                    "black_globe_temperature": float(parts[0]),
                    "radiation_temperature": None,
                    "radiation_flux": float(parts[1]),
                }
        except Exception:
            pass

        return None