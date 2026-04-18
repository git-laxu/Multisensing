# -*- coding: utf-8 -*-
"""
统一后端服务入口
整合 CSI 采集和视频采集两个服务，提供统一管理接口
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Any, Dict

import sys
import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# =============================================================================
# 路径处理
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# =============================================================================
# 导入子服务
# 注意：要求 csi_service/main.py 和 cam_service/main.py 内部都已经改成相对导入
# =============================================================================
from csi_service.main import CSIService as CSIHandler
from csi_service.data_manager import CSIDataManager
from cam_service.main import CamService as CamHandler
from cam_service.data_manager import CameraDataManager

# =============================================================================
# 全局服务实例
# =============================================================================
csi_handler: Optional[CSIHandler] = None
csi_data_manager: Optional[CSIDataManager] = None
cam_handler: Optional[CamHandler] = None
camera_data_manager: Optional[CameraDataManager] = None


# =============================================================================
# 请求模型
# =============================================================================
class CameraStartRequest(BaseModel):
    camera_index: int = Field(default=0, description="摄像头索引")
    frame_rate: int = Field(default=30, description="采集帧率")
    display_mode: str = Field(default="right", description="显示模式：right / left / stereo")
    project_name: str = Field(default="default_project", description="当前项目名称")
    save_options: Dict[str, Any] = Field(default_factory=dict, description="保存选项")
    # save_options: Dict[str, Any] = {}

class CSIStartRequest(BaseModel):
    project_name: str = Field(default="default_project", description="当前项目名称")
    save_options: Dict[str, Any] = Field(default_factory=dict, description="保存选项")

# =============================================================================
# 工具函数
# =============================================================================
def safe_get_status(handler: Any, default_name: str) -> Dict[str, Any]:
    if handler is None:
        return {
            "service": default_name,
            "initialized": False,
            "running": False
        }

    try:
        status = handler.get_status()
        if isinstance(status, dict):
            status.setdefault("service", default_name)
            status.setdefault("initialized", True)
            status.setdefault("running", bool(getattr(handler, "is_running", False)))
            return status

        return {
            "service": default_name,
            "initialized": True,
            "running": bool(getattr(handler, "is_running", False)),
            "raw_status": str(status)
        }
    except Exception as e:
        return {
            "service": default_name,
            "initialized": True,
            "running": bool(getattr(handler, "is_running", False)),
            "error": f"状态获取失败: {str(e)}"
        }


async def safe_stop_handler(handler: Any, name: str):
    if handler is None:
        return
    try:
        if getattr(handler, "is_running", False):
            await handler.stop()
            print(f"[MAIN] {name} 已停止")
    except Exception as e:
        print(f"[MAIN] {name} 停止失败: {e}")


# =============================================================================
# 生命周期管理
# =============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global csi_handler, csi_data_manager, cam_handler, camera_data_manager

    try:
        csi_handler = CSIHandler()
        csi_data_manager = CSIDataManager(BASE_DIR / "csi_service" / "csi_data")
        cam_handler = CamHandler()
        camera_data_manager = CameraDataManager(BASE_DIR / "cam_service" / "cam_data")
        print("[MAIN] CSI 服务初始化完成")
        print("[MAIN] Camera 服务初始化完成")
        print("[MAIN] CSI 数据管理器初始化完成")
        print("[MAIN] Camera 后端服务启动完成")
        print("[MAIN] 后端服务启动完成")
    except Exception as e:
        print(f"[MAIN] 服务初始化失败: {e}")
        raise

    yield

    await safe_stop_handler(csi_handler, "CSI 服务")
    await safe_stop_handler(cam_handler, "Camera 服务")
    print("[MAIN] 后端服务关闭完成")


# =============================================================================
# FastAPI 应用
# =============================================================================
app = FastAPI(
    title="多传感器数据采集服务",
    version="1.1.0",
    description="整合 CSI 采集和视频采集的统一后端服务",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# 根路径与健康检查
# =============================================================================
@app.get("/")
async def root():
    return {
        "service": "多传感器数据采集服务",
        "version": "1.1.0",
        "api_base": "http://127.0.0.1:8000",
        "endpoints": {
            "health": "/health",
            "status": "/api/status",
            "csi": {
                "start": "/api/csi/start",
                "stop": "/api/csi/stop",
                "status": "/api/csi/status",
                "websocket": "/api/csi/ws"
            },
            "camera": {
                "start": "/api/camera/start",
                "stop": "/api/camera/stop",
                "status": "/api/camera/status",
                "websocket": "/api/camera/ws"
            }
        }
    }


@app.get("/health")
async def health():
    return {"ok": True, "message": "backend is running"}


# =============================================================================
# 平台整体状态
# =============================================================================
@app.get("/api/status")
async def get_overall_status():
    return {
        "success": True,
        "data": {
            "csi": safe_get_status(csi_handler, "csi"),
            "camera": safe_get_status(cam_handler, "camera")
        }
    }

# =============================================================================
# Camera 数据管理接口
# =============================================================================
@app.get("/api/projects")
async def get_projects():
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        projects = camera_data_manager.list_projects()
        return {
            "success": True,
            "projects": projects
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取项目列表失败: {str(e)}")


@app.get("/api/projects/{project_name}/sessions")
async def get_project_sessions(project_name: str):
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        sessions = camera_data_manager.list_sessions(project_name)
        return {
            "success": True,
            "project_name": project_name,
            "sessions": sessions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取项目 session 列表失败: {str(e)}")


@app.get("/api/projects/{project_name}/sessions/{session_id}")
async def get_session_info(project_name: str, session_id: str):
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        session_info = camera_data_manager.get_session_info(project_name, session_id)
        return {
            "success": True,
            "project_name": project_name,
            "session": session_info
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 session 信息失败: {str(e)}")


@app.delete("/api/projects/{project_name}/sessions/{session_id}")
async def delete_session(project_name: str, session_id: str):
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        result = camera_data_manager.delete_session(project_name, session_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除 session 失败: {str(e)}")


@app.delete("/api/projects/{project_name}")
async def delete_project(project_name: str):
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        result = camera_data_manager.delete_project(project_name)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}")


@app.get("/api/projects/{project_name}/sessions/{session_id}/download")
async def download_session(project_name: str, session_id: str):
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        zip_path = camera_data_manager.build_session_zip(project_name, session_id)

        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename=f"{project_name}_{session_id}.zip",
            background=BackgroundTask(lambda: zip_path.unlink(missing_ok=True))
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载 session 失败: {str(e)}")


@app.get("/api/projects/{project_name}/download")
async def download_project(project_name: str):
    if not camera_data_manager:
        raise HTTPException(status_code=500, detail="Camera 数据管理器未初始化")

    try:
        zip_path = camera_data_manager.build_project_zip(project_name)

        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename=f"{project_name}.zip",
            background=BackgroundTask(lambda: zip_path.unlink(missing_ok=True))
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载项目失败: {str(e)}")


# =============================================================================
# CSI 接口
# =============================================================================
# @app.post("/api/csi/start")
# async def start_csi():
#     if not csi_handler:
#         raise HTTPException(status_code=500, detail="CSI 服务未初始化")

#     try:
#         if getattr(csi_handler, "is_running", False):
#             return {
#                 "success": True,
#                 "message": "CSI 服务已经在运行",
#                 "data": safe_get_status(csi_handler, "csi")
#             }

#         result = await csi_handler.start()

#         return {
#             "success": True,
#             "message": "CSI 服务启动成功",
#             "data": result if result is not None else safe_get_status(csi_handler, "csi")
#         }
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"CSI 服务启动失败: {str(e)}")
@app.post("/api/csi/start")
async def start_csi(payload: Optional[CSIStartRequest] = None):
    if not csi_handler:
        raise HTTPException(status_code=500, detail="CSI 服务未初始化")

    try:
        if getattr(csi_handler, "is_running", False):
            return {
                "success": True,
                "message": "CSI 服务已经在运行",
                "data": safe_get_status(csi_handler, "csi")
            }

        if payload is None:
            payload = CSIStartRequest()

        result = await csi_handler.start({
            "project_name": payload.project_name,
            "save_options": payload.save_options,
        })

        return {
            "success": True,
            "message": "CSI 服务启动成功",
            "data": result if result is not None else safe_get_status(csi_handler, "csi")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSI 服务启动失败: {str(e)}")


@app.post("/api/csi/stop")
async def stop_csi():
    if not csi_handler:
        raise HTTPException(status_code=500, detail="CSI 服务未初始化")

    try:
        if not getattr(csi_handler, "is_running", False):
            return {
                "success": True,
                "message": "CSI 服务当前未运行",
                "data": safe_get_status(csi_handler, "csi")
            }

        result = await csi_handler.stop()

        return {
            "success": True,
            "message": "CSI 服务已停止",
            "data": result if result is not None else safe_get_status(csi_handler, "csi")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSI 服务停止失败: {str(e)}")


@app.get("/api/csi/status")
async def get_csi_status():
    if not csi_handler:
        raise HTTPException(status_code=500, detail="CSI 服务未初始化")

    return {
        "success": True,
        "data": safe_get_status(csi_handler, "csi")
    }

# =============================================================================
# CSI 数据管理接口
# =============================================================================
@app.get("/api/csi/projects")
async def get_csi_projects():
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        projects = csi_data_manager.list_projects()
        return {
            "success": True,
            "projects": projects
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 CSI 项目列表失败: {str(e)}")


@app.get("/api/csi/projects/{project_name}/sessions")
async def get_csi_project_sessions(project_name: str):
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        sessions = csi_data_manager.list_sessions(project_name)
        return {
            "success": True,
            "project_name": project_name,
            "sessions": sessions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 CSI session 列表失败: {str(e)}")


@app.get("/api/csi/projects/{project_name}/sessions/{session_id}")
async def get_csi_session_info(project_name: str, session_id: str):
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        session_info = csi_data_manager.get_session_info(project_name, session_id)
        return {
            "success": True,
            "project_name": project_name,
            "session": session_info
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 CSI session 信息失败: {str(e)}")


@app.delete("/api/csi/projects/{project_name}/sessions/{session_id}")
async def delete_csi_session(project_name: str, session_id: str):
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        result = csi_data_manager.delete_session(project_name, session_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除 CSI session 失败: {str(e)}")


@app.delete("/api/csi/projects/{project_name}")
async def delete_csi_project(project_name: str):
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        result = csi_data_manager.delete_project(project_name)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除 CSI 项目失败: {str(e)}")


@app.get("/api/csi/projects/{project_name}/sessions/{session_id}/download")
async def download_csi_session(project_name: str, session_id: str):
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        zip_path = csi_data_manager.build_session_zip(project_name, session_id)

        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename=f"{project_name}_{session_id}_csi.zip",
            background=BackgroundTask(lambda: zip_path.unlink(missing_ok=True))
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载 CSI session 失败: {str(e)}")


@app.get("/api/csi/projects/{project_name}/download")
async def download_csi_project(project_name: str):
    if not csi_data_manager:
        raise HTTPException(status_code=500, detail="CSI 数据管理器未初始化")

    try:
        zip_path = csi_data_manager.build_project_zip(project_name)

        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename=f"{project_name}_csi.zip",
            background=BackgroundTask(lambda: zip_path.unlink(missing_ok=True))
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载 CSI 项目失败: {str(e)}")


@app.websocket("/api/csi/ws")
async def csi_websocket(websocket: WebSocket):
    if not csi_handler:
        await websocket.close(code=1011)
        return

    await websocket.accept()

    try:
        await csi_handler.connect_websocket(websocket)

        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await websocket.send_text("pong")
            elif data == "status":
                await websocket.send_json({
                    "success": True,
                    "data": safe_get_status(csi_handler, "csi")
                })
            else:
                await websocket.send_json({
                    "success": False,
                    "message": f"未知指令: {data}"
                })

    except WebSocketDisconnect:
        print("[CSI] WebSocket 客户端主动断开")
    except Exception as e:
        print(f"[CSI] WebSocket 异常断开: {e}")
    finally:
        try:
            await csi_handler.disconnect_websocket(websocket)
        except Exception:
            pass


# =============================================================================
# Camera 接口
# =============================================================================
from typing import Optional

import traceback

@app.post("/api/camera/start")
async def start_camera(payload: Optional[CameraStartRequest] = None):
    if not cam_handler:
        raise HTTPException(status_code=500, detail="视频服务未初始化")

    try:
        print("[DEBUG] camera start payload:", payload.dict() if payload else None)
        if getattr(cam_handler, "is_running", False):
            return {
                "success": True,
                "message": "视频服务已经在运行",
                "data": safe_get_status(cam_handler, "camera")
            }

        if payload is None:
            payload = CameraStartRequest()

        result = await cam_handler.start({
            "camera_index": payload.camera_index,
            "frame_rate": payload.frame_rate,
            "display_mode": payload.display_mode,
            "project_name": payload.project_name,
            "save_options": payload.save_options
        })

        return {
            "success": True,
            "message": "视频服务启动成功",
            "data": result if result is not None else safe_get_status(cam_handler, "camera")
        }

    except Exception as e:
        print("[MAIN] start_camera 异常：")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"视频服务启动失败: {str(e)}")


@app.post("/api/camera/stop")
async def stop_camera():
    if not cam_handler:
        raise HTTPException(status_code=500, detail="视频服务未初始化")

    try:
        if not getattr(cam_handler, "is_running", False):
            return {
                "success": True,
                "message": "视频服务当前未运行",
                "data": safe_get_status(cam_handler, "camera")
            }

        result = await cam_handler.stop()

        return {
            "success": True,
            "message": "视频服务已停止",
            "data": result if result is not None else safe_get_status(cam_handler, "camera")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"视频服务停止失败: {str(e)}")


@app.get("/api/camera/status")
async def get_camera_status():
    if not cam_handler:
        raise HTTPException(status_code=500, detail="视频服务未初始化")

    return {
        "success": True,
        "data": safe_get_status(cam_handler, "camera")
    }


@app.websocket("/api/camera/ws")
async def camera_websocket(websocket: WebSocket):
    if not cam_handler:
        await websocket.close(code=1011)
        return

    await websocket.accept()

    try:
        await cam_handler.connect_websocket(websocket)

        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await websocket.send_text("pong")
            elif data == "status":
                await websocket.send_json({
                    "success": True,
                    "data": safe_get_status(cam_handler, "camera")
                })
            else:
                await websocket.send_json({
                    "success": False,
                    "message": f"未知指令: {data}"
                })

    except WebSocketDisconnect:
        print("[CAM] WebSocket 客户端主动断开")
    except Exception as e:
        print(f"[CAM] WebSocket 异常断开: {e}")
    finally:
        try:
            await cam_handler.disconnect_websocket(websocket)
        except Exception:
            pass


# =============================================================================
# 启动入口
# =============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("多传感器数据采集服务")
    print("=" * 60)
    print("HTTP API   : http://0.0.0.0:8000")
    print("Health     : http://0.0.0.0:8000/health")
    print("Status API : http://0.0.0.0:8000/api/status")
    print("CSI WS     : ws://0.0.0.0:8000/api/csi/ws")
    print("Camera WS  : ws://0.0.0.0:8000/api/camera/ws")
    print("=" * 60)

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False
    )