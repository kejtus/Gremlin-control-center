import json
import math

from rpilot_agent import CONTROL_PORT, DISCOVER_MAGIC, HERE_MAGIC, HTTP_PORT, Robot


def test_arcade_mix_and_stop():
    robot = Robot()
    robot.apply_drive(0.5, 1.0)
    assert robot.state.left == 1.0
    assert 0.4 <= robot.state.right <= 0.6
    robot.stop()
    assert robot.state.left == 0
    assert robot.state.right == 0


def test_safety_timeout_stops_motors():
    robot = Robot()
    robot.apply_drive(0, 1)
    robot.state.last_cmd -= 1.0
    robot.step(0.05)
    assert robot.state.left == 0
    assert robot.state.right == 0


def test_physics_moves_forward():
    robot = Robot()
    start_x = robot.state.x
    robot.state.heading = 0.0
    robot.apply_drive(0, 1)
    for _ in range(20):
        robot.step(0.05)
    assert robot.state.x > start_x


def test_unknown_command():
    robot = Robot()
    out = robot.command("teleport")
    assert out["ok"] is False


def test_dock_and_center():
    robot = Robot()
    robot.command("dock")
    assert math.isclose(robot.state.y, 0.8)
    robot.command("center")
    assert math.isclose(robot.state.x, 5.0)


def test_udp_payload_roundtrip():
    payload = {
        "id": "rpilot-test",
        "name": "Robot",
        "httpPort": HTTP_PORT,
        "udpPort": CONTROL_PORT,
        "proto": 1,
    }
    raw = f"{HERE_MAGIC}\n{json.dumps(payload)}"
    assert raw.startswith(HERE_MAGIC)
    assert DISCOVER_MAGIC.startswith("RPILOT")
    body = json.loads(raw.split("\n", 1)[1])
    assert body["udpPort"] == CONTROL_PORT
