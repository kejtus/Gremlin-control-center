#!/usr/bin/env python3
"""LAN sidecar for a live Gremlin robot.

Gremlin already hosts WS control on :8765 and the site on :3000.
This process only answers UDP discovery so a phone can find the Pi,
then the app talks to Gremlin itself.

  python rpi/gremlin_discover.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket

DISCOVER_MAGIC = "GREMLIN_DISCOVER"
HERE_MAGIC = "GREMLIN_HERE"
DISCOVER_PORT = int(os.environ.get("GREMLIN_DISCOVER_PORT", "45454"))
WS_PORT = int(os.environ.get("GREMLIN_WS_PORT", "8765"))
SITE_PORT = int(os.environ.get("GREMLIN_SITE_PORT", "3000"))
ROBOT_NAME = os.environ.get("GREMLIN_NAME", "Gremlin")
ROBOT_ID = os.environ.get("GREMLIN_ID", "gremlin")


def local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


class DiscoveryProtocol(asyncio.DatagramProtocol):
    def __init__(self) -> None:
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]
        sock: socket.socket = transport.get_extra_info("socket")
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        except OSError:
            pass

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        text = data.decode("utf-8", errors="ignore").strip()
        if not text.startswith(DISCOVER_MAGIC) and not text.startswith("RPILOT_DISCOVER"):
            return
        payload = {
            "id": ROBOT_ID,
            "name": ROBOT_NAME,
            "host": local_ip(),
            "httpPort": SITE_PORT,
            "wsPort": WS_PORT,
            "sitePort": SITE_PORT,
            "udpPort": 45455,
            "proto": 1,
        }
        reply = f"{HERE_MAGIC}\n{json.dumps(payload)}".encode("utf-8")
        if self.transport is not None:
            self.transport.sendto(reply, addr)


async def run(port: int) -> None:
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(
        DiscoveryProtocol,
        local_addr=("0.0.0.0", port),
        allow_broadcast=True,
    )
    print(
        f"Gremlin discovery on UDP :{port}\n"
        f"  replies with {local_ip()}  WS :{WS_PORT}  site :{SITE_PORT}",
        flush=True,
    )
    await asyncio.Future()


def main() -> None:
    parser = argparse.ArgumentParser(description="UDP discovery sidecar for Gremlin")
    parser.add_argument("--port", type=int, default=DISCOVER_PORT)
    args = parser.parse_args()
    try:
        asyncio.run(run(args.port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
