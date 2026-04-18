# -*- coding: utf-8 -*-
"""
CSI采集后端服务
提供HTTP API启动/停止CSI采集，并通过WebSocket推送实时数据
"""
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
import numpy as np

# ============================================================================
# 配置
# ============================================================================
HOST = "0.0.0.0"
PORT = 5001  # Linux -> Windows CSI 数据接收端口

BASE_DIR = Path(__file__).resolve().parent
SAVE_DIR = BASE_DIR / "csi_data"
SAVE_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# 导入模块
# ============================================================================
from .csi_receiver import CSIReceiver
from .csi_preprocessor import CSIRealtimeProcessor
from .csi_fragment_slicer import CSIFragmentSlicer
from .csi_image import CSIImageConverter
from .artifact_saver import CSISessionArtifactSaver


class CSIStartRequest(BaseModel):
    project_name: str = "default_project"
    save_options: Dict[str, Any] = {}


class CSIService:
    """CSI服务管理类"""
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

        self._raw_queue: queue.Queue = queue.Queue(maxsize=10000)
        self._processed_queue: queue.Queue = queue.Queue(maxsize=20000)
        self._image_queue: queue.Queue = queue.Queue(maxsize=2000)

        self._receiver: Optional[CSIReceiver] = None
        self._processor: Optional[CSIRealtimeProcessor] = None
        self._slicer: Optional[CSIFragmentSlicer] = None
        self._image_converter: Optional[CSIImageConverter] = None
        self._artifact_saver: Optional[CSISessionArtifactSaver] = None

        self._websockets: List[WebSocket] = []
        self._ws_lock = asyncio.Lock()
        self._threads: List[threading.Thread] = []

        self._last_broadcast_time = 0
        self._broadcast_interval = 0.2

        self._project_name: str = "default_project"
        self._session_id: Optional[str] = None
        self._session_root: Optional[Path] = None
        self._save_options: Dict[str, Any] = {}

    @property
    def is_running(self) -> bool:
        return self._running

    def _init_modules(self, config: Dict[str, Any]):
        self._project_name = config.get("project_name", "default_project")

        self._save_options = dict(CSISessionArtifactSaver.DEFAULT_SAVE_OPTIONS)
        self._save_options.update(config.get("save_options", {}))

        # session saver
        self._artifact_saver = CSISessionArtifactSaver(
            base_save_dir=SAVE_DIR,
            project_name=self._project_name,
            save_options=self._save_options
        )
        session_paths = self._artifact_saver.start_session(
            extra_meta={
                "host": HOST,
                "port": PORT,
            }
        )
        self._session_id = self._artifact_saver.session_id
        self._session_root = session_paths["session_root"]

        # 根据 save_options 决定各模块写入目录
        raw_save_dir = session_paths["raw"] if self._save_options.get("save_raw_data", True) else None
        processed_save_dir = session_paths["processed_rows"] if self._save_options.get("save_processed_data", True) else None
        slice_save_dir = session_paths["fragment_slice"] if self._save_options.get("save_fragment_data", True) else None
        image_save_dir = session_paths["fragment_images"] if self._save_options.get("save_fragment_images", True) else None

        self._receiver = CSIReceiver(
            host=HOST,
            port=PORT,
            save_dir=raw_save_dir,
            raw_queue=self._raw_queue,
        )

        self._processor = CSIRealtimeProcessor(
            save_dir=processed_save_dir,
            cache_size=5000,
            process_every=50,
            denoise_window=1024,
            save_every=200,
            enable_plot=False,
        )

        self._slicer = CSIFragmentSlicer(
            save_dir=slice_save_dir,
            fragment_window=4000,
            fragment_step=1000,
            slice_window=500,
            slice_step=300,
            max_stream_cache=30000,
        )

        self._image_converter = CSIImageConverter(
            save_dir=image_save_dir,
            image_size=224,
        )

    async def start(self, config: Dict[str, Any] = None) -> dict:
        if self._running:
            return {
                "status": "already_running",
                "message": "CSI采集已在运行",
                "project_name": self._project_name,
                "session_id": self._session_id,
            }

        try:
            config = config or {}

            self._stop_event.clear()
            self._running = True
            self._threads.clear()

            self._init_modules(config)

            self._threads.append(threading.Thread(target=self._receiver.serve_forever, daemon=True))
            self._threads[-1].start()
            print("[CSI] CSI接收线程已启动")

            self._threads.append(threading.Thread(target=self._preprocess_worker, daemon=True))
            self._threads[-1].start()
            print("[CSI] CSI预处理线程已启动")

            self._threads.append(threading.Thread(target=self._slice_worker, daemon=True))
            self._threads[-1].start()
            print("[CSI] CSI切片线程已启动")

            self._threads.append(threading.Thread(target=self._image_worker, daemon=True))
            self._threads[-1].start()
            print("[CSI] CSI图像生成线程已启动")

            self._threads.append(threading.Thread(target=asyncio.run, args=(self._broadcast_loop(),), daemon=True))
            self._threads[-1].start()
            print("[CSI] WebSocket推送线程已启动")

            return {
                "status": "started",
                "message": "CSI采集已启动",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
                "save_options": self._save_options,
            }

        except Exception as e:
            self._running = False
            self._stop_event.set()
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"启动CSI采集失败: {str(e)}")

    async def stop(self) -> dict:
        if not self._running:
            return {
                "status": "already_stopped",
                "message": "CSI采集已停止",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
            }

        try:
            self._stop_event.set()
            self._running = False

            if self._receiver:
                self._receiver.stop()

            if self._processor:
                self._processor.flush()

            for t in self._threads:
                if t.is_alive():
                    t.join(timeout=2.0)

            self._threads.clear()

            async with self._ws_lock:
                for ws in self._websockets[:]:
                    try:
                        await ws.close()
                    except Exception:
                        pass
                self._websockets.clear()

            return {
                "status": "stopped",
                "message": "CSI采集已停止",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
            }

        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"停止CSI采集失败: {str(e)}")

    def _preprocess_worker(self):
        print("[CSI] preprocess_worker started")
        while not self._stop_event.is_set():
            try:
                item = self._raw_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                result = self._processor.process_item_and_return_row(item)
                if result is not None:
                    self._processed_queue.put(result)
            except Exception as e:
                print(f"[ERROR] preprocess_worker error: {e}")
            finally:
                self._raw_queue.task_done()

    def _slice_worker(self):
        print("[CSI] slice_worker started")
        while not self._stop_event.is_set():
            try:
                item = self._processed_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                new_result = self._slicer.add_processed_row(
                    row_181=item["row"],
                    seq=item["seq"],
                    ts_ns=item["ts_ns"],
                )
                if new_result is not None:
                    self._image_queue.put(new_result)
            except Exception as e:
                print(f"[ERROR] slice_worker error: {e}")
            finally:
                self._processed_queue.task_done()

    def _image_worker(self):
        print("[CSI] image_worker started")
        while not self._stop_event.is_set():
            try:
                item = self._image_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                self._image_converter.process_fragment_slices(
                    fragment_id=item["fragment_id"],
                    slices=item["slices"],
                    fragment_meta=item.get("fragment_meta"),
                )
            except Exception as e:
                print(f"[ERROR] image_worker error: {e}")
            finally:
                self._image_queue.task_done()

    async def _broadcast_loop(self):
        print("[CSI] WebSocket广播线程启动")
        while not self._stop_event.is_set():
            try:
                amp = self._slicer.get_latest_fragment_amplitude()

                if amp is not None and amp.size > 0:
                    r_stat = self._receiver.get_status()
                    p_stat = self._processor.get_status()
                    s_stat = self._slicer.get_status()
                    i_stat = self._image_converter.get_status()

                    stds = np.std(amp, axis=0)
                    channel = int(np.argmax(stds))
                    amplitude_data = amp[:, channel].tolist() if amp.ndim > 1 else amp.tolist()

                    data = {
                        "type": "csi_data",
                        "timestamp": time.time(),
                        "amplitude": amplitude_data,
                        "stats": {
                            "received_packets": r_stat.get("received_packets", 0),
                            "processed": p_stat.get("total_processed", 0),
                            "fragments": s_stat.get("fragment_count", 0),
                            "slices": s_stat.get("slice_count", 0),
                            "images": i_stat.get("total_images", 0),
                            "session_id": self._session_id,
                        }
                    }

                    async with self._ws_lock:
                        disconnected = []
                        for ws in self._websockets[:]:
                            try:
                                await ws.send_json(data)
                            except Exception as e:
                                print(f"[CSI] WebSocket发送错误: {e}")
                                disconnected.append(ws)

                        for ws in disconnected:
                            if ws in self._websockets:
                                self._websockets.remove(ws)

                await asyncio.sleep(self._broadcast_interval)

            except Exception as e:
                print(f"[CSI] 广播错误: {e}")
                await asyncio.sleep(1)

        print("[CSI] WebSocket广播线程结束")

    async def connect_websocket(self, websocket: WebSocket):
        async with self._ws_lock:
            self._websockets.append(websocket)

    async def disconnect_websocket(self, websocket: WebSocket):
        async with self._ws_lock:
            if websocket in self._websockets:
                self._websockets.remove(websocket)

    def get_status(self) -> dict:
        status = {
            "running": self._running,
            "websocket_connections": len(self._websockets),
            "project_name": self._project_name,
            "session_id": self._session_id,
            "session_root": str(self._session_root) if self._session_root else None,
            "save_options": self._save_options,
        }

        if self._receiver:
            status["receiver"] = self._receiver.get_status()
        if self._processor:
            status["processor"] = self._processor.get_status()
        if self._slicer:
            status["slicer"] = self._slicer.get_status()
        if self._image_converter:
            status["image_converter"] = self._image_converter.get_status()

        return status


# ============================================================================
# FastAPI应用
# ============================================================================
app = FastAPI(title="CSI采集服务", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

csi_service = CSIService()


@app.get("/")
async def root():
    return {"message": "CSI采集服务", "version": "1.1.0"}


@app.get("/status")
async def get_status():
    return csi_service.get_status()


@app.post("/start")
async def start_csi(request: CSIStartRequest):
    return await csi_service.start({
        "project_name": request.project_name,
        "save_options": request.save_options,
    })


@app.post("/stop")
async def stop_csi():
    return await csi_service.stop()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await csi_service.connect_websocket(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data == "status":
                await websocket.send_json(csi_service.get_status())
    except WebSocketDisconnect:
        print("[CSI] WebSocket断开")
    except Exception as e:
        print(f"[CSI] WebSocket错误: {e}")
    finally:
        await csi_service.disconnect_websocket(websocket)


if __name__ == "__main__":
    print("启动CSI采集服务 http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")