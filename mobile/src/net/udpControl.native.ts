import { Buffer } from 'buffer';
import type { RobotInfo, RobotStatus } from '../protocol';
import { udpNativeAvailable } from './udpNative';

export type UdpLink = {
  send: (packet: object) => void;
  close: () => void;
};

function loadUdp() {
  try {
    if (!udpNativeAvailable()) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-udp');
    return (mod.default ?? mod) as {
      createSocket: (opts: { type: string; reusePort?: boolean }) => {
        on: (ev: string, cb: (...args: never[]) => void) => void;
        bind: (port: number, cb?: () => void) => void;
        close: () => void;
        send: (buf: Buffer, off: number, len: number, port: number, ip: string) => void;
      };
    };
  } catch {
    return null;
  }
}

export function openUdpControl(
  info: RobotInfo,
  onStatus: (status: RobotStatus) => void,
): UdpLink | null {
  const dgram = loadUdp();
  if (!dgram) return null;

  let socket: ReturnType<typeof dgram.createSocket> | null = null;
  try {
    socket = dgram.createSocket({ type: 'udp4', reusePort: true });
  } catch {
    return null;
  }

  socket.on('message', (msg) => {
    try {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg as Buffer).toString('utf8');
      const parsed = JSON.parse(raw) as { t?: string; type?: string; status?: RobotStatus };
      if (parsed.status) onStatus(parsed.status);
    } catch {
      /* ignore malformed telemetry */
    }
  });

  socket.bind(0);

  const host = info.host.replace(/^https?:\/\//, '').split(':')[0];

  return {
    send(packet: object) {
      const buf = Buffer.from(JSON.stringify(packet));
      try {
        socket?.send(buf, 0, buf.length, info.udpPort, host);
      } catch {
        /* drop if radio is busy */
      }
    },
    close() {
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
      socket = null;
    },
  };
}
