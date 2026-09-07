import json

from mecanum import compute_channel_values, compute_channel_values_from_vector
from rpilot_agent import GremlinSim, HERE_MAGIC, DISCOVER_MAGIC, WS_PORT


def test_forward_matches_js_runtime():
    values = compute_channel_values({"Przód"}, 100)
    assert values[1] == 100
    assert values[0] == 0
    assert values[3] == 100
    assert values[2] == 0


def test_vector_forward_equals_przod():
    vec = compute_channel_values_from_vector(1, 0, 0, 100)
    buttons = compute_channel_values({"Przód"}, 100)
    assert vec == buttons


def test_vector_strafe_right():
    vec = compute_channel_values_from_vector(0, 1, 0, 100)
    buttons = compute_channel_values({"Full prawo"}, 100)
    assert vec == buttons


def test_gremlin_motor_command():
    robot = GremlinSim()
    robot.handle({"type": "motor", "channel": 3, "pwm": 1500})
    assert robot.channels[3] == 1500
    assert robot.snapshot()["wheels"]["FR"] == 1500


def test_gremlin_program_status():
    robot = GremlinSim()
    out = robot.handle({"type": "get_program_status"})
    assert out["type"] == "program_status"
    assert out["status"] == "on"


def test_gremlin_ads1115():
    robot = GremlinSim()
    out = robot.handle({"type": "get_ads1115_values"})
    assert out["type"] == "ads1115_values"
    assert out["values"]["a0"] > 10


def test_safety_timeout_clears_pwm():
    robot = GremlinSim()
    robot.handle({"type": "motor", "channel": 0, "pwm": 2000})
    robot.last_cmd -= 1.0
    robot.step(0.05)
    assert robot.channels[0] == 0


def test_discovery_magic():
    payload = {"id": "gremlin", "name": "Gremlin", "wsPort": WS_PORT}
    raw = f"{HERE_MAGIC}\n{json.dumps(payload)}"
    assert raw.startswith("GREMLIN_HERE")
    assert DISCOVER_MAGIC == "GREMLIN_DISCOVER"
