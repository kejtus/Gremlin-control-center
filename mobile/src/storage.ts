import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RobotInfo } from './protocol';

const LAST_KEY = 'rpilot.lastRobot';

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
    return parsed;
  } catch {
    return null;
  }
}
