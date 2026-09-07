import { Buffer } from 'buffer';
import dgram from 'react-native-udp';
import { parseHerePayload, PROTOCOL, type RobotInfo } from '../protocol';

export function udpAvailable(): boolean {
  return true;
}

export async function discoverRobots(timeoutMs: number): Promise<RobotInfo[]> {
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
        // already closed
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
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg).toString('utf8');
      const info = parseHerePayload(raw, rinfo.address);
      if (info) found.set(info.id, info);
    });

    socket.bind(0, () => {
      try {
        socket?.setBroadcast(true);
      } catch {
        // some firmwares reject setBroadcast; still try directed broadcast
      }
      const payload = Buffer.from(`${PROTOCOL.magicDiscover}\n{"proto":${PROTOCOL.proto}}`);
      const targets = ['255.255.255.255', '224.0.0.1'];
      for (const ip of targets) {
        try {
          socket?.send(payload, 0, payload.length, PROTOCOL.discoverPort, ip);
        } catch {
          // ignore per-target failures
        }
      }
    });

    setTimeout(finish, timeoutMs);
  });
}
