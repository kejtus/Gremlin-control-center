/**
 * Wspólny loader `react-native-udp` (APK). Expo Go / web → null.
 */
import { udpNativeAvailable } from './udpNative';

export type UdpSocket = {
  on: (ev: string, cb: (...args: unknown[]) => void) => void;
  bind: (port: number, address?: string, cb?: () => void) => void;
  close: () => void;
  setBroadcast?: (v: boolean) => void;
  send?: (buf: Buffer, off: number, len: number, port: number, ip: string) => void;
};

export type UdpFactory = {
  createSocket: (opts: { type: string; reusePort?: boolean }) => UdpSocket;
};

export function loadUdpFactory(): UdpFactory | null {
  try {
    if (!udpNativeAvailable()) {
      // Przed pierwszym linkiem NativeModules.UdpSockets bywa null — i tak spróbuj require.
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-udp');
    const udp = (mod?.default ?? mod) as UdpFactory | null;
    if (!udp || typeof udp.createSocket !== 'function') return null;
    return udp;
  } catch {
    return null;
  }
}

export function udpSocketAvailable(): boolean {
  return loadUdpFactory() != null;
}
