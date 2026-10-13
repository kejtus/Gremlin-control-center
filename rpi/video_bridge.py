#!/usr/bin/env python3
"""Mostek kamery bez panelu Gremlin Control.

Gremlin (python -m src.main) po register_video_sink wysyła JPEG UDP na IP
klienta WS. Przeglądarka UDP nie przyjmie — ten proces zbiera klatki na
:9000 i podaje je jako ws://127.0.0.1:8766.

  python rpi/video_bridge.py
"""

from __future__ import annotations

import argparse
import asyncio
import struct

from websockets.asyncio.server import serve

HEADER = 4 + 2 + 2 + 8


class Assembler:
    def __init__(self) -> None:
        self.pending: dict[int, tuple[list[bytes | None], int, int]] = {}

    def push(self, msg: bytes) -> bytes | None:
        if len(msg) < 2:
            return None
        if len(msg) >= HEADER:
            frame_id, chunk_index, total = struct.unpack_from(">IHH", msg, 0)
            payload = msg[HEADER:]
            if total <= 1:
                return payload or (msg if msg[:2] == b"\xff\xd8" else None)
            entry = self.pending.get(frame_id)
            if entry is None or entry[1] != total:
                entry = ([None] * total, total, 0)
                self.pending[frame_id] = entry
            chunks, _, received = entry
            if chunk_index < total and chunks[chunk_index] is None:
                chunks[chunk_index] = payload
                received += 1
                self.pending[frame_id] = (chunks, total, received)
            if received == total:
                del self.pending[frame_id]
                return b"".join(c or b"" for c in chunks)
            if len(self.pending) > 12:
                oldest = next(iter(self.pending))
                del self.pending[oldest]
            return None
        return msg if msg[:2] == b"\xff\xd8" else None


class Bridge:
    def __init__(self) -> None:
        self.clients: set = set()
        self.asm = Assembler()
        self.latest: bytes | None = None
        self.flushing = False
        self.last_send = 0.0

    async def ws_handler(self, websocket) -> None:
        self.clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            self.clients.discard(websocket)

    def on_udp(self, data: bytes) -> None:
        if not self.clients:
            self.asm.pending.clear()
            return
        frame = self.asm.push(data)
        if not frame:
            return
        self.latest = frame
        if not self.flushing:
            self.flushing = True
            asyncio.create_task(self.flush())

    async def flush(self) -> None:
        try:
            loop = asyncio.get_running_loop()
            while self.latest and self.clients:
                wait = 1 / 12 - (loop.time() - self.last_send)
                if wait > 0:
                    await asyncio.sleep(wait)
                payload = self.latest
                self.latest = None
                if not payload:
                    break
                self.last_send = loop.time()
                dead = []
                for ws in list(self.clients):
                    try:
                        await ws.send(payload)
                    except Exception:
                        dead.append(ws)
                for ws in dead:
                    self.clients.discard(ws)
        finally:
            self.flushing = False
            if self.latest and self.clients:
                self.flushing = True
                asyncio.create_task(self.flush())


class UdpProto(asyncio.DatagramProtocol):
    def __init__(self, bridge: Bridge) -> None:
        self.bridge = bridge

    def datagram_received(self, data: bytes, _addr: tuple[str, int]) -> None:
        self.bridge.on_udp(data)


async def run(udp_port: int, ws_port: int) -> None:
    bridge = Bridge()
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(lambda: UdpProto(bridge), local_addr=("0.0.0.0", udp_port))
    async with serve(bridge.ws_handler, "0.0.0.0", ws_port):
        print(f"Video bridge UDP :{udp_port} → ws://0.0.0.0:{ws_port}", flush=True)
        await asyncio.Future()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--udp-port", type=int, default=9000)
    p.add_argument("--ws-port", type=int, default=8766)
    args = p.parse_args()
    try:
        asyncio.run(run(args.udp_port, args.ws_port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
