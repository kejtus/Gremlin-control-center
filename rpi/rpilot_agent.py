#!/usr/bin/env python3
"""RPilot agent for Raspberry Pi robots.

Listens for a UDP discovery broadcast, replies with this device's address,
accepts UDP/WebSocket drive packets, and hosts the control UI plus REST API.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import socket
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from uvicorn import Config, Server

DISCOVER_MAGIC = "RPILOT_DISCOVER"
HERE_MAGIC = "RPILOT_HERE"
DISCOVER_PORT = int(os.environ.get("RPILOT_DISCOVER_PORT", "45454"))
CONTROL_PORT = int(os.environ.get("RPILOT_CONTROL_PORT", "45455"))
HTTP_PORT = int(os.environ.get("RPILOT_HTTP_PORT", "8742"))
ROBOT_NAME = os.environ.get("RPILOT_NAME", "Robot laboratoryjny")
ARENA_W = 10.0
ARENA_H = 10.0
MAX_SPEED = 1.6
WHEEL_BASE = 0.28
SAFETY_TIMEOUT = 0.35
STATIC_DIR = Path(__file__).resolve().parent / "static"
ROBOT_ID = os.environ.get("RPILOT_ID") or f"rpilot-{uuid.uuid4().hex[:8]}"


def _clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


class DriveIn(BaseModel):
    x: float = 0.0
    y: float = 0.0


class MotorDriver:
    """GPIO motors when gpiozero is present, otherwise a no-op simulator."""

    def __init__(self) -> None:
        self.mode = "sim"
        self._left = None
        self._right = None
        try:
            from gpiozero import Motor  # type: ignore

            lf = int(os.environ.get("RPILOT_LEFT_FWD", "17"))
            lb = int(os.environ.get("RPILOT_LEFT_REV", "18"))
            rf = int(os.environ.get("RPILOT_RIGHT_FWD", "22"))
            rb = int(os.environ.get("RPILOT_RIGHT_REV", "23"))
            self._left = Motor(forward=lf, backward=lb)
            self._right = Motor(forward=rf, backward=rb)
            self.mode = "gpio"
        except Exception:
            self.mode = "sim"

    def set(self, left: float, right: float) -> None:
        if self._left is None or self._right is None:
            return
        def apply(motor: Any, value: float) -> None:
            mag = min(1.0, abs(value))
            if mag < 0.03:
                motor.stop()
            elif value > 0:
                motor.forward(mag)
            else:
                motor.backward(mag)

        apply(self._left, left)
        apply(self._right, right)

    def stop(self) -> None:
        if self._left is not None:
            self._left.stop()
        if self._right is not None:
            self._right.stop()


@dataclass
class RobotState:
    x: float = ARENA_W / 2
    y: float = ARENA_H / 2
    heading: float = 0.0
    left: float = 0.0
    right: float = 0.0
    battery: float = 97.0
    lights: bool = False
    estop: bool = False
    last_cmd: float = 0.0
    started: float = field(default_factory=time.monotonic)
    clients: int = 0
    seq: int = 0

    def snapshot(self, mode: str) -> dict[str, Any]:
        return {
            "id": ROBOT_ID,
            "name": ROBOT_NAME,
            "connected": True,
            "uptimeSec": round(time.monotonic() - self.started, 1),
            "batteryPct": round(self.battery, 1),
            "motors": {"left": round(self.left, 3), "right": round(self.right, 3)},
            "pose": {
                "x": round(self.x, 3),
                "y": round(self.y, 3),
                "heading": round(self.heading, 4),
            },
            "lights": self.lights,
            "estop": self.estop,
            "lastCommandAgeMs": int(max(0.0, (time.monotonic() - self.last_cmd) * 1000))
            if self.last_cmd
            else None,
            "clients": self.clients,
            "mode": mode,
            "arena": {"width": ARENA_W, "height": ARENA_H},
        }


class Robot:
    def __init__(self) -> None:
        self.state = RobotState()
        self.motors = MotorDriver()
        self.lock = asyncio.Lock()

    def info(self) -> dict[str, Any]:
        return {
            "id": ROBOT_ID,
            "name": ROBOT_NAME,
            "httpPort": HTTP_PORT,
            "udpPort": CONTROL_PORT,
            "discoverPort": DISCOVER_PORT,
            "proto": 1,
            "ip": local_ip(),
            "mode": self.motors.mode,
        }

    def apply_drive(self, x: float, y: float) -> None:
        if self.state.estop:
            self.stop()
            return
        x = _clamp(float(x))
        y = _clamp(float(y))
        left = _clamp(y + x)
        right = _clamp(y - x)
        self.state.left = left
        self.state.right = right
        self.state.last_cmd = time.monotonic()
        self.motors.set(left, right)

    def stop(self) -> None:
        self.state.left = 0.0
        self.state.right = 0.0
        self.state.last_cmd = time.monotonic()
        self.motors.stop()

    def command(self, name: str) -> dict[str, Any]:
        name = name.lower().strip()
        if name in {"stop", "estop"}:
            self.state.estop = True
            self.stop()
        elif name in {"clear", "reset-estop"}:
            self.state.estop = False
        elif name in {"lights", "light"}:
            self.state.lights = not self.state.lights
        elif name in {"beep", "signal"}:
            pass
        elif name in {"dock"}:
            self.state.estop = False
            self.state.x = ARENA_W / 2
            self.state.y = 0.8
            self.state.heading = math.pi / 2
            self.stop()
        elif name in {"center"}:
            self.state.estop = False
            self.state.x = ARENA_W / 2
            self.state.y = ARENA_H / 2
            self.state.heading = 0.0
            self.stop()
        else:
            return {"ok": False, "error": f"unknown command: {name}"}
        self.state.last_cmd = time.monotonic()
        return {"ok": True, "command": name}

    def handle_packet(self, msg: dict[str, Any]) -> dict[str, Any] | None:
        kind = msg.get("t")
        self.state.seq = int(msg.get("seq") or self.state.seq)
        if kind == "drive":
            self.apply_drive(msg.get("x", 0), msg.get("y", 0))
        elif kind == "stop":
            self.stop()
        elif kind == "cmd":
            return self.command(str(msg.get("name", "")))
        elif kind == "ping":
            return {"t": "pong", "seq": msg.get("seq")}
        return None

    def step(self, dt: float) -> None:
        st = self.state
        if st.last_cmd and (time.monotonic() - st.last_cmd) > SAFETY_TIMEOUT:
            if st.left or st.right:
                self.stop()
        v = ((st.left + st.right) / 2.0) * MAX_SPEED
        w = ((st.right - st.left) / max(WHEEL_BASE, 0.05)) * MAX_SPEED * 0.35
        st.heading += w * dt
        st.x += math.cos(st.heading) * v * dt
        st.y += math.sin(st.heading) * v * dt
        st.x = _clamp(st.x, 0.3, ARENA_W - 0.3)
        st.y = _clamp(st.y, 0.3, ARENA_H - 0.3)
        drain = 0.08 * dt + abs(v) * 0.12 * dt
        st.battery = max(4.0, st.battery - drain)


class DiscoveryProtocol(asyncio.DatagramProtocol):
    def __init__(self, robot: Robot) -> None:
        self.robot = robot
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
        if not text.startswith(DISCOVER_MAGIC):
            return
        payload = {
            "id": ROBOT_ID,
            "name": ROBOT_NAME,
            "httpPort": HTTP_PORT,
            "udpPort": CONTROL_PORT,
            "proto": 1,
        }
        reply = f"{HERE_MAGIC}\n{json.dumps(payload)}".encode("utf-8")
        if self.transport is not None:
            self.transport.sendto(reply, addr)


class ControlProtocol(asyncio.DatagramProtocol):
    def __init__(self, robot: Robot) -> None:
        self.robot = robot
        self.transport: asyncio.DatagramTransport | None = None
        self.last_peer: tuple[str, int] | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        self.last_peer = addr
        try:
            msg = json.loads(data.decode("utf-8"))
        except json.JSONDecodeError:
            return
        if not isinstance(msg, dict):
            return
        extra = self.robot.handle_packet(msg)
        if self.transport is None:
            return
        body = {
            "t": "status",
            "status": self.robot.state.snapshot(self.robot.motors.mode),
        }
        if extra:
            body["result"] = extra
        self.transport.sendto(json.dumps(body).encode("utf-8"), addr)


def build_app(robot: Robot) -> FastAPI:
    app = FastAPI(title="RPilot", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    sockets: set[WebSocket] = set()

    ENDPOINTS = [
        {"method": "GET", "path": "/api/info", "summary": "Tożsamość robota, porty UDP i HTTP"},
        {"method": "GET", "path": "/api/status", "summary": "Poza, silniki, bateria, tryb GPIO/sim"},
        {"method": "GET", "path": "/api/health", "summary": "Liveness agenta"},
        {"method": "GET", "path": "/api/endpoints", "summary": "Lista gotowych endpointów"},
        {"method": "POST", "path": "/api/drive", "summary": "Sterowanie arcade: {x, y} w zakresie -1..1"},
        {"method": "POST", "path": "/api/stop", "summary": "Natychmiastowe zatrzymanie napędu"},
        {"method": "POST", "path": "/api/command/{name}", "summary": "beep, lights, dock, center, estop"},
        {"method": "WS", "path": "/ws/control", "summary": "Ten sam protokół co UDP, plus telemetria"},
        {"method": "UDP", "path": f":{DISCOVER_PORT}", "summary": "Broadcast RPILOT_DISCOVER → RPILOT_HERE"},
        {"method": "UDP", "path": f":{CONTROL_PORT}", "summary": "Pakiety drive/stop/cmd w JSON"},
    ]

    @app.get("/api/info")
    async def api_info() -> dict[str, Any]:
        return robot.info()

    @app.get("/api/status")
    async def api_status() -> dict[str, Any]:
        return robot.state.snapshot(robot.motors.mode)

    @app.get("/api/health")
    async def api_health() -> dict[str, Any]:
        return {"ok": True, "id": ROBOT_ID}

    @app.get("/api/endpoints")
    async def api_endpoints() -> dict[str, Any]:
        return {"endpoints": ENDPOINTS}

    @app.get("/api/motors")
    async def api_motors() -> dict[str, Any]:
        return robot.state.snapshot(robot.motors.mode)["motors"]

    @app.post("/api/drive")
    async def api_drive(body: DriveIn) -> dict[str, Any]:
        robot.apply_drive(body.x, body.y)
        return {"ok": True}

    @app.post("/api/stop")
    async def api_stop() -> dict[str, Any]:
        robot.stop()
        return {"ok": True}

    @app.post("/api/command/{name}")
    async def api_command(name: str) -> dict[str, Any]:
        return robot.command(name)

    @app.websocket("/ws/control")
    async def ws_control(ws: WebSocket) -> None:
        await ws.accept()
        sockets.add(ws)
        robot.state.clients = len(sockets)
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    robot.handle_packet(msg)
        except WebSocketDisconnect:
            pass
        finally:
            sockets.discard(ws)
            robot.state.clients = len(sockets)

    async def telemetry() -> None:
        while True:
            await asyncio.sleep(0.1)
            payload = json.dumps(
                {"t": "status", "status": robot.state.snapshot(robot.motors.mode)}
            )
            dead: list[WebSocket] = []
            for ws in list(sockets):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                sockets.discard(ws)
            robot.state.clients = len(sockets)

    @app.on_event("startup")
    async def _startup() -> None:
        asyncio.create_task(telemetry())

    @app.get("/")
    async def index() -> Any:
        page = STATIC_DIR / "index.html"
        if page.exists():
            return FileResponse(page)
        return JSONResponse({"error": "ui missing"}, status_code=404)

    @app.get("/{path:path}")
    async def spa_fallback(path: str) -> Any:
        if path.startswith("api/") or path.startswith("ws/"):
            return JSONResponse({"error": "not found"}, status_code=404)
        target = (STATIC_DIR / path).resolve()
        try:
            target.relative_to(STATIC_DIR.resolve())
        except ValueError:
            return JSONResponse({"error": "not found"}, status_code=404)
        if target.is_file():
            return FileResponse(target)
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"error": "ui missing"}, status_code=404)

    return app


async def physics_loop(robot: Robot) -> None:
    last = time.monotonic()
    while True:
        await asyncio.sleep(1 / 40)
        now = time.monotonic()
        robot.step(now - last)
        last = now


async def run(host: str, http_port: int) -> None:
    robot = Robot()
    app = build_app(robot)
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(
        lambda: DiscoveryProtocol(robot),
        local_addr=("0.0.0.0", DISCOVER_PORT),
        allow_broadcast=True,
    )
    await loop.create_datagram_endpoint(
        lambda: ControlProtocol(robot),
        local_addr=("0.0.0.0", CONTROL_PORT),
    )
    asyncio.create_task(physics_loop(robot))
    config = Config(app, host=host, port=http_port, log_level="info")
    server = Server(config)
    print(
        f"RPilot agent '{ROBOT_NAME}' ({ROBOT_ID})\n"
        f"  HTTP  http://{local_ip()}:{http_port}\n"
        f"  UDP discover :{DISCOVER_PORT}  control :{CONTROL_PORT}\n"
        f"  napęd: {robot.motors.mode}",
        flush=True,
    )
    await server.serve()


def main() -> None:
    parser = argparse.ArgumentParser(description="RPilot Raspberry Pi agent")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=HTTP_PORT)
    args = parser.parse_args()
    try:
        asyncio.run(run(args.host, args.port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
