"""Mecanum mixing identical to gremlin/site/public/tabs/control.js."""

from __future__ import annotations

WHEEL_ROLES = ("FL", "FR", "RL", "RR")

# Fallback when /api/robot-config is unavailable — same defaults as control.js.
DEFAULT_MOTOR_PAIRS = {
    "FL": (0, 1),
    "FR": (2, 3),
    "RL": (5, 4),
    "RR": (7, 6),
}

DIRECTIONS = {
    "Przód": {"FL": -1, "FR": -1, "RL": -1, "RR": -1},
    "Tył": {"FL": 1, "FR": 1, "RL": 1, "RR": 1},
    "Prawo": {"FL": 1, "FR": -1, "RL": 1, "RR": -1},
    "Lewo": {"FL": -1, "FR": 1, "RL": -1, "RR": 1},
    "Full lewo": {"FL": 1, "FR": -1, "RL": -1, "RR": 1},
    "Full prawo": {"FL": -1, "FR": 1, "RL": 1, "RR": -1},
}


def _pairs(motor_pairs: dict | None) -> dict[str, tuple[int, int]]:
    src = motor_pairs or DEFAULT_MOTOR_PAIRS
    out: dict[str, tuple[int, int]] = {}
    for role in WHEEL_ROLES:
        pair = src.get(role)
        if not pair or len(pair) != 2:
            continue
        out[role] = (int(pair[0]), int(pair[1]))
    return out


def compute_channel_values(
    active_directions: set[str],
    pwm_val: int,
    motor_pairs: dict | None = None,
) -> dict[int, int]:
    pairs = _pairs(motor_pairs)
    channel_values = {i: 0 for i in range(8)}
    for role, (f_ch, b_ch) in pairs.items():
        net = 0
        for direction in active_directions:
            net += (DIRECTIONS.get(direction) or {}).get(role, 0) * pwm_val
        if net > 0:
            channel_values[f_ch] = min(net, pwm_val)
            channel_values[b_ch] = 0
        elif net < 0:
            channel_values[f_ch] = 0
            channel_values[b_ch] = min(abs(net), pwm_val)
        else:
            channel_values[f_ch] = 0
            channel_values[b_ch] = 0
    return channel_values


def compute_channel_values_from_vector(
    vy: float,
    vx: float,
    omega: float,
    max_pwm: int,
    motor_pairs: dict | None = None,
) -> dict[int, int]:
    pairs = _pairs(motor_pairs)
    channel_values = {i: 0 for i in range(8)}
    for role, (f_ch, b_ch) in pairs.items():
        vy_sign = DIRECTIONS["Przód"].get(role, 0)
        vx_sign = DIRECTIONS["Full prawo"].get(role, 0)
        omega_sign = DIRECTIONS["Prawo"].get(role, 0)
        net = (vy * vy_sign + vx * vx_sign + omega * omega_sign) * max_pwm
        if net > 0:
            channel_values[f_ch] = int(round(min(net, max_pwm)))
            channel_values[b_ch] = 0
        elif net < 0:
            channel_values[f_ch] = 0
            channel_values[b_ch] = int(round(min(-net, max_pwm)))
        else:
            channel_values[f_ch] = 0
            channel_values[b_ch] = 0
    return channel_values


def motor_packets(channels: dict[int, int]) -> list[dict]:
    return [{"type": "motor", "channel": ch, "pwm": int(pwm)} for ch, pwm in sorted(channels.items())]
