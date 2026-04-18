import csv
import math
import threading
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np

try:
    import pywt
except ImportError:
    pywt = None


def to_int8(x: int) -> int:
    return x - 256 if x > 127 else x


def choose_plot_channel(amplitude_matrix: np.ndarray) -> int:
    if amplitude_matrix.size == 0:
        return 0
    stds = np.std(amplitude_matrix, axis=0)
    return int(np.argmax(stds))


def denoise_matrix(signal_2d: np.ndarray) -> np.ndarray:
    if signal_2d.size == 0:
        return signal_2d

    if pywt is None:
        return signal_2d.copy()

    out = np.zeros_like(signal_2d, dtype=np.float64)
    n_rows, n_cols = signal_2d.shape

    for col in range(n_cols):
        x = signal_2d[:, col]

        max_level = pywt.dwt_max_level(len(x), pywt.Wavelet("sym4").dec_len)
        level = max(1, min(5, max_level)) if len(x) >= 8 else 1

        coeffs = pywt.wavedec(x, "sym4", level=level, mode="symmetric")
        detail = coeffs[-1]
        sigma = np.median(np.abs(detail)) / 0.6745 if detail.size > 0 else 0.0
        uthresh = sigma * math.sqrt(2.0 * math.log(max(len(x), 2)))

        new_coeffs = [coeffs[0]]
        for c in coeffs[1:]:
            new_coeffs.append(pywt.threshold(c, value=uthresh, mode="soft"))

        y = pywt.waverec(new_coeffs, "sym4", mode="symmetric")
        out[:, col] = y[:n_rows]

    return out


def parse_intel_5300_payload(payload: bytes) -> Optional[Dict]:
    """
    解析 Intel 5300 CSI payload
    期望格式：
    [1 byte code=0xBB][20-byte bfee header][packed CSI bits]
    """
    if not payload or payload[0] != 0xBB:
        return None

    if len(payload) < 1 + 20:
        return None

    in_bytes = payload[1:]

    timestamp_low = int.from_bytes(in_bytes[0:4], "little", signed=False)
    bfee_count = int.from_bytes(in_bytes[4:6], "little", signed=False)

    nrx = in_bytes[8]
    ntx = in_bytes[9]
    rssi_a = in_bytes[10]
    rssi_b = in_bytes[11]
    rssi_c = in_bytes[12]
    noise = to_int8(in_bytes[13])
    agc = in_bytes[14]
    antenna_sel = in_bytes[15]
    calc_len = int.from_bytes(in_bytes[16:18], "little", signed=False)
    fake_rate_n_flags = int.from_bytes(in_bytes[18:20], "little", signed=False)

    if nrx <= 0 or nrx > 3 or ntx <= 0 or ntx > 3:
        return None

    packed = in_bytes[20:]
    if len(packed) < calc_len:
        return None

    perm = [
        antenna_sel & 0x3,
        (antenna_sel >> 2) & 0x3,
        (antenna_sel >> 4) & 0x3,
    ]

    csi = np.zeros((ntx, nrx, 30), dtype=np.complex128)
    index = 0

    for sc in range(30):
        index += 3
        remainder = index % 8

        for rx in range(nrx):
            for tx in range(ntx):
                byte_index = index // 8
                if byte_index + 2 >= len(packed):
                    return None

                real = (
                    (packed[byte_index] >> remainder)
                    | (packed[byte_index + 1] << (8 - remainder))
                ) & 0xFF

                imag = (
                    (packed[byte_index + 1] >> remainder)
                    | (packed[byte_index + 2] << (8 - remainder))
                ) & 0xFF

                real = to_int8(real)
                imag = to_int8(imag)

                rx_idx = perm[rx]
                if rx_idx >= nrx:
                    rx_idx = rx

                csi[tx, rx_idx, sc] = complex(float(real), float(imag))
                index += 16

    return {
        "timestamp_low": timestamp_low,
        "bfee_count": bfee_count,
        "nrx": nrx,
        "ntx": ntx,
        "rssi_a": rssi_a,
        "rssi_b": rssi_b,
        "rssi_c": rssi_c,
        "noise": noise,
        "agc": agc,
        "antenna_sel": antenna_sel,
        "fake_rate_n_flags": fake_rate_n_flags,
        "csi": csi,
    }


