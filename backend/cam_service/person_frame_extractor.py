# -*- coding: utf-8 -*-
import os
import csv
import cv2
import numpy as np
from collections import defaultdict, deque


class OnlinePersonFrameExtractor:
    """
    仅按“真实有效人物帧”提取 clip 的在线提取器。

    核心规则：
    1. 只有当前帧真实检测到了目标，并且裁剪成功，才记作一张有效人物帧
    2. 只有累计到 window_size 张有效人物帧，才保存一个 clip
    3. stride 也按有效人物帧计数，而不是按原视频帧号计数
    4. 每个保存下来的 clip 严格包含 window_size 张真实有效人物帧
    """

    def __init__(
        self,
        output_root,
        window_size=80,
        stride=60,
        crop_size=(128, 256),
        padding=10,
        min_bbox_w=20,
        min_bbox_h=40,
        save_jpg=True,
        save_meta_csv=True,
        jpg_ext=".jpg",
        jpg_quality=95,
        max_track_idle_frames=300
    ):
        """
        参数说明：
        output_root          : 输出根目录
        window_size          : 每个 clip 包含的有效人物帧数，例如 80
        stride               : 相邻 clip 之间的有效人物帧步长，例如 60
        crop_size            : 人物裁剪图统一尺寸，例如 (128, 256)
        padding              : bbox 外扩像素
        min_bbox_w           : 最小有效框宽
        min_bbox_h           : 最小有效框高
        save_jpg             : 是否保存 jpg 序列
        save_meta_csv        : 是否保存 meta.csv
        jpg_ext              : 图像格式，默认 .jpg
        jpg_quality          : jpg 质量
        max_track_idle_frames: 某个 track 长时间不再出现后，从内存中清理的阈值
        """
        self.output_root = output_root
        self.window_size = int(window_size)
        self.stride = int(stride)
        self.crop_size = tuple(crop_size)
        self.padding = int(padding)
        self.min_bbox_w = int(min_bbox_w)
        self.min_bbox_h = int(min_bbox_h)
        self.save_jpg = bool(save_jpg)
        self.save_meta_csv = bool(save_meta_csv)
        self.jpg_ext = jpg_ext if str(jpg_ext).startswith(".") else f".{jpg_ext}"
        self.jpg_quality = int(jpg_quality)
        self.max_track_idle_frames = int(max_track_idle_frames)

        os.makedirs(self.output_root, exist_ok=True)

        # self.buffers[view_name][track_id] = state
        self.buffers = defaultdict(dict)

        print(
            f"[Extractor] initialized | output_root={self.output_root} | "
            f"window_size={self.window_size} | stride={self.stride} | "
            f"mode=real_valid_frames_only"
        )

    def _make_track_state(self):
        """
        每个 track 的状态。
        这里的 deque 里只存“真实有效人物帧”。
        """
        return {
            "frames": deque(),                  # 裁剪图像
            "frame_ids": deque(),               # 对应原视频帧号
            "bboxes": deque(),                  # 对应 bbox
            "save_start_indices": [],           # 已保存 clip 的起始有效帧索引，用于防重
            "last_saved_start_idx": None,       # 上一次保存的 clip 的起始有效帧索引
            "last_seen_video_frame": -10**9     # 最近一次真实出现的原视频帧号
        }

    @staticmethod
    def _ensure_numpy(outputs):
        if outputs is None:
            return np.zeros((0, 5), dtype=np.float32)

        if hasattr(outputs, "cpu"):
            outputs = outputs.cpu().numpy()

        outputs = np.asarray(outputs)

        if outputs.size == 0:
            return np.zeros((0, 5), dtype=np.float32)

        if outputs.ndim == 1:
            outputs = outputs.reshape(1, -1)

        return outputs

    @staticmethod
    def _safe_makedirs(path):
        os.makedirs(path, exist_ok=True)

    def _safe_imwrite(self, img_path, img):
        """
        兼容 Windows 中文路径。
        """
        try:
            if img is None:
                return False

            ext = os.path.splitext(img_path)[1]
            if ext == "":
                ext = self.jpg_ext

            params = []
            if ext.lower() in [".jpg", ".jpeg"]:
                params = [cv2.IMWRITE_JPEG_QUALITY, self.jpg_quality]

            ok, buffer = cv2.imencode(ext, img, params)
            if not ok:
                return False

            buffer.tofile(img_path)
            return True
        except Exception as e:
            print(f"[WARN] _safe_imwrite failed: {img_path} | {e}")
            return False

    def _clip_dir(self, view_name, track_id, start_frame_id, end_frame_id):
        return os.path.join(
            self.output_root,
            str(view_name),
            f"id_{int(track_id):03d}",
            f"clip_{int(start_frame_id):06d}_{int(end_frame_id):06d}"
        )

    def _crop_person(self, frame, bbox):
        if frame is None or bbox is None:
            return None

        h, w = frame.shape[:2]
        x1, y1, x2, y2 = map(int, bbox)

        x1 = max(0, x1 - self.padding)
        y1 = max(0, y1 - self.padding)
        x2 = min(w - 1, x2 + self.padding)
        y2 = min(h - 1, y2 + self.padding)

        bw = x2 - x1
        bh = y2 - y1

        if bw < self.min_bbox_w or bh < self.min_bbox_h:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop is None or crop.size == 0:
            return None

        crop = cv2.resize(crop, self.crop_size, interpolation=cv2.INTER_LINEAR)
        return crop

    def _save_meta_csv(self, csv_path, seq_indices, frame_ids, bboxes):
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["seq_idx", "frame_id", "x1", "y1", "x2", "y2", "valid", "source"])
            for seq_idx, fid, bbox in zip(seq_indices, frame_ids, bboxes):
                x1, y1, x2, y2 = bbox
                writer.writerow([seq_idx, fid, x1, y1, x2, y2, 1, "real"])

    def _save_clip_by_start_index(self, view_name, track_id, state, start_idx):
        """
        从某个有效帧索引 start_idx 开始，取 window_size 张真实有效人物帧保存成 clip。
        """
        end_idx = start_idx + self.window_size
        frames = list(state["frames"])[start_idx:end_idx]
        frame_ids = list(state["frame_ids"])[start_idx:end_idx]
        bboxes = list(state["bboxes"])[start_idx:end_idx]

        if len(frames) < self.window_size:
            return False

        start_frame_id = frame_ids[0]
        end_frame_id = frame_ids[-1]

        track_dir = self._clip_dir(view_name, track_id, start_frame_id, end_frame_id)
        self._safe_makedirs(track_dir)

        saved_count = 0
        failed_count = 0

        if self.save_jpg:
            for i, (fid, img) in enumerate(zip(frame_ids, frames)):
                img_name = f"{i:03d}_frame_{int(fid):06d}{self.jpg_ext}"
                img_path = os.path.join(track_dir, img_name)

                ok = self._safe_imwrite(img_path, img)
                if ok:
                    saved_count += 1
                else:
                    failed_count += 1
                    print(f"[WARN] 图像保存失败：{img_path}")

        if self.save_meta_csv:
            csv_path = os.path.join(track_dir, "meta.csv")
            seq_indices = list(range(self.window_size))
            self._save_meta_csv(csv_path, seq_indices, frame_ids, bboxes)

        state["last_saved_start_idx"] = start_idx
        state["save_start_indices"].append(start_idx)

        print(
            f"[SAVE-CLIP] view={view_name} id={track_id} "
            f"valid_idx={start_idx}-{end_idx - 1} "
            f"video_frames={start_frame_id}-{end_frame_id} "
            f"jpg_saved={saved_count} jpg_failed={failed_count}"
        )
        return True

    def _trim_old_history(self, state):
        """
        为了避免内存无限增长，清理已经不再可能参与未来 clip 的旧有效帧。
        保留策略：
        - 如果从未保存过 clip，则全部保留
        - 如果保存过 clip，则至少保留从 last_saved_start_idx 开始的部分
        """
        last_saved_start_idx = state["last_saved_start_idx"]
        if last_saved_start_idx is None:
            return

        # 下一次可能的最早起点 = 上一次起点 + stride
        next_min_start = last_saved_start_idx + self.stride

        # 为了还能形成重叠窗口，最多需要保留从 next_min_start 开始之前的一小段
        # 但由于 start<next_min_start 的都不该再重复保存了，可以删除它们
        if next_min_start <= 0:
            return

        current_len = len(state["frames"])
        if current_len <= next_min_start:
            return

        # 真正执行裁剪前，先把前面的内容删除
        for _ in range(next_min_start):
            if state["frames"]:
                state["frames"].popleft()
                state["frame_ids"].popleft()
                state["bboxes"].popleft()

        # 已经把索引整体左移了，所以 last_saved_start_idx 也重置
        state["last_saved_start_idx"] = 0
        state["save_start_indices"] = [0]

    def _append_real_valid_frame(self, state, video_frame_id, frame, bbox):
        """
        只把“真实检测且裁剪成功”的帧加入缓冲。
        """
        crop = self._crop_person(frame, bbox)
        if crop is None:
            return False

        state["frames"].append(crop)
        state["frame_ids"].append(video_frame_id)
        state["bboxes"].append(bbox)
        state["last_seen_video_frame"] = video_frame_id
        return True

    def _maybe_save(self, view_name, track_id, state):
        """
        当累计的真实有效帧足够时，按真实有效帧索引检查是否该保存 clip。
        """
        saved_info = []

        total_valid = len(state["frames"])
        if total_valid < self.window_size:
            return saved_info

        # 第一次保存：从有效帧索引 0 开始
        # 后续保存：起点按 stride 推进
        if state["last_saved_start_idx"] is None:
            candidate_start = 0
        else:
            candidate_start = state["last_saved_start_idx"] + self.stride

        # 只要 candidate_start + window_size <= total_valid，就可以保存
        while candidate_start + self.window_size <= total_valid:
            ok = self._save_clip_by_start_index(view_name, track_id, state, candidate_start)
            if ok:
                frame_ids = list(state["frame_ids"])[candidate_start:candidate_start + self.window_size]
                saved_info.append({
                    "view_name": view_name,
                    "track_id": int(track_id),
                    "start_frame": int(frame_ids[0]),
                    "end_frame": int(frame_ids[-1])
                })

            candidate_start += self.stride

        return saved_info

    def update(self, view_name, frame_id, frame, outputs):
        """
        主线程每来一帧，对某个视图调用一次。

        参数：
            view_name : 'left' / 'right'
            frame_id  : 当前原视频帧号
            frame     : 当前视图原始图像
            outputs   : 跟踪输出，通常为 [x1, y1, x2, y2, track_id]

        返回：
            saved_info : list[dict]
        """
        outputs = self._ensure_numpy(outputs)
        saved_info = []

        current_tracks = set()

        # 只处理当前帧真实检测到的 track
        for det in outputs:
            if len(det) < 5:
                continue

            x1, y1, x2, y2, track_id = det[:5]
            track_id = int(track_id)
            bbox = [int(x1), int(y1), int(x2), int(y2)]
            current_tracks.add(track_id)

            if track_id not in self.buffers[view_name]:
                self.buffers[view_name][track_id] = self._make_track_state()

            state = self.buffers[view_name][track_id]

            appended = self._append_real_valid_frame(state, frame_id, frame, bbox)
            if not appended:
                continue

            new_saved = self._maybe_save(view_name, track_id, state)
            if new_saved:
                saved_info.extend(new_saved)

        # 清理长时间不再出现的 track，避免内存一直堆积
        dead_tracks = []
        for track_id, state in self.buffers[view_name].items():
            if frame_id - state["last_seen_video_frame"] > self.max_track_idle_frames:
                dead_tracks.append(track_id)

        for track_id in dead_tracks:
            del self.buffers[view_name][track_id]

        return saved_info

    def flush(self):
        total_views = 0
        total_tracks = 0
        for view_name, track_dict in self.buffers.items():
            total_views += 1
            total_tracks += len(track_dict)

        print(
            f"[Extractor] flush called | views={total_views} | remaining_tracks={total_tracks}"
        )