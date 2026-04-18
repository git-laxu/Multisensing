# backend/temp_service/main.py
# -*- coding: utf-8 -*-

from __future__ import annotations

import asyncio
import queue
import threading
import time
import traceback
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from .reader import TemperatureHumidityReader
from .artifact_saver import TempSessionArtifactSaver

BASE_DIR = Path(__file__).resolve().parent
SAVE_DIR = BASE_DIR / "temp_data"
SAVE_DIR.mkdir(parents=True, exist_ok=True)


class TempStartRequest(BaseModel):
    port: str
    baudrate: int = 9600
    project_name: str = "default_project"
    save_options: Dict[str, Any] = {}


class TempService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        self._running = False
        self._stop_event = threading.Event()
        self._queue: queue.Queue = queue.Queue(maxsize=1000)

        self._reader: Optional[TemperatureHumidityReader] = None
        self._thread: Optional[threading.Thread] = None
        self._artifact_saver: Optional[TempSessionArtifactSaver] = None

        self._websockets: List[WebSocket] = []
        self._ws_lock = asyncio.Lock()

        self._project_name = "default_project"
        self._session_id: Optional[str] = None
        self._session_root: Optional[Path] = None
        self._save_options: Dict[str, Any] = {}

        self._latest_data: Optional[Dict[str, Any]] = None
        self._broadcast_task: Optional[asyncio.Task] = None

    @property
    def is_running(self) -> bool:
        return self._running

    def _reader_worker(self):
        def on_data(record: Dict[str, Any]):
            self._latest_data = record
            try:
                self._queue.put_nowait(record)
            except queue.Full:
                try:
                    self._queue.get_nowait()
                    self._queue.put_nowait(record)
                except Exception:
                    pass

            if self._artifact_saver:
                self._artifact_saver.save_record(record)

        self._reader.read_forever(on_data=on_data)

    async def _broadcast_loop(self):
        while not self._stop_event.is_set():
            try:
                if self._latest_data is not None:
                    payload = {
                        "type": "temperature_humidity_data",
                        "timestamp": self._latest_data.get("timestamp", time.time()),
                        "air_temperature": self._latest_data.get("air_temperature"),
                        "relative_humidity": self._latest_data.get("relative_humidity"),
                        "stats": {
                            "session_id": self._session_id,
                        }
                    }

                    async with self._ws_lock:
                        disconnected = []
                        for ws in self._websockets[:]:
                            try:
                                await ws.send_json(payload)
                            except Exception:
                                disconnected.append(ws)

                        for ws in disconnected:
                            if ws in self._websockets:
                                self._websockets.remove(ws)

                await asyncio.sleep(0.5)

            except Exception as e:
                print(f"[TEMP] broadcast error: {e}")
                await asyncio.sleep(0.5)

    async def start(self, config: Dict[str, Any]) -> dict:
        if self._running:
            return {
                "status": "already_running",
                "message": "温湿度采集已在运行",
                "project_name": self._project_name,
                "session_id": self._session_id,
            }

        try:
            self._project_name = config.get("project_name", "default_project")
            self._save_options = config.get("save_options", {})

            self._artifact_saver = TempSessionArtifactSaver(
                base_save_dir=SAVE_DIR,
                project_name=self._project_name,
                save_options=self._save_options,
            )

            session_paths = self._artifact_saver.start_session(
                extra_meta={
                    "port": config.get("port"),
                    "baudrate": config.get("baudrate", 9600),
                }
            )

            self._session_id = self._artifact_saver.session_id
            self._session_root = session_paths["session_root"]

            self._reader = TemperatureHumidityReader(
                port=config["port"],
                baudrate=int(config.get("baudrate", 9600)),
            )

            self._stop_event.clear()
            self._running = True

            self._thread = threading.Thread(target=self._reader_worker, daemon=True)
            self._thread.start()

            self._broadcast_task = asyncio.create_task(self._broadcast_loop())

            return {
                "status": "started",
                "message": "温湿度采集已启动",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
                "save_options": self._save_options,
            }

        except Exception as e:
            self._running = False
            self._stop_event.set()
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"启动温湿度采集失败: {str(e)}")

    async def stop(self) -> dict:
        if not self._running:
            return {
                "status": "already_stopped",
                "message": "温湿度采集已停止",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
            }

        try:
            self._stop_event.set()
            self._running = False

            if self._reader:
                self._reader.stop()

            if self._thread and self._thread.is_alive():
                self._thread.join(timeout=2.0)

            if self._broadcast_task:
                self._broadcast_task.cancel()
                self._broadcast_task = None

            if self._artifact_saver:
                self._artifact_saver.close()

            async with self._ws_lock:
                for ws in self._websockets[:]:
                    try:
                        await ws.close()
                    except Exception:
                        pass
                self._websockets.clear()

            return {
                "status": "stopped",
                "message": "温湿度采集已停止",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
            }

        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"停止温湿度采集失败: {str(e)}")

    async def connect_websocket(self, websocket: WebSocket):
        async with self._ws_lock:
            self._websockets.append(websocket)

    async def disconnect_websocket(self, websocket: WebSocket):
        async with self._ws_lock:
            if websocket in self._websockets:
                self._websockets.remove(websocket)

    def get_status(self) -> dict:
        return {
            "running": self._running,
            "websocket_connections": len(self._websockets),
            "project_name": self._project_name,
            "session_id": self._session_id,
            "session_root": str(self._session_root) if self._session_root else None,
            "save_options": self._save_options,
            "reader": self._reader.get_status() if self._reader else None,
            "latest_data": self._latest_data,
        }


app = FastAPI(title="温湿度采集服务", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

temp_service = TempService()


@app.get("/")
async def root():
    return {"message": "温湿度采集服务", "version": "1.0.0"}


@app.get("/status")
async def get_status():
    return temp_service.get_status()


@app.post("/start")
async def start_temp(request: TempStartRequest):
    return await temp_service.start(request.dict())


@app.post("/stop")
async def stop_temp():
    return await temp_service.stop()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await temp_service.connect_websocket(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data == "status":
                await websocket.send_json(temp_service.get_status())
    except WebSocketDisconnect:
        print("[TEMP] WebSocket断开")
    except Exception as e:
        print(f"[TEMP] WebSocket错误: {e}")
    finally:
        await temp_service.disconnect_websocket(websocket)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004, log_level="info")