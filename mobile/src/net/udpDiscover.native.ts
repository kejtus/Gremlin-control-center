import { Buffer } from 'buffer';
import { parseHerePayload, PROTOCOL, type RobotInfo } from '../protocol';
import { udpNativeAvailable } from './udpNative';

function loadUdp() {
  try {
    if (!udpNativeAvailable()) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-udp');
    return (mod.default ?? mod) as {
      createSocket: (opts: { type: string; reusePort?: boolean }) => {
        on: (ev: string, cb: (...args: never[]) => void) => void;
        bind: (port: number, cb: () => void) => void;
        close: () => void;
        setBroadcast: (v: boolean) => void;
        send: (buf: Buffer, off: number, len: number, port: number, ip: string) => void;
      };
    };
  } catch {
    return null;
  }
}

export function udpAvailable(): boolean {
  return loadUdp() != null;
}

export async function discoverRobots(timeoutMs: number): Promise<RobotInfo[]> {
  const dgram = loadUdp();
  if (!dgram) return [];

  return new Promise((resolve) => {
    const found = new Map<string, RobotInfo>();
    let socket: ReturnType<typeof dgram.createSocket> | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
      resolve([...found.values()]);
    };

    try {
      socket = dgram.createSocket({ type: 'udp4', reusePort: true });
    } catch {
      resolve([]);
      return;
    }

    socket.on('error', () => finish());
    socket.on('message', (msg, rinfo) => {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg as Buffer).toString('utf8');
      const info = parseHerePayload(raw, (rinfo as { address: string }).address);
      if (info) found.set(info.id, info);
    });

    socket.bind(0, () => {
      try {
        socket?.setBroadcast(true);
      } catch {
        /* some firmwares reject setBroadcast */
      }
      const payload = Buffer.from(`${PROTOCOL.magicDiscover}\n{"proto":${PROTOCOL.proto}}`);
      for (const ip of ['255.255.255.255', '224.0.0.1']) {
        try {
          socket?.send(payload, 0, payload.length, PROTOCOL.discoverPort, ip);
        } catch {
          /* ignore per-target failures */
        }
      }
    });

    setTimeout(finish, timeoutMs);
  });
}
