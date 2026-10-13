import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PadBindings } from './gamepadBindings';
import { DEFAULT_PAD_BINDINGS } from './gamepadBindings';
import { PROTOCOL, type RobotInfo } from './protocol';

const LAST_KEY = 'rpilot.lastRobot';
const VOL_PREFIX = 'rpilot.speaker.vol.';
const PAD_KEY = 'rpilot.pad.bindings';
const CUSTOM_DANCE_KEY = 'rpilot.custom.dance';

export type StoredCustomDance = {
  name: string;
  blocks: {
    id: string;
    kind: string;
    sec: number;
    powerPct: number;
  }[];
};

export async function loadCustomDance(): Promise<StoredCustomDance | null> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_DANCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCustomDance;
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCustomDance(dance: StoredCustomDance): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_DANCE_KEY, JSON.stringify(dance));
  } catch {
    /* ignore */
  }
}

export async function saveLastRobot(info: RobotInfo): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_KEY, JSON.stringify(info));
  } catch {
    // ignore quota / native storage errors
  }
}

export async function loadLastRobot(): Promise<RobotInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RobotInfo;
    if (!parsed?.host || !parsed?.id) return null;
    return {
      ...parsed,
      wsPort: parsed.wsPort || PROTOCOL.wsPort,
      sitePort: parsed.sitePort || PROTOCOL.sitePort,
      udpPort: parsed.udpPort || PROTOCOL.controlPort,
      httpPort: parsed.httpPort || PROTOCOL.httpPort,
    };
  } catch {
    return null;
  }
}

export async function loadSoundVolume(fileName: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(VOL_PREFIX + fileName);
    const n = raw == null ? 100 : Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
  } catch {
    return 100;
  }
}

export async function saveSoundVolume(fileName: string, percent: number): Promise<void> {
  try {
    await AsyncStorage.setItem(VOL_PREFIX + fileName, String(Math.max(0, Math.min(100, percent))));
  } catch {
    /* ignore */
  }
}

export async function loadPadBindings(): Promise<PadBindings> {
  try {
    const raw = await AsyncStorage.getItem(PAD_KEY);
    if (!raw) return { ...DEFAULT_PAD_BINDINGS };
    const parsed = JSON.parse(raw) as PadBindings;
    return { ...DEFAULT_PAD_BINDINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PAD_BINDINGS };
  }
}

export async function savePadBindings(bindings: PadBindings): Promise<void> {
  try {
    await AsyncStorage.setItem(PAD_KEY, JSON.stringify(bindings));
  } catch {
    /* ignore */
  }
}

const SCRATCH_KEY = 'rpilot.scratch.program';

export async function loadScratchProgram(): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(SCRATCH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function saveScratchProgram(program: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(SCRATCH_KEY, JSON.stringify(program));
  } catch {
    /* ignore */
  }
}
