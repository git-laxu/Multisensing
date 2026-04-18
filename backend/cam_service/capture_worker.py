# -*- coding: utf-8 -*-
import time
import queue
import threading
import cv2


class CaptureWorker(threading.Thread):
    def __init__(self, camera_index, frame_queue, stop_event, small_width=640, small_height=240):
        super().__init__(daemon=True)
        self.camera_index = camera_index
        self.frame_queue = frame_queue
        self.stop_event = stop_event
        self.small_width = small_width
        self.small_height = small_height
        self.cap = None
        self.frame_id = 0

    def open_camera(self):
        cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            raise RuntimeError(f"无法打开摄像头：{self.camera_index}")
        return cap

    @staticmethod
    def split_stereo_frame(frame):
        h, w = frame.shape[:2]
        mid = w // 2
        left = frame[:, :mid].copy()
        right = frame[:, mid:].copy()
        return left, right

    def run(self):
        try:
            self.cap = self.open_camera()
            print("摄像头已打开")

            while not self.stop_event.is_set():
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    print("无法读取图像帧")
                    time.sleep(0.01)
                    continue

                left_frame, right_frame = self.split_stereo_frame(frame)

                stereo_small = cv2.resize(
                    frame,
                    (self.small_width, self.small_height),
                    interpolation=cv2.INTER_AREA
                )

                payload = {
                    "frame_id": self.frame_id,
                    "timestamp": time.time(),
                    "raw_frame": frame,
                    "stereo_small": stereo_small,
                    "left_frame": left_frame,
                    "right_frame": right_frame
                }

                if self.frame_queue.full():
                    try:
                        self.frame_queue.get_nowait()
                    except queue.Empty:
                        pass

                self.frame_queue.put(payload)
                self.frame_id += 1

        except Exception as e:
            print(f"CaptureWorker 出错：{e}")
            self.stop_event.set()

        finally:
            if self.cap is not None:
                self.cap.release()
            print("CaptureWorker 已停止")