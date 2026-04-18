# -*- coding: utf-8 -*-
"""
视频采集后端服务
提供 HTTP API 启动/停止视频采集，并通过 WebSocket 推送实时视频帧和检测结果
"""

import asyncio
import base64
import queue
import threading
import traceback
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import cv2

# ============================================================================
# 配置
# ============================================================================
API_PORT = 8003
CAMERA_INDEX = 0

BASE_DIR = Path(__file__).resolve().parent
SAVE_DIR = BASE_DIR / "cam_data"
SAVE_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# 导入模块
# ============================================================================
from .capture_worker import CaptureWorker
from .tracking_worker import TrackingWorker
from .person_frame_extractor import OnlinePersonFrameExtractor
from .classification import OnlineActionClassifier
from .artifact_saver import SessionArtifactSaver


# ============================================================================
# 视频服务管理
# ============================================================================
class CamService:
    """视频服务管理类"""
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

        self._frame_queue: queue.Queue = queue.Queue(maxsize=5)
        self._result_queue: queue.Queue = queue.Queue(maxsize=5)

        self._capture_worker: Optional[CaptureWorker] = None
        self._tracking_worker: Optional[TrackingWorker] = None
        self._extractor: Optional[OnlinePersonFrameExtractor] = None
        self._classifier: Optional[OnlineActionClassifier] = None
        self._artifact_saver: Optional[SessionArtifactSaver] = None

        self._websockets: List[WebSocket] = []
        self._ws_lock = asyncio.Lock()

        self._broadcast_interval = 1.0 / 30
        self._frame_count = 0
        self._detection_count = 0

        self._project_name: str = "default_project"
        self._session_id: Optional[str] = None
        self._session_root: Optional[Path] = None
        self._save_options: Dict[str, Any] = {}

    @property
    def is_running(self) -> bool:
        return self._running

    def _ensure_list(self, value):
        """把 list / tuple / numpy / tensor / None 统一转成 Python list"""
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, tuple):
            return list(value)
        if hasattr(value, "detach") and hasattr(value, "cpu"):
            try:
                return value.detach().cpu().tolist()
            except Exception:
                pass
        if hasattr(value, "tolist"):
            try:
                converted = value.tolist()
                return converted if isinstance(converted, list) else [converted]
            except Exception:
                pass
        return [value]

    def _init_modules(self, config: Dict[str, Any]):
        """初始化视频模块"""
        service_root = BASE_DIR
        tracking_root = service_root / "tracking"

        yolo_weights = tracking_root / "yolov5" / "weights" / "yolov5s.pt"
        deepsort_cfg = tracking_root / "configs" / "deep_sort.yaml"
        reid_ckpt = tracking_root / "deep_sort" / "deep" / "checkpoint" / "ckpt.t7"

        classifier_model = service_root / "pose_action_recognition.h5"
        tf_infer_script = service_root / "tf_infer.py"
        tf_python_exe = r"C:\ProgramData\Anaconda3\envs\Tensorflow\python.exe"

        print(f"[PATH] service_root     = {service_root}")
        print(f"[PATH] tracking_root    = {tracking_root}")
        print(f"[PATH] yolo_weights     = {yolo_weights}")
        print(f"[PATH] deepsort_cfg     = {deepsort_cfg}")
        print(f"[PATH] reid_ckpt        = {reid_ckpt}")
        print(f"[PATH] classifier_model = {classifier_model}")
        print(f"[PATH] tf_infer_script  = {tf_infer_script}")

        required_paths = {
            "yolo_weights": yolo_weights,
            "deepsort_cfg": deepsort_cfg,
            "reid_ckpt": reid_ckpt,
        }
        for name, path in required_paths.items():
            if not path.exists():
                raise FileNotFoundError(f"未找到 {name}: {path}")

        self._project_name = config.get("project_name", "default_project")

        self._save_options = dict(SessionArtifactSaver.DEFAULT_SAVE_OPTIONS)
        self._save_options.update(config.get("save_options", {}))

        # 先创建本次 session 保存器
        self._artifact_saver = SessionArtifactSaver(
            base_save_dir=SAVE_DIR,
            project_name=self._project_name,
            save_options=self._save_options
        )
        session_paths = self._artifact_saver.start_session(
            extra_meta={
                "project_name": self._project_name,
                "camera_index": config.get("camera_index", CAMERA_INDEX),
                "frame_rate": config.get("frame_rate", 30),
                "display_mode": config.get("display_mode", "right"),
            }
        )
        self._session_id = self._artifact_saver.session_id
        self._session_root = session_paths["session_root"]

        # CaptureWorker 当前输出 raw_frame / left_frame / right_frame / timestamp / frame_id
        self._capture_worker = CaptureWorker(
            camera_index=config.get("camera_index", CAMERA_INDEX),
            frame_queue=self._frame_queue,
            stop_event=self._stop_event,
            small_width=640,
            small_height=240
        )

        # TrackingWorker 当前消费 frame_queue，生产 result_queue
        self._tracking_worker = TrackingWorker(
            frame_queue=self._frame_queue,
            result_queue=self._result_queue,
            stop_event=self._stop_event,
            weights=str(yolo_weights),
            config_deepsort=str(deepsort_cfg),
            device="",
            img_size=640,
            conf_thres=0.5,
            iou_thres=0.5,
            classes=[0],
            agnostic_nms=False,
            augment=False
        )

        # person_clip 改成当前 session 目录下
        self._extractor = OnlinePersonFrameExtractor(
            output_root=str(session_paths["person_clips"]),
            window_size=80,
            stride=60,
            crop_size=(128, 128),
            padding=10,
            min_bbox_w=20,
            min_bbox_h=40,
            save_jpg=bool(self._save_options.get("save_person_clips", True)),
            save_meta_csv=bool(self._save_options.get("save_person_clips", True)),
            jpg_ext=".jpg",
            jpg_quality=95,
            max_track_idle_frames=300
        )

        self._classifier = None
        try:
            if not tf_infer_script.exists():
                raise FileNotFoundError(f"未找到 tf_infer.py：{tf_infer_script}")
            if not classifier_model.exists():
                raise FileNotFoundError(f"未找到分类模型：{classifier_model}")

            self._classifier = OnlineActionClassifier(
                tf_python_exe=tf_python_exe,
                tf_infer_script=str(tf_infer_script),
                classifier_model_path=str(classifier_model),
                reid_model_path=str(reid_ckpt),
                sequence_length=80,
                feature_dim=512,
                use_cuda=True,
                keep_temp_files=False
            )
        except Exception as e:
            print(f"[WARN] 分类器初始化失败，已跳过分类功能：{e}")
            self._classifier = None

    async def start(self, config: Dict[str, Any] = None) -> dict:
        """启动视频采集"""
        if self._running:
            return {
                "status": "already_running",
                "message": "视频采集已在运行",
                "session_id": self._session_id
            }

        try:
            config = config or {}

            self._stop_event.clear()
            self._running = True
            self._frame_count = 0
            self._detection_count = 0

            self._init_modules(config)

            self._capture_worker.start()
            print("[CAM] 采集线程已启动")

            self._tracking_worker.start()
            print("[CAM] 检测跟踪线程已启动")

            asyncio.create_task(self._process_and_broadcast_loop())

            return {
                "status": "started",
                "message": "视频采集已启动",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
                "save_options": self._save_options,
            }

        except Exception as e:
            self._running = False
            self._stop_event.set()
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"启动视频采集失败: {str(e)}")

    async def stop(self) -> dict:
        """停止视频采集"""
        if not self._running:
            return {
                "status": "already_stopped",
                "message": "视频采集已停止",
                "project_name": self._project_name,
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
            }

        try:
            self._stop_event.set()
            self._running = False

            if self._capture_worker and self._capture_worker.is_alive():
                self._capture_worker.join(timeout=2.0)

            if self._tracking_worker and self._tracking_worker.is_alive():
                self._tracking_worker.join(timeout=2.0)

            if self._extractor:
                self._extractor.flush()

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
                "message": "视频采集已停止",
                "session_id": self._session_id,
                "session_root": str(self._session_root) if self._session_root else None,
            }

        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"停止视频采集失败: {str(e)}")

    async def _process_and_broadcast_loop(self):
        """处理结果、保存产物并广播"""
        print("[CAM] 结果处理和广播任务启动")

        while not self._stop_event.is_set() and self._running:
            try:
                try:
                    result = self._result_queue.get(timeout=0.1)
                except queue.Empty:
                    continue

                left_outputs = self._ensure_list(result.get("left_outputs"))
                right_outputs = self._ensure_list(result.get("right_outputs"))
                all_outputs = left_outputs + right_outputs

                self._frame_count += 1
                self._detection_count += len(all_outputs)

                # 统一保存：原视频 / 跟踪视频 / 左右图像
                if self._artifact_saver:
                    try:
                        self._artifact_saver.save_from_result(result)
                    except Exception as e:
                        print(f"[CAM][SAVE] 保存产物失败: {e}")

                left_saved = []
                right_saved = []

                if self._extractor:
                    left_saved = self._extractor.update(
                        view_name="left",
                        frame_id=result.get("frame_id", self._frame_count),
                        frame=result.get("left_frame_raw"),
                        outputs=left_outputs
                    )
                    right_saved = self._extractor.update(
                        view_name="right",
                        frame_id=result.get("frame_id", self._frame_count),
                        frame=result.get("right_frame_raw"),
                        outputs=right_outputs
                    )

                for item in left_saved + right_saved:
                    print(
                        f"[SAVE] view={item['view_name']} "
                        f"id={item['track_id']} "
                        f"video_frames={item['start_frame']}-{item['end_frame']}"
                    )

                    if self._classifier is not None:
                        try:
                            cls_result = self._classifier.classify_saved_clip_info(
                                saved_info=item,
                                person_clips_root=str(self._artifact_saver.paths["person_clips"])
                            )

                            print(
                                f"[CLS] view={cls_result['view_name']} "
                                f"id={cls_result['track_id']} "
                                f"frames={cls_result['start_frame']}-{cls_result['end_frame']} "
                                f"label={cls_result['pred_label']} "
                                f"conf={cls_result['confidence']:.4f}"
                            )

                            if self._artifact_saver:
                                try:
                                    self._artifact_saver.save_classification_result(cls_result)
                                except Exception as save_cls_err:
                                    print(f"[CAM][CLS-SAVE] 分类结果保存失败: {save_cls_err}")

                            for det in all_outputs:
                                if isinstance(det, dict) and det.get("track_id") == cls_result["track_id"]:
                                    det["action"] = cls_result["pred_label"]
                                    det["action_confidence"] = cls_result["confidence"]

                        except Exception as e:
                            print(f"[CLS-ERROR] 分类失败：{e}")

                left_display = result.get("left_vis")
                if left_display is None:
                    left_display = result.get("left_frame_raw")

                right_display = result.get("right_vis")
                if right_display is None:
                    right_display = result.get("right_frame_raw")

                if left_display is None and right_display is None:
                    await asyncio.sleep(0.01)
                    continue

                left_frame_base64 = None
                right_frame_base64 = None

                if left_display is not None:
                    ok_l, buffer_l = cv2.imencode(".jpg", left_display, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if ok_l:
                        left_frame_base64 = base64.b64encode(buffer_l).decode("utf-8")

                if right_display is not None:
                    ok_r, buffer_r = cv2.imencode(".jpg", right_display, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if ok_r:
                        right_frame_base64 = base64.b64encode(buffer_r).decode("utf-8")

                data = {
                    "type": "video_frame",
                    "frame_id": result.get("frame_id", self._frame_count),
                    "timestamp": result.get("timestamp", time.time()),
                    "frame_left": left_frame_base64,
                    "frame_right": right_frame_base64,
                    "detections": {
                        "left": left_outputs,
                        "right": right_outputs
                    },
                    "stats": {
                        "frame_count": self._frame_count,
                        "detection_count": self._detection_count,
                        "session_id": self._session_id
                    }
                }


                async with self._ws_lock:
                    disconnected = []
                    for ws in self._websockets[:]:
                        try:
                            await ws.send_json(data)
                        except Exception as e:
                            print(f"[CAM] WebSocket发送错误: {e}")
                            disconnected.append(ws)

                    for ws in disconnected:
                        if ws in self._websockets:
                            self._websockets.remove(ws)

                await asyncio.sleep(self._broadcast_interval)

            except Exception as e:
                print(f"[CAM] 处理和广播错误: {e}")
                await asyncio.sleep(0.1)

        print("[CAM] 结果处理和广播任务结束")

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
            "frame_count": self._frame_count,
            "detection_count": self._detection_count,
            "websocket_connections": len(self._websockets),
            "capture_alive": self._capture_worker.is_alive() if self._capture_worker else False,
            "tracking_alive": self._tracking_worker.is_alive() if self._tracking_worker else False,
            "classifier_enabled": self._classifier is not None,
            "project_name": self._project_name,
            "session_id": self._session_id,
            "session_root": str(self._session_root) if self._session_root else None,
            "save_options": self._save_options,
        }


# ============================================================================
# FastAPI 应用
# ============================================================================
app = FastAPI(title="视频采集服务", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cam_service = CamService()


@app.get("/")
async def root():
    return {"message": "视频采集服务", "version": "1.1.0"}


@app.get("/status")
async def get_status():
    return cam_service.get_status()


class StartRequest(BaseModel):
    camera_index: int = 0
    frame_rate: int = 30
    display_mode: str = "right"
    project_name: str = "default_project"
    save_options: Dict[str, Any] = {}


@app.post("/start")
async def start_cam(request: StartRequest):
    return await cam_service.start({
        "camera_index": request.camera_index,
        "frame_rate": request.frame_rate,
        "display_mode": request.display_mode,
        "project_name": request.project_name,
        "save_options": request.save_options,
    })


@app.post("/stop")
async def stop_cam():
    return await cam_service.stop()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await cam_service.connect_websocket(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data == "status":
                await websocket.send_json(cam_service.get_status())
    except WebSocketDisconnect:
        print("[CAM] WebSocket断开")
    except Exception as e:
        print(f"[CAM] WebSocket错误: {e}")
    finally:
        await cam_service.disconnect_websocket(websocket)


if __name__ == "__main__":
    print(f"启动视频采集服务 http://0.0.0.0:{API_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=API_PORT, log_level="info")