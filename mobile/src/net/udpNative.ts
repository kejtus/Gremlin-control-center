import { NativeModules } from 'react-native';

/** Expo Go nie zawiera natywnego UDP — sam require('react-native-udp') tego nie wykryje. */
export function udpNativeAvailable(): boolean {
  return NativeModules.UdpSockets != null;
}
