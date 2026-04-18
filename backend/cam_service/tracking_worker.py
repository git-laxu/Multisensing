# -*- coding: utf-8 -*-
import os
import sys
import time
import queue
import warnings
import threading

import cv2
import numpy as np
if not hasattr(np, "float"):
    np.float = float
if not hasattr(np, "int"):
    np.int = int
if not hasattr(np, "bool"):
    np.bool = bool
import torch
import torch.backends.cudnn as cudnn

current_dir = os.path.dirname(os.path.abspath(__file__))
tracking_dir = os.path.join(current_dir, "tracking")
yolov5_dir = os.path.join(tracking_dir, "yolov5")

if tracking_dir not in sys.path:
    sys.path.append(tracking_dir)

if yolov5_dir not in sys.path:
    sys.path.append(yolov5_dir)

from yolov5.utils.general import check_img_size, non_max_suppression, scale_coords, xyxy2xywh
from yolov5.utils.torch_utils import select_device, time_synchronized
from yolov5.utils.datasets import letterbox

from utils_ds.parser import get_config
from deep_sort import build_tracker

cudnn.benchmark = True


class TrackingWorker(threading.Thread):
    def __init__(
        self,
        frame_queue,
        result_queue,
        stop_event,
        weights,
        config_deepsort,
        device="",
        img_size=640,
        conf_thres=0.5,
        iou_thres=0.5,
        classes=None,
        agnostic_nms=False,
        augment=False
    ):
        super().__init__(daemon=True)

        self.frame_queue = frame_queue
        self.result_queue = result_queue
        self.stop_event = stop_event

        self.weights = weights
        self.config_deepsort = config_deepsort
        self.device_str = device
        self.img_size = img_size
        self.conf_thres = conf_thres
        self.iou_thres = iou_thres
        self.classes = classes if classes is not None else [0]
        self.agnostic_nms = agnostic_nms
        self.augment = augment

        self.device = None
        self.half = False
        self.detector = None
        self.names = None
        self.deepsort_left = None
        self.deepsort_right = None

    def init_models(self):
        print("初始化 YOLOv5 与 DeepSORT")

        self.device = select_device(self.device_str)
        self.half = self.device.type != "cpu"

        cfg = get_config()
        cfg.merge_from_file(self.config_deepsort)

        # ===== 关键修正：把 deep_sort.yaml 里的相对路径转成绝对路径 =====
        # 你的 yaml 中是：deep_sort/deep/checkpoint/ckpt.t7
        # 它相对于 tracking/ 目录，而不是相对于 main.py 当前工作目录
        reid_ckpt = cfg.DEEPSORT.REID_CKPT
        if not os.path.isabs(reid_ckpt):
            reid_ckpt = os.path.join(tracking_dir, reid_ckpt)
            reid_ckpt = os.path.normpath(reid_ckpt)
        cfg.DEEPSORT.REID_CKPT = reid_ckpt

        print(f"DeepSORT ReID 权重路径：{cfg.DEEPSORT.REID_CKPT}")

        if not os.path.isfile(cfg.DEEPSORT.REID_CKPT):
            raise FileNotFoundError(f"未找到 DeepSORT ReID 权重文件：{cfg.DEEPSORT.REID_CKPT}")

        use_cuda = self.device.type != "cpu" and torch.cuda.is_available()
        self.deepsort_left = build_tracker(cfg, use_cuda=use_cuda)
        self.deepsort_right = build_tracker(cfg, use_cuda=use_cuda)

        if not os.path.isfile(self.weights):
            raise FileNotFoundError(f"未找到 YOLO 权重文件：{self.weights}")

        self.detector = torch.load(self.weights, map_location=self.device)["model"].float()
        self.detector.to(self.device).eval()

        if self.half:
            self.detector.half()

        self.names = self.detector.module.names if hasattr(self.detector, "module") else self.detector.names
        self.img_size = check_img_size(self.img_size)

        if self.device.type == "cpu":
            warnings.warn("当前运行在 CPU 模式，速度可能较慢", UserWarning)

        print("模型初始化完成")

    @staticmethod
    def draw_tracks(img, outputs, view_name, fps_text=None):
        vis = img.copy()

        if outputs is not None and len(outputs) > 0:
            if isinstance(outputs, torch.Tensor):
                outputs = outputs.cpu().numpy()

            for det in outputs:
                x1, y1, x2, y2, track_id = det[:5]
                x1, y1, x2, y2, track_id = int(x1), int(y1), int(x2), int(y2), int(track_id)

                cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(
                    vis,
                    f"ID {track_id}",
                    (x1, max(30, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2
                )

                cx = int((x1 + x2) / 2)
                cy = int((y1 + y2) / 2)
                cv2.circle(vis, (cx, cy), 4, (0, 0, 255), -1)
                cv2.putText(
                    vis,
                    f"({cx},{cy})",
                    (cx + 5, cy - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 0, 255),
                    1
                )

        cv2.putText(
            vis,
            view_name,
            (15, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (255, 0, 0),
            2
        )

        if fps_text is not None:
            cv2.putText(
                vis,
                fps_text,
                (15, 65),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 255),
                2
            )

        return vis

    def image_track(self, im0, tracker):
        img = letterbox(im0, new_shape=self.img_size)[0]
        img = img[:, :, ::-1].transpose(2, 0, 1)
        img = np.ascontiguousarray(img)

        img = torch.from_numpy(img).to(self.device)
        img = img.half() if self.half else img.float()
        img /= 255.0

        if img.ndimension() == 3:
            img = img.unsqueeze(0)

        t1 = time_synchronized()
        with torch.no_grad():
            pred = self.detector(img, augment=self.augment)[0]

        pred = non_max_suppression(
            pred,
            self.conf_thres,
            self.iou_thres,
            classes=self.classes,
            agnostic=self.agnostic_nms
        )
        t2 = time_synchronized()

        det = pred[0]
        if det is not None and len(det):
            det[:, :4] = scale_coords(img.shape[2:], det[:, :4], im0.shape).round()

            bbox_xywh = xyxy2xywh(det[:, :4]).cpu()
            confs = det[:, 4:5].cpu()

            outputs = tracker.update(bbox_xywh, confs, im0)
        else:
            outputs = torch.zeros((0, 5))

        t3 = time.time()
        return outputs, (t2 - t1), (t3 - t2)

    def run(self):
        try:
            self.init_models()

            while not self.stop_event.is_set():
                try:
                    payload = self.frame_queue.get(timeout=1.0)
                except queue.Empty:
                    continue

                raw_frame = payload["raw_frame"]
                stereo_small = payload["stereo_small"]
                left_frame = payload["left_frame"]
                right_frame = payload["right_frame"]
                frame_id = payload["frame_id"]

                outputs_left, yolo_t_l, sort_t_l = self.image_track(left_frame, self.deepsort_left)
                outputs_right, yolo_t_r, sort_t_r = self.image_track(right_frame, self.deepsort_right)

                fps_left = 1.0 / max((yolo_t_l + sort_t_l), 1e-6)
                fps_right = 1.0 / max((yolo_t_r + sort_t_r), 1e-6)

                left_vis = self.draw_tracks(
                    left_frame,
                    outputs_left,
                    view_name=f"LEFT Frame {frame_id}",
                    fps_text=f"FPS {fps_left:.2f}"
                )
                right_vis = self.draw_tracks(
                    right_frame,
                    outputs_right,
                    view_name=f"RIGHT Frame {frame_id}",
                    fps_text=f"FPS {fps_right:.2f}"
                )

                result = {
                        "frame_id": frame_id,
                        "raw_frame": raw_frame,
                        "stereo_small": stereo_small,
                        "left_frame_raw": left_frame,
                        "right_frame_raw": right_frame,
                        "left_vis": left_vis,
                        "right_vis": right_vis,
                        "left_outputs": outputs_left,
                        "right_outputs": outputs_right
                }

                if self.result_queue.full():
                    try:
                        self.result_queue.get_nowait()
                    except queue.Empty:
                        pass

                self.result_queue.put(result)

        except Exception as e:
            print(f"TrackingWorker 出错：{e}")
            self.stop_event.set()

        finally:
            print("TrackingWorker 已停止")