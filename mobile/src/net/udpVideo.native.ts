import { Buffer } from 'buffer';
import { JpegAssembler } from './jpegFrames';
import { openJpegWs, type VideoEvent, type VideoLink } from './jpegWs';
import { getDevServerHost } from './lanIp';
import { PROTOCOL } from '../protocol';
import { usesPcRelay } from './runtime';
import { udpNativeAvailable } from './udpNative';

export type { VideoEvent, VideoLink };

function loadUdp() {
  try {
    if (!udpNativeAvailable()) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-udp');
    return (mod.default ?? mod) as {
      createSocket: (opts: { type: string; reusePort?: boolean }) => {
        on: (ev: string, cb: (...args: unknown[]) => void) => void;
        bind: (port: number, address?: string, cb?: () => void) => void;
        close: () => void;
      };
    };
  } catch {
    return null;
  }
}

function openBridge(
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
): VideoLink | null {
  const pc = getDevServerHost();
  if (!pc) {
    onEvent?.({
      type: 'error',
      message:
        'Expo Go: nie znam IP PC. Otwórz exp://<IP_PC>:41782 w tej samej Wi‑Fi (bez internetu) i odpal ./start.sh.',
    });
    return null;
  }
  const url = `ws://${pc}:${PROTOCOL.videoBridgePort}`;
  return openJpegWs(url, onFrame, (ev) => {
    if (ev.type === 'error') {
      onEvent?.({
        type: 'error',
        message: `Brak klatek z ${url} (LAN). Na PC: ./start.sh — mostek :${PROTOCOL.videoBridgePort}.`,
      });
      return;
    }
    onEvent?.(ev);
  });
}

export function openVideoIngress(
  port: number,
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
): VideoLink | null {
  // Expo Go: zawsze mostek WS na PC (Pi → UDP → PC → WS → telefon). Offline / tylko router.
  if (usesPcRelay()) {
    return openBridge(onFrame, onEvent);
  }

  const dgram = loadUdp();
  if (dgram) {
    let socket: ReturnType<typeof dgram.createSocket> | null = null;
    try {
      socket = dgram.createSocket({ type: 'udp4', reusePort: true });
    } catch {
      socket = null;
    }
    if (socket) {
      const asm = new JpegAssembler();
      socket.on('message', (msg) => {
        const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as Uint8Array);
        const frame = asm.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        if (frame) onFrame(frame);
      });
      socket.on('error', () => {
        onEvent?.({ type: 'error', message: `UDP :${port || PROTOCOL.videoUdpPort} — błąd gniazda.` });
      });
      socket.bind(port || PROTOCOL.videoUdpPort, '0.0.0.0', () => onEvent?.({ type: 'open' }));
      return {
        mode: 'udp',
        close() {
          try {
            socket?.close();
          } catch {
            /* ignore */
          }
          socket = null;
        },
      };
    }
  }

  onEvent?.({
    type: 'error',
    message: 'Kamera: Pi musi wysyłać JPEG UDP na ten telefon (:9000). W APK nie potrzeba mostka na PC.',
  });
  return null;
}
