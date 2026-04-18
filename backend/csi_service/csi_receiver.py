import queue
import socket
import struct
import threading
import time
from pathlib import Path
from typing import Dict


class CSIReceiver:
    """
    负责：
    1) 接收 Linux 端实时发送的 CSI packet
    2) 原始数据落盘：.dat / .bin / .csv
    3) 放入 raw_queue 供后续预处理线程消费
    """

    MAGIC = 0x43534931  # "CSI1"
    HEADER_FMT = "!IIQQI"  # magic, version, seq, ts_ns, payload_len
    HEADER_SIZE = struct.calcsize(HEADER_FMT)

    def __init__(
        self,
        host: str,
        port: int,
        save_dir: str | Path,
        raw_queue: "queue.Queue[dict]",
    ) -> None:
        self.host = host
        self.port = int(port)
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)

        self.dat_file = self.save_dir / "raw_csi_stream.dat"
        self.bin_file = self.save_dir / "raw_csi_stream.bin"
        self.csv_file = self.save_dir / "raw_csi_index.csv"

        self.raw_queue = raw_queue
        self.file_lock = threading.Lock()
        self.stop_flag = False

        self.received_packets = 0

    def stop(self) -> None:
        self.stop_flag = True

    def get_status(self) -> Dict:
        return {
            "received_packets": self.received_packets,
            "dat_file": str(self.dat_file),
            "bin_file": str(self.bin_file),
            "csv_file": str(self.csv_file),
        }

    @staticmethod
    def recv_exact(conn: socket.socket, n: int) -> bytes:
        buf = bytearray()
        while len(buf) < n:
            chunk = conn.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("socket closed by peer")
            buf.extend(chunk)
        return bytes(buf)

    def save_payload(self, seq: int, ts_ns: int, payload: bytes) -> None:
        recv_time_str = time.strftime("%Y-%m-%d %H:%M:%S")

        with self.file_lock:
            # .dat: [2字节大端长度][payload]
            with open(self.dat_file, "ab") as f:
                f.write(struct.pack("!H", len(payload)))
                f.write(payload)
                f.flush()

            # # .bin: [seq:8][ts_ns:8][payload_len:4][payload]
            # with open(self.bin_file, "ab") as f:
            #     f.write(struct.pack("!QQI", seq, ts_ns, len(payload)))
            #     f.write(payload)
            #     f.flush()

            # # .csv 索引
            # write_header = (not self.csv_file.exists()) or self.csv_file.stat().st_size == 0
            # with open(self.csv_file, "a", encoding="utf-8", newline="") as f:
            #     if write_header:
            #         f.write("seq,ts_ns,payload_len,recv_time\n")
            #     f.write(f"{seq},{ts_ns},{len(payload)},{recv_time_str}\n")
            #     f.flush()

    def enqueue_payload(self, seq: int, ts_ns: int, payload: bytes) -> None:
        item = {
            "seq": int(seq),
            "ts_ns": int(ts_ns),
            "payload_len": int(len(payload)),
            "payload": payload,
            "recv_time": time.time(),
        }
        self.raw_queue.put(item)

    def handle_payload(self, seq: int, ts_ns: int, payload: bytes) -> None:
        print(
            f"[RECV] seq={seq} ts_ns={ts_ns} payload_len={len(payload)} "
            f"time={time.strftime('%Y-%m-%d %H:%M:%S')}"
        )

        self.save_payload(seq, ts_ns, payload)
        self.enqueue_payload(seq, ts_ns, payload)
        self.received_packets += 1

    def serve_forever(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind((self.host, self.port))
            server.listen(1)

            print(f"[INFO] Listening on {self.host}:{self.port}")
            print(f"[INFO] SAVE_DIR = {self.save_dir}")
            print(f"[INFO] DAT_FILE = {self.dat_file}")
            print(f"[INFO] BIN_FILE = {self.bin_file}")
            print(f"[INFO] CSV_FILE = {self.csv_file}")

            while not self.stop_flag:
                conn, addr = server.accept()
                print(f"[INFO] Connected from {addr}")

                with conn:
                    try:
                        while not self.stop_flag:
                            header = self.recv_exact(conn, self.HEADER_SIZE)
                            magic, version, seq, ts_ns, payload_len = struct.unpack(
                                self.HEADER_FMT, header
                            )

                            if magic != self.MAGIC:
                                raise ValueError(f"bad magic: {hex(magic)}")

                            payload = self.recv_exact(conn, payload_len)
                            self.handle_payload(seq, ts_ns, payload)

                    except (ConnectionError, OSError) as e:
                        print(f"[WARN] Connection closed: {e}")
                    except Exception as e:
                        print(f"[ERROR] Receiver error: {e}")