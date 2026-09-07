import { Buffer } from 'buffer';
import dgram from 'react-native-udp';
import { PROTOCOL, type RobotInfo, type RobotStatus } from '../protocol';

export type UdpLink = {
  send: (packet: object) => void;
  close: () => void;
};

export function openUdpControl(
  info: RobotInfo,
  onStatus: (status: RobotStatus) => void,
): UdpLink | null {
  let socket: ReturnType<typeof dgram.createSocket> | null = null;
  try {
    socket = dgram.createSocket({ type: 'udp4', reusePort: true });
  } catch {
    return null;
  }

  socket.on('message', (msg) => {
    try {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg).toString('utf8');
      const parsed = JSON.parse(raw) as { t?: string; status?: RobotStatus };
      if (parsed.t === 'status' && parsed.status) onStatus(parsed.status);
    } catch {
      // ignore malformed telemetry
    }
  });

  socket.bind(0);

  return {
    send(packet: object) {
      const buf = Buffer.from(JSON.stringify(packet));
      try {
        socket?.send(buf, 0, buf.length, info.udpPort, info.host);
      } catch {
        // drop if radio is busy
      }
    },
    close() {
      try {
        socket?.close();
      } catch {
        // already closed
      }
      socket = null;
    },
  };
}
