import { DEFAULT_MOTOR_PAIRS, WHEEL_ROLES } from './mecanum';
import { PROTOCOL, type MotorPairs } from './protocol';

export type DriveDirection = 'Przód' | 'Tył' | 'Lewo' | 'Prawo' | 'Full lewo' | 'Full prawo';

export const DIRECTIONS: Record<DriveDirection, Record<string, number>> = {
  Przód: { FL: -1, FR: -1, RL: -1, RR: -1 },
  Tył: { FL: 1, FR: 1, RL: 1, RR: 1 },
  Prawo: { FL: 1, FR: -1, RL: 1, RR: -1 },
  Lewo: { FL: -1, FR: 1, RL: -1, RR: 1 },
  'Full lewo': { FL: 1, FR: -1, RL: -1, RR: 1 },
  'Full prawo': { FL: -1, FR: 1, RL: 1, RR: -1 },
};

export type DanceStep = {
  dirs: DriveDirection[];
  ms: number;
  powerPct?: number;
};

export type Dance = {
  id: string;
  label: string;
  powerPct: number;
  steps: DanceStep[];
};

function spinjitsuSteps(): DanceStep[] {
  const stepCount = 20;
  const startPct = 8;
  const endPct = 65;
  const steps: DanceStep[] = [];
  for (let i = 0; i < stepCount; i++) {
    const t = i / (stepCount - 1);
    const logT = Math.log10(1 + 9 * t);
    const pct = Math.round(startPct + (endPct - startPct) * logT);
    steps.push({ dirs: ['Prawo'], ms: 350, powerPct: pct });
  }
  return steps;
}

/** Te same sekwencje co panel Gremlina (`site/public/tabs/control.js`). */
export const DANCES: Dance[] = [
  {
    id: 'bujanie',
    label: 'Bujanie',
    powerPct: 35,
    steps: [
      { dirs: ['Lewo'], ms: 350 },
      { dirs: ['Prawo'], ms: 350 },
      { dirs: ['Lewo'], ms: 350 },
      { dirs: ['Prawo'], ms: 350 },
      { dirs: ['Lewo'], ms: 350 },
      { dirs: ['Prawo'], ms: 350 },
    ],
  },
  {
    id: 'krok',
    label: 'Krok w bok',
    powerPct: 45,
    steps: [
      { dirs: ['Full lewo'], ms: 300 },
      { dirs: ['Full lewo'], ms: 300 },
      { dirs: [], ms: 150 },
      { dirs: ['Full prawo'], ms: 300 },
      { dirs: ['Full prawo'], ms: 300 },
      { dirs: [], ms: 150 },
      { dirs: ['Full lewo'], ms: 300 },
      { dirs: ['Full lewo'], ms: 300 },
      { dirs: [], ms: 150 },
      { dirs: ['Full prawo'], ms: 300 },
      { dirs: ['Full prawo'], ms: 300 },
    ],
  },
  {
    id: 'zygzak',
    label: 'Zygzak',
    powerPct: 40,
    steps: [
      { dirs: ['Przód', 'Lewo'], ms: 400 },
      { dirs: ['Tył', 'Prawo'], ms: 400 },
      { dirs: ['Przód', 'Prawo'], ms: 400 },
      { dirs: ['Tył', 'Lewo'], ms: 400 },
      { dirs: ['Przód', 'Lewo'], ms: 400 },
      { dirs: ['Tył', 'Prawo'], ms: 400 },
    ],
  },
  {
    id: 'szal',
    label: 'Szał',
    powerPct: 55,
    steps: [
      { dirs: ['Przód'], ms: 200 },
      { dirs: ['Full lewo'], ms: 200 },
      { dirs: ['Tył'], ms: 200 },
      { dirs: ['Full prawo'], ms: 200 },
      { dirs: ['Lewo'], ms: 200 },
      { dirs: ['Prawo'], ms: 200 },
      { dirs: ['Przód'], ms: 200 },
      { dirs: ['Tył'], ms: 200 },
    ],
  },
  {
    id: 'spinjitsu',
    label: 'Spinjitsu',
    powerPct: 10,
    steps: spinjitsuSteps(),
  },
];

export const READY_MOVES: { id: string; label: string; dirs: DriveDirection[]; powerPct: number }[] = [
  { id: 'fwd', label: 'Przód', dirs: ['Przód'], powerPct: 40 },
  { id: 'back', label: 'Tył', dirs: ['Tył'], powerPct: 40 },
  { id: 'spinL', label: 'Obrót w miejscu L', dirs: ['Lewo'], powerPct: 40 },
  { id: 'spinR', label: 'Obrót w miejscu P', dirs: ['Prawo'], powerPct: 40 },
  { id: 'strafeL', label: 'Bok L', dirs: ['Full lewo'], powerPct: 40 },
  { id: 'strafeR', label: 'Bok P', dirs: ['Full prawo'], powerPct: 40 },
];