class CSIRealtimeProcessor:
    """
    负责：
    1) 解析 payload
    2) 计算振幅和相位
    3) 对最近窗口做小波降噪
    4) 保存处理后 CSV 与 NPZ
    """

    def __init__(
        self,
        save_dir: str | Path,
        cache_size: int = 5000,
        process_every: int = 50,
        denoise_window: int = 1024,
        save_every: int = 200,
        enable_plot: bool = False,
    ) -> None:
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)

        self.cache_size = int(cache_size)
        self.process_every = int(process_every)
        self.denoise_window = int(denoise_window)
        self.save_every = int(save_every)
        self.enable_plot = bool(enable_plot)

        self.raw_cache: Deque[np.ndarray] = deque(maxlen=self.cache_size)
        self.proc_cache: Deque[np.ndarray] = deque(maxlen=self.cache_size)
        self.packet_meta_cache: Deque[Tuple[int, int]] = deque(maxlen=self.cache_size)

        self.pending_rows: List[np.ndarray] = []
        self.pending_meta: List[Tuple[int, int]] = []

        self.total_packets = 0
        self.total_processed = 0
        self.total_saved = 0

        self.lock = threading.Lock()

        self.processed_csv = self.save_dir / "processed_csi.csv"
        self.cache_npz = self.save_dir / "latest_cache.npz"

        self._ensure_processed_csv_header()

    def get_status(self) -> Dict:
        return {
            "total_packets": self.total_packets,
            "total_processed": self.total_processed,
            "total_saved": self.total_saved,
            "raw_cache_rows": len(self.raw_cache),
            "proc_cache_rows": len(self.proc_cache),
        }

    def _ensure_processed_csv_header(self) -> None:
        if self.processed_csv.exists() and self.processed_csv.stat().st_size > 0:
            return

        header = ["seq", "ts_ns"]
        header += [f"amp_{i+1}" for i in range(90)]
        header += [f"phase_{i+1}" for i in range(90)]
        header += ["plot_amp"]

        with open(self.processed_csv, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(header)

    def process_item_and_return_row(self, item: Dict):
        seq = int(item["seq"])
        ts_ns = int(item["ts_ns"])
        payload = item["payload"]

        parsed = parse_intel_5300_payload(payload)
        if parsed is None:
            return None

        csi = parsed["csi"]
        csi_flat = csi.reshape(-1)
        if csi_flat.size != 90:
            return None

        amplitude = np.abs(csi_flat)
        phase = np.angle(csi_flat)

        row = np.zeros(181, dtype=np.float64)
        row[:90] = amplitude
        row[90:180] = phase
        row[180] = float(ts_ns)

        latest_output_row = row.copy()

        with self.lock:
            self.raw_cache.append(row)
            self.packet_meta_cache.append((seq, ts_ns))
            self.pending_rows.append(row)
            self.pending_meta.append((seq, ts_ns))
            self.total_packets += 1

            if len(self.pending_rows) >= self.process_every:
                self._process_pending_locked()

            # if self.total_packets % self.save_every == 0:
            #     self._save_snapshot_locked()

            if len(self.proc_cache) > 0:
                latest_output_row = np.asarray(self.proc_cache[-1], dtype=np.float64)

        return {
            "seq": seq,
            "ts_ns": ts_ns,
            "row": latest_output_row,
        }

    def flush(self) -> None:
        with self.lock:
            if self.pending_rows:
                self._process_pending_locked()
            # self._save_snapshot_locked()

    def _process_pending_locked(self) -> None:
        if not self.pending_rows:
            return

        raw_arr = np.asarray(self.raw_cache, dtype=np.float64)
        if raw_arr.size == 0:
            return

        window = raw_arr[:, :180]
        if window.shape[0] > self.denoise_window:
            window = window[-self.denoise_window:]

        denoised_window = denoise_matrix(window)

        n_new = len(self.pending_rows)
        new_proc_signal = denoised_window[-n_new:]
        new_timestamps = np.array([r[180] for r in self.pending_rows], dtype=np.float64).reshape(-1, 1)
        new_proc_rows = np.hstack([new_proc_signal, new_timestamps])

        for row in new_proc_rows:
            self.proc_cache.append(row)

        self._append_processed_csv_locked(new_proc_rows, self.pending_meta)

        self.total_processed += n_new
        self.pending_rows.clear()
        self.pending_meta.clear()

    def _append_processed_csv_locked(
        self,
        proc_rows: np.ndarray,
        metas: List[Tuple[int, int]],
    ) -> None:
        if proc_rows.size == 0:
            return

        plot_idx = choose_plot_channel(proc_rows[:, :90])
        plot_amp = proc_rows[:, plot_idx]

        # with open(self.processed_csv, "a", encoding="utf-8", newline="") as f:
        #     writer = csv.writer(f)
        #     for i, row in enumerate(proc_rows):
        #         seq, ts_ns = metas[i]
        #         out = [seq, ts_ns]
        #         out += row[:180].tolist()
        #         out += [float(plot_amp[i])]
        #         writer.writerow(out)
        #         self.total_saved += 1

    def _save_snapshot_locked(self) -> None:
        raw_arr = np.asarray(self.raw_cache, dtype=np.float64) if self.raw_cache else np.zeros((0, 181))
        proc_arr = np.asarray(self.proc_cache, dtype=np.float64) if self.proc_cache else np.zeros((0, 181))
        meta_arr = np.asarray(list(self.packet_meta_cache), dtype=np.int64) if self.packet_meta_cache else np.zeros((0, 2), dtype=np.int64)

        # np.savez_compressed(
        #     self.cache_npz,
        #     raw_cache=raw_arr,
        #     processed_cache=proc_arr,
        #     meta_cache=meta_arr,
        #     total_packets=self.total_packets,
        #     total_processed=self.total_processed,
        #     total_saved=self.total_saved,
        # )