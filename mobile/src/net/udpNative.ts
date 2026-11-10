import { NativeModules } from 'react-native';
import { Platform } from 'react-native';

/**
 * Czy natywny moduł UDP jest w buildzie.
 * Expo Go → zwykle false. APK z react-native-udp → true po autolinku.
 */
export function udpNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    if (NativeModules?.UdpSockets != null) return true;
  } catch {
    /* ignore */
  }
  // Po autolinku w APK require i tak zadziała — udpSocket.ts robi właściwy check.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-udp');
    return !!(mod?.default ?? mod)?.createSocket;
  } catch {
    return false;
  }
}