/** Lookup po id (w tym stare aliasy left/right z pad bindingów). */
export function readyMoveById(id: string | undefined) {
  if (!id) return undefined;
  if (id === 'left') return READY_MOVES.find((m) => m.id === 'spinL');
  if (id === 'right') return READY_MOVES.find((m) => m.id === 'spinR');
  return READY_MOVES.find((m) => m.id === id);
}

/** Bloczki do układania własnego tańca (jak Scratch). */
export type DanceBlockKind =
  | 'fwd'
  | 'back'
  | 'strafeL'
  | 'strafeR'
  | 'spinL'
  | 'spinR'
  | 'wait';

export type DanceBlockDef = {
  kind: DanceBlockKind;
  label: string;
  /** Krótki tytuł na klocku. */
  title: string;
  dirs: DriveDirection[];
  color: string;
  defaultSec: number;
  defaultPower: number;
};

export const DANCE_BLOCKS: DanceBlockDef[] = [
  { kind: 'fwd', label: 'Idź do przodu', title: 'PRZÓD', dirs: ['Przód'], color: '#4CAF50', defaultSec: 1, defaultPower: 40 },
  { kind: 'back', label: 'Idź do tyłu', title: 'TYŁ', dirs: ['Tył'], color: '#8BC34A', defaultSec: 1, defaultPower: 40 },
  { kind: 'strafeL', label: 'Jedź w lewo (bok)', title: 'BOK L', dirs: ['Full lewo'], color: '#2196F3', defaultSec: 1, defaultPower: 40 },
  { kind: 'strafeR', label: 'Jedź w prawo (bok)', title: 'BOK P', dirs: ['Full prawo'], color: '#03A9F4', defaultSec: 1, defaultPower: 40 },
  { kind: 'spinL', label: 'Obrót w miejscu w lewo', title: 'OBRÓT L', dirs: ['Lewo'], color: '#FF9800', defaultSec: 1, defaultPower: 40 },
  { kind: 'spinR', label: 'Obrót w miejscu w prawo', title: 'OBRÓT P', dirs: ['Prawo'], color: '#FF5722', defaultSec: 1, defaultPower: 40 },
  { kind: 'wait', label: 'Czekaj / stop', title: 'CZEKAJ', dirs: [], color: '#78909C', defaultSec: 0.5, defaultPower: 0 },
];

export type CustomDanceBlock = {
  id: string;
  kind: DanceBlockKind;
  /** Czas w sekundach. */
  sec: number;
  powerPct: number;
};

export function blockDef(kind: DanceBlockKind): DanceBlockDef {
  return DANCE_BLOCKS.find((b) => b.kind === kind) ?? DANCE_BLOCKS[DANCE_BLOCKS.length - 1];
}

export function customBlocksToDance(name: string, blocks: CustomDanceBlock[], powerPct = 40): Dance {
  return {
    id: `custom-${Date.now()}`,
    label: name.trim() || 'Mój taniec',
    powerPct,
    steps: blocks.map((b) => {
      const def = blockDef(b.kind);
      return {
        dirs: def.dirs,
        ms: Math.max(50, Math.round(b.sec * 1000)),
        powerPct: def.kind === 'wait' ? 0 : b.powerPct,
      };
    }),
  };
}

/** Jak `computeChannelValues` w control.js Gremlina. */
export function computeChannelValues(
  activeDirections: Iterable<string>,
  pwmVal: number,
  motorPairs: MotorPairs = DEFAULT_MOTOR_PAIRS,
): Record<number, number> {
  const channelValues: Record<number, number> = {};
  for (let i = 0; i < 8; i++) channelValues[i] = 0;
  const dirs = [...activeDirections];
  const maxPwm = Math.max(0, Math.min(PROTOCOL.driveMaxPwm, Math.round(pwmVal)));

  for (const role of WHEEL_ROLES) {
    const pair = motorPairs[role];
    if (!pair) continue;
    const [fCh, bCh] = pair;
    let net = 0;
    for (const dir of dirs) {
      const sign = (DIRECTIONS[dir as DriveDirection] || {})[role] || 0;
      net += sign * maxPwm;
    }
    if (net > 0) {
      channelValues[fCh] = Math.min(net, maxPwm);
      channelValues[bCh] = 0;
    } else if (net < 0) {
      channelValues[fCh] = 0;
      channelValues[bCh] = Math.min(Math.abs(net), maxPwm);
    } else {
      channelValues[fCh] = 0;
      channelValues[bCh] = 0;
    }
  }
  return channelValues;
}

export function channelsFromDirs(dirs: string[], powerPct: number, pairs?: MotorPairs) {
  const pwm = Math.round((Math.max(0, Math.min(100, powerPct)) / 100) * PROTOCOL.driveMaxPwm);
  return computeChannelValues(dirs, pwm, pairs);
}
