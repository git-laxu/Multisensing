# backend/common_sensor/serial_reader.py
# -*- coding: utf-8 -*-

from __future__ import annotations

import time
import threading
from typing import Optional, Callable, Any, Dict

import serial


class BaseSerialSensorReader:
    """
    通用 USB 串口传感器读取器
    适用于：
    1. USB 转串口设备
    2. CDC ACM 类串口设备
    3. 返回文本行 / CSV 行 / JSON 行的传感器

    子类只需要重写 parse_line()
    """

    def __init__(
        self,
        port: str,
        baudrate: int = 9600,
        timeout: float = 1.0,
        encoding: str = "utf-8",
    ):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.encoding = encoding

        self._ser: Optional[serial.Serial] = None
        self._running = False
        self._lock = threading.Lock()

        self.total_received = 0
        self.last_data_time: Optional[float] = None

    def open(self):
        with self._lock:
            if self._ser is not None and self._ser.is_open:
                return

            self._ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
            )

    def close(self):
        with self._lock:
            self._running = False
            if self._ser is not None:
                try:
                    if self._ser.is_open:
                        self._ser.close()
                finally:
                    self._ser = None

    def stop(self):
        self.close()

    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        """
        子类重写
        输入一行设备输出，返回标准化 dict
        """
        raise NotImplementedError

    def read_forever(self, on_data: Callable[[Dict[str, Any]], None]):
        self.open()
        self._running = True

        while self._running:
            try:
                raw = self._ser.readline() if self._ser else b""
                if not raw:
                    continue

                text = raw.decode(self.encoding, errors="ignore").strip()
                if not text:
                    continue

                parsed = self.parse_line(text)
                if parsed is None:
                    continue

                self.total_received += 1
                self.last_data_time = time.time()
                on_data(parsed)

            except Exception as e:
                print(f"[SerialReader] read error on {self.port}: {e}")
                time.sleep(0.2)

    def get_status(self) -> Dict[str, Any]:
        return {
            "port": self.port,
            "baudrate": self.baudrate,
            "running": self._running,
            "total_received": self.total_received,
            "last_data_time": self.last_data_time,
        }