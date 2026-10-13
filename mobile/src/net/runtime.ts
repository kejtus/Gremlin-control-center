import { Platform } from 'react-native';

/** Expo Go na telefonie — bez natywnego UDP i bez skompilowanego mikrofonu. */
export function isExpoGo(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants');
    const c = (Constants.default ?? Constants) as {
      appOwnership?: string | null;
      executionEnvironment?: string;
    };
    return c.appOwnership === 'expo' || c.executionEnvironment === 'storeClient';
  } catch {
    return false;
  }
}

/** Zainstalowane APK / development build — telefon gada z Pi sam. */
export function isStandaloneNative(): boolean {
  return Platform.OS !== 'web' && !isExpoGo();
}

/**
 * Mostek kamery + proxy sterowania na PC (`./start.sh`).
 * Expo Go i przeglądarka z Metro nie mają surowego UDP do Pi —
 * ruch idzie telefon/PC → router → Pi (bez internetu).
 * APK omija PC i łączy się z Raspberry bezpośrednio.
 */
export function usesPcRelay(): boolean {
  return isExpoGo() || Platform.OS === 'web';
}
