import { PROTOCOL, type MotorPairs } from './protocol';

export const WHEEL_ROLES = ['FL', 'FR', 'RL', 'RR'] as const;

export const DEFAULT_MOTOR_PAIRS: MotorPairs = {
  FL: [0, 1],
  FR: [2, 3],
  RL: [5, 4],
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
  return Object.keys(channels).map((k) => {
    const channel = Number(k);
    return { type: 'motor' as const, channel, pwm: channels[channel] ?? 0 };
  });
}

export function powerToPwm(power01: number): number {
  return Math.round(Math.max(0, Math.min(1, power01)) * PROTOCOL.maxPwm);
}
