import { Buffer } from 'buffer';
import type { LidarPoint } from '../lidar';
import { PROTOCOL } from '../protocol';
import { EldpAssembler } from './eldpLidar';
import { loadUdpFactory } from './udpSocket';

export type LidarUdpLink = {
  close: () => void;
};

/**
 * Odbiera przetworzone chmury punktów ESP LiDAR (ELDP) na `forward_port` Pi.
 * W config.json na Pi: forward_host = IP tabletu, forward_port = ten port.
 */
export function openLidarUdp(
  onFrame: (points: LidarPoint[]) => void,
  onEvent?: (ev: { type: 'open' | 'error'; message?: string }) => void,
  port = PROTOCOL.espLidarUdpPort,
): LidarUdpLink | null {
  const dgram = loadUdpFactory();
  if (!dgram) {
    onEvent?.({
      type: 'error',
      message: 'UDP LiDAR tylko w APK (brak react-native-udp w Expo Go).',
    });
    return null;
  }

  let socket: ReturnType<typeof dgram.createSocket> | null = null;
  try {
    socket = dgram.createSocket({ type: 'udp4', reusePort: true });
  } catch {
    onEvent?.({ type: 'error', message: 'Nie utworzono gniazda UDP LiDAR.' });
    return null;
  }

  const asm = new EldpAssembler();
  socket.on('message', (msg) => {
    const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as Uint8Array);
    const points = asm.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    if (points) onFrame(points);
  });
  socket.on('error', () => {
    onEvent?.({ type: 'error', message: `UDP LiDAR :${port} — błąd gniazda.` });
  });
  socket.bind(port, '0.0.0.0', () => onEvent?.({ type: 'open' }));

  return {
    close() {
      asm.close();
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      socket = null;
    },
  };
}

export function lidarUdpAvailable(): boolean {
  return loadUdpFactory() != null;
}
