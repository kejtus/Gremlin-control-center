#!/usr/bin/env python3
"""Gremlin-compatible simulator for the phone app and cloud preview.

Speaks the same WebSocket contract as frykol/gremlin (websocket-rewrite):
motor / gpio / ads1115 / program_status on :8765, plus UDP discovery so a
phone can find this process the same way it finds the Pi.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import socket
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from uvicorn import Config, Server

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mecanum import compute_channel_values_from_vector

DISCOVER_MAGIC = "GREMLIN_DISCOVER"
HERE_MAGIC = "GREMLIN_HERE"
DISCOVER_PORT = int(os.environ.get("GREMLIN_DISCOVER_PORT", "45454"))
CONTROL_UDP_PORT = int(os.environ.get("GREMLIN_CONTROL_UDP_PORT", "45455"))
WS_PORT = int(os.environ.get("GREMLIN_WS_PORT", "8765"))
HTTP_PORT = int(os.environ.get("GREMLIN_HTTP_PORT", "8742"))
SITE_PORT = int(os.environ.get("GREMLIN_SITE_PORT", "3000"))
ROBOT_NAME = os.environ.get("GREMLIN_NAME", "Gremlin")
ROBOT_ID = os.environ.get("GREMLIN_ID", "gremlin")
STATIC_DIR = Path(__file__).resolve().parent / "static"
SAFETY_TIMEOUT = 0.35
ARENA = 10.0
MAX_PWM = 4095

MOTOR_PAIRS = {
    "FL": [0, 1],
    "FR": [3, 2],
    "RL": [4, 5],
    "RR": [7, 6],
}

ROBOT_CONFIG = {
    "dev": True,
    "is_custom": False,
    "motors": MOTOR_PAIRS,
    "ws_server": {"host": "0.0.0.0", "port": WS_PORT, "bind_host": "0.0.0.0"},
    "camera_stream": {"udp_host": "127.0.0.1", "udp_port": 9000, "chunk_size": 1400},
    "ads1115": {
        "a0_percent_range": {"min_volts": 10, "max_volts": 16},
        "shutdown_min_voltage": 12,
        "is_dummy": True,
    },
    "enable_site": True,
}


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
    omega: float = 0.0
    vy: float | None = None
    vx: float | None = None
    power: float | None = None


class GremlinSim:
    def __init__(self) -> None:
        self.channels = {i: 0 for i in range(8)}
        self.x = ARENA / 2
        self.y = ARENA / 2
        self.heading = 0.0
        self.battery_v = 14.2
        self.program_on = True
        self.follow_band = False
        self.stream_enabled = False
        self.last_cmd = 0.0
        self.started = time.monotonic()
        self.clients = 0
        self.video_sink: tuple[str, int] | None = None
        self.gpio: dict[str, int] = {}

    def info(self) -> dict[str, Any]:
        return {
            "id": ROBOT_ID,
            "name": ROBOT_NAME,
            "httpPort": HTTP_PORT,
            "wsPort": WS_PORT,
            "udpPort": CONTROL_UDP_PORT,
            "sitePort": SITE_PORT,
            "proto": 1,
            "ip": local_ip(),
            "mode": "sim",
        }

    def snapshot(self) -> dict[str, Any]:
        max_ch = max(self.channels.values()) if self.channels else 0
        battery_pct = _clamp((self.battery_v - 10.0) / 6.0, 0, 1) * 100
        return {
            "id": ROBOT_ID,
            "name": ROBOT_NAME,
            "connected": True,
            "uptimeSec": round(time.monotonic() - self.started, 1),
            "batteryPct": round(battery_pct, 1),
            "motors": {
                "left": round((self.channels.get(0, 0) - self.channels.get(1, 0)) / MAX_PWM, 3),
                "right": round((self.channels.get(2, 0) - self.channels.get(3, 0)) / MAX_PWM, 3),
            },
            "channels": dict(self.channels),
            "wheels": {
                role: max(self.channels.get(pair[0], 0), self.channels.get(pair[1], 0))
                for role, pair in MOTOR_PAIRS.items()
            },
            "pose": {
                "x": round(self.x, 3),
                "y": round(self.y, 3),
                "heading": round(self.heading, 4),
            },
            "lights": False,
            "estop": False,
            "lastCommandAgeMs": int(max(0.0, (time.monotonic() - self.last_cmd) * 1000))
            if self.last_cmd
            else None,
            "clients": self.clients,
            "mode": "sim",
            "programOn": self.program_on,
            "followBand": self.follow_band,
            "pwmPeak": max_ch,
            "arena": {"width": ARENA, "height": ARENA},
        }

    def set_channel(self, channel: int, pwm: int) -> None:
        self.channels[int(channel)] = max(0, min(MAX_PWM, int(pwm)))
        self.last_cmd = time.monotonic()

    def apply_vector(self, vy: float, vx: float, omega: float, power: float = 0.45) -> None:
        max_pwm = int(round(_clamp(power, 0, 1) * MAX_PWM))
        values = compute_channel_values_from_vector(vy, vx, omega, max_pwm, MOTOR_PAIRS)
        for ch, pwm in values.items():
            self.set_channel(ch, pwm)

    def stop(self) -> None:
        for ch in range(8):
            self.channels[ch] = 0
        self.last_cmd = time.monotonic()

    def handle(self, msg: dict[str, Any]) -> dict[str, Any] | None:
        if msg.get("send") == "status":
            return {"type": "status", "status": self.snapshot()}
        if msg.get("send") == "logs":
            return {"type": "logs", "file": ""}

        kind = msg.get("type")
        if kind == "motor":
            self.set_channel(int(msg.get("channel", 0)), int(msg.get("pwm", 0)))
        elif kind in {"drive", "vector"}:
            vy = float(msg.get("vy", msg.get("y", 0)))
            vx = float(msg.get("vx", msg.get("x", 0)))
            omega = float(msg.get("omega", 0))
            power = float(msg.get("power", 0.45))
            self.apply_vector(vy, vx, omega, power)
        elif kind == "stop":
            self.stop()
        elif kind == "gpio":
            self.gpio[str(msg.get("pin_name"))] = int(msg.get("value", 0))
        elif kind == "stream":
            self.stream_enabled = bool(msg.get("enabled"))
        elif kind == "register_video_sink":
            self.video_sink = (str(msg.get("host")), int(msg.get("port", 9000)))
        elif kind == "set_follow_band_mode":
            self.follow_band = bool(msg.get("enabled"))
        elif kind == "set_follow_band_speed":
            pass
        elif kind == "set_program_status":
            self.program_on = str(msg.get("status", "on")).lower() == "on"
            return {"type": "program_status", "status": "on" if self.program_on else "off"}
        elif kind == "get_program_status":
            return {"type": "program_status", "status": "on" if self.program_on else "off"}
        elif kind == "get_ads1115_values":
            return {
                "type": "ads1115_values",
                "values": {
                    "a0": self.battery_v,
                    "a1": 0.0,
                    "a2": 0.0,
                    "a3": 0.0,
                    "raw_a0": int(self.battery_v * 1000),
                    "raw_a1": 0,
                    "raw_a2": 0,
                    "raw_a3": 0,
                },
            }
        elif kind == "get_encoder_ticks":
            return {"type": "encoder_ticks", "ticks": {"FL": 0, "FR": 0, "RL": 0, "RR": 0}}
        elif kind == "get_slam_pose":
            return {
                "type": "slam_pose",
                "x_m": self.x / 10,
                "y_m": self.y / 10,
                "theta_deg": math.degrees(self.heading),
            }
        elif kind == "get_lidar_points":
            return {"type": "lidar_points", "points": []}
        elif kind == "play_sound":
            return {"type": "play_sound", "ok": True, "file": msg.get("file")}
        elif kind == "stop_sound":
            return {"type": "stop_sound", "ok": True}
        elif kind == "ping":
            return {"type": "pong"}
        return None

    def step(self, dt: float) -> None:
        if self.last_cmd and (time.monotonic() - self.last_cmd) > SAFETY_TIMEOUT:
            if any(self.channels.values()):
                self.stop()
        # Approximate chassis velocity from PWM peak on forward vs reverse pairs.
        fwd = (self.channels[0] + self.channels[2] + self.channels[4] + self.channels[6]) / 4
        rev = (self.channels[1] + self.channels[3] + self.channels[5] + self.channels[7]) / 4
        v = ((fwd - rev) / MAX_PWM) * 1.4
        yaw = ((self.channels[2] + self.channels[3]) - (self.channels[0] + self.channels[1])) / (2 * MAX_PWM)
        self.heading += yaw * 2.2 * dt
        self.x += math.cos(self.heading) * v * dt
        self.y += math.sin(self.heading) * v * dt
        self.x = _clamp(self.x, 0.3, ARENA - 0.3)
        self.y = _clamp(self.y, 0.3, ARENA - 0.3)
        self.battery_v = max(10.4, self.battery_v - abs(v) * 0.004 * dt)


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
            "httpPort": HTTP_PORT,
            "wsPort": WS_PORT,
            "udpPort": CONTROL_UDP_PORT,
            "sitePort": SITE_PORT,
            "proto": 1,
        }
        reply = f"{HERE_MAGIC}\n{json.dumps(payload)}".encode("utf-8")
        if self.transport is not None:
            self.transport.sendto(reply, addr)


class DriveProtocol(asyncio.DatagramProtocol):
    def __init__(self, robot: GremlinSim) -> None:
        self.robot = robot
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            msg = json.loads(data.decode("utf-8"))
        except json.JSONDecodeError:
            return
        if not isinstance(msg, dict):
            return
        extra = self.robot.handle(msg)
        body = {"type": "status", "status": self.robot.snapshot()}
        if extra:
            body["result"] = extra
        if self.transport is not None:
            self.transport.sendto(json.dumps(body).encode("utf-8"), addr)


def build_app(robot: GremlinSim) -> FastAPI:
    app = FastAPI(title="Gremlin", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    sockets: set[WebSocket] = set()

    ENDPOINTS = [
        {"method": "WS", "path": "ws://<ip>:8765", "summary": "Kanał sterowania Gremlin (motor, gpio, status)"},
        {"method": "WS", "path": "{type:motor, channel, pwm}", "summary": "PWM 0–4095 na kanale 0–7 (mecanum)"},
        {"method": "UDP", "path": f":{DISCOVER_PORT}", "summary": "Broadcast GREMLIN_DISCOVER → GREMLIN_HERE"},
        {"method": "GET", "path": "/api/robot-config", "summary": "config.json robota (mapowanie silników)"},
        {"method": "GET", "path": "/api/config", "summary": "Port UDP przekaźnika kamery (site)"},
        {"method": "GET", "path": "/api/sounds", "summary": "Lista dźwięków głośnika"},
        {"method": "WS", "path": "{type:get_ads1115_values}", "summary": "Napięcie akumulatora (A0)"},
        {"method": "WS", "path": "{type:get_encoder_ticks}", "summary": "Enkodery FL/FR/RL/RR"},
        {"method": "WS", "path": "{type:register_video_sink}", "summary": "Gdzie robot ma słać klatki UDP kamery"},
        {"method": "HTTP", "path": "http://<ip>:3000", "summary": "Pełny interfejs Gremlin na Raspberry Pi"},
    ]

    @app.get("/api/info")
    async def api_info() -> dict[str, Any]:
        return robot.info()

    @app.get("/api/status")
    async def api_status() -> dict[str, Any]:
        return robot.snapshot()

    @app.get("/api/health")
    async def api_health() -> dict[str, Any]:
        return {"ok": True, "id": ROBOT_ID}

    @app.get("/api/endpoints")
    async def api_endpoints() -> dict[str, Any]:
        return {"endpoints": ENDPOINTS}

    @app.get("/api/robot-config")
    async def api_robot_config() -> dict[str, Any]:
        return ROBOT_CONFIG

    @app.get("/api/config")
    async def api_config() -> dict[str, Any]:
        return {"udpPort": 9000}

    @app.get("/api/sounds")
    async def api_sounds() -> dict[str, Any]:
        return {"sounds": []}

    @app.post("/api/drive")
    async def api_drive(body: DriveIn) -> dict[str, Any]:
        vy = body.vy if body.vy is not None else body.y
        vx = body.vx if body.vx is not None else body.x
        power = body.power if body.power is not None else 0.45
        robot.apply_vector(vy, vx, body.omega, power)
        return {"ok": True, "channels": robot.channels}

    @app.post("/api/stop")
    async def api_stop() -> dict[str, Any]:
        robot.stop()
        return {"ok": True}

    async def _ws_loop(ws: WebSocket) -> None:
        sockets.add(ws)
        robot.clients = len(sockets)
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    extra = robot.handle(msg)
                    if extra:
                        await ws.send_text(json.dumps(extra))
        except WebSocketDisconnect:
            pass
        finally:
            sockets.discard(ws)
            robot.clients = len(sockets)

    @app.websocket("/ws")
    async def ws_alias(ws: WebSocket) -> None:
        await ws.accept()
        await _ws_loop(ws)

    @app.websocket("/ws/control")
    async def ws_control(ws: WebSocket) -> None:
        await ws.accept()
        await _ws_loop(ws)

    async def telemetry() -> None:
        while True:
            await asyncio.sleep(0.1)
            payload = json.dumps({"type": "status", "status": robot.snapshot()})
            dead: list[WebSocket] = []
            for ws in list(sockets):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                sockets.discard(ws)
            robot.clients = len(sockets)

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
        if path.startswith("api/") or path.startswith("ws"):
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


async def gremlin_ws_port(robot: GremlinSim, host: str, port: int) -> None:
    """Native Gremlin control port :8765 (websockets library, same JSON)."""
    try:
        from websockets.asyncio.server import serve
    except ImportError:
        print("pakiet websockets niedostępny — sterowanie tylko przez /ws na HTTP", flush=True)
        return

    async def handler(websocket) -> None:
        robot.clients += 1
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    extra = robot.handle(msg)
                    if extra:
                        await websocket.send(json.dumps(extra))
        finally:
            robot.clients = max(0, robot.clients - 1)

    async with serve(handler, host, port):
        print(f"  Gremlin WS  ws://{local_ip()}:{port}", flush=True)
        await asyncio.Future()


async def physics_loop(robot: GremlinSim) -> None:
    last = time.monotonic()
    while True:
        await asyncio.sleep(1 / 40)
        now = time.monotonic()
        robot.step(now - last)
        last = now


async def run(host: str, http_port: int, ws_port: int) -> None:
    robot = GremlinSim()
    app = build_app(robot)
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(
        DiscoveryProtocol,
        local_addr=("0.0.0.0", DISCOVER_PORT),
        allow_broadcast=True,
    )
    await loop.create_datagram_endpoint(
        lambda: DriveProtocol(robot),
        local_addr=("0.0.0.0", CONTROL_UDP_PORT),
    )
    asyncio.create_task(physics_loop(robot))
    asyncio.create_task(gremlin_ws_port(robot, host, ws_port))
    config = Config(app, host=host, port=http_port, log_level="info")
    server = Server(config)
    print(
        f"Gremlin sim '{ROBOT_NAME}'\n"
        f"  HTTP  http://{local_ip()}:{http_port}\n"
        f"  UDP discover :{DISCOVER_PORT}\n"
        f"  WS control :{ws_port}",
        flush=True,
    )
    await server.serve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Gremlin-compatible robot simulator")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=HTTP_PORT)
    parser.add_argument("--ws-port", type=int, default=WS_PORT)
    args = parser.parse_args()
    try:
        asyncio.run(run(args.host, args.port, args.ws_port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
