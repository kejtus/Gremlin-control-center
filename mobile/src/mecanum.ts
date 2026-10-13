import { PROTOCOL, type MotorPairs } from './protocol';

export const WHEEL_ROLES = ['FL', 'FR', 'RL', 'RR'] as const;

export const DEFAULT_MOTOR_PAIRS: MotorPairs = {
  FL: [0, 1],
  FR: [3, 2],
  RL: [4, 5],
  RR: [7, 6],
};

const DIRECTIONS: Record<string, Record<string, number>> = {
  Przód: { FL: -1, FR: -1, RL: -1, RR: -1 },
  Tył: { FL: 1, FR: 1, RL: 1, RR: 1 },
  Prawo: { FL: 1, FR: -1, RL: 1, RR: -1 },
  Lewo: { FL: -1, FR: 1, RL: -1, RR: 1 },
  'Full lewo': { FL: 1, FR: -1, RL: -1, RR: 1 },
  'Full prawo': { FL: -1, FR: 1, RL: 1, RR: -1 },
};

export function computeChannelValuesFromVector(
  vy: number,
  vx: number,
  omega: number,
  maxPwm: number,
  motorPairs: MotorPairs = DEFAULT_MOTOR_PAIRS,
): Record<number, number> {
  const channelValues: Record<number, number> = {};
  for (let i = 0; i < 8; i++) channelValues[i] = 0;

  for (const role of WHEEL_ROLES) {
    const pair = motorPairs[role];
    if (!pair) continue;
    const [fCh, bCh] = pair;
    const net =
      (vy * (DIRECTIONS.Przód[role] || 0) +
        vx * (DIRECTIONS['Full prawo'][role] || 0) +
        omega * (DIRECTIONS.Prawo[role] || 0)) *
      maxPwm;
    if (net > 0) {
      channelValues[fCh] = Math.round(Math.min(net, maxPwm));
      channelValues[bCh] = 0;
    } else if (net < 0) {
      channelValues[fCh] = 0;
      channelValues[bCh] = Math.round(Math.min(-net, maxPwm));
    } else {
      channelValues[fCh] = 0;
      channelValues[bCh] = 0;
    }
  }
  return channelValues;
}

export function motorPackets(channels: Record<number, number>): { type: 'motor'; channel: number; pwm: number }[] {
  const cap = PROTOCOL.driveMaxPwm;
  return Array.from({ length: 8 }, (_, channel) => ({
    type: 'motor' as const,
    channel,
    pwm: Math.max(0, Math.min(cap, Math.round(channels[channel] ?? 0))),
  }));
}

export function powerToPwm(power01: number): number {
  return Math.round(Math.max(0, Math.min(1, power01)) * PROTOCOL.driveMaxPwm);
}

export type DrivePose = { vx: number; vy: number; omega: number };

const ZERO_POSE: DrivePose = { vx: 0, vy: 0, omega: 0 };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return clamp01(v);
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? clamp01(n) : null;
  }
  return null;
}

/** Odtwarza wektor z PWM kół (gdy pad na Pi kręci silnikami). */
export function vectorFromChannels(
  channels: Record<number, number> | undefined,
  motorPairs: MotorPairs = DEFAULT_MOTOR_PAIRS,
  maxPwm = PROTOCOL.maxPwm,
): DrivePose {
  if (!channels || maxPwm <= 0) return ZERO_POSE;
  const net = (role: (typeof WHEEL_ROLES)[number]) => {
    const pair = motorPairs[role];
    if (!pair) return 0;
    return ((channels[pair[0]] ?? 0) - (channels[pair[1]] ?? 0)) / maxPwm;
  };
  const fl = net('FL');
  const fr = net('FR');
  const rl = net('RL');
  const rr = net('RR');
  return {
    vy: clamp01(-(fl + fr + rl + rr) / 4),
    vx: clamp01((-fl + fr + rl - rr) / 4),
    omega: clamp01((fl - fr + rl - rr) / 4),
  };
}

type StickXY = { x?: unknown; y?: unknown };

/** Telemetria pada z Pi: vx/vy/omega, osie, albo lewy/prawy drążek. */
export function parseRemoteDrive(msg: Record<string, unknown>): DrivePose | null {
  if (!msg || typeof msg !== 'object') return null;

  const from = (vx: unknown, vy: unknown, omega: unknown): DrivePose | null => {
    const x = num(vx);
    const y = num(vy);
    const w = num(omega);
    if (x == null && y == null && w == null) return null;
    return { vx: x ?? 0, vy: y ?? 0, omega: w ?? 0 };
  };

  const direct = from(
    msg.vx ?? msg.move_x,
    msg.vy ?? msg.move_y,
    msg.omega ?? msg.yaw ?? msg.rz,
  );
  if (direct) return direct;

  if (Array.isArray(msg.axes) && msg.axes.length >= 2) {
    const a = msg.axes as unknown[];
    return {
      vx: num(a[0]) ?? 0,
      vy: -(num(a[1]) ?? 0),
      omega: num(a[2]) ?? num(a[5]) ?? 0,
    };
  }

  const rotate = msg.rotate as StickXY | undefined;
  const move = msg.move as StickXY | undefined;
  if (rotate || move) {
    return from(move?.x, move?.y, rotate?.x);
  }

  const left = msg.left as StickXY | undefined;
  const right = msg.right as StickXY | undefined;
  if (left || right) {
    // Pad na Pi (Xbox): lewy = jazda, prawy = obrót.
    return from(left?.x, left?.y, right?.x);
  }

  return null;
}
