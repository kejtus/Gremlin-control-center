import { Buffer } from 'buffer';
import { JpegAssembler } from './jpegFrames';
import { openJpegWs, type VideoEvent, type VideoLink } from './jpegWs';
import { getDevServerHost } from './lanIp';
import { getActiveRobotHost, getActiveSitePort } from './activeRobot';
import { PROTOCOL, robotHostname, videoWsUrl } from '../protocol';
import { usesPcRelay } from './runtime';
import { loadUdpFactory } from './udpSocket';

export type { VideoEvent, VideoLink };

function openBridgeOnPc(
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
): VideoLink | null {
  const pc = getDevServerHost();
  if (!pc) {
    onEvent?.({
      type: 'error',
      message:
        'Expo Go: nie znam IP PC. Otwórz exp://<IP_PC>:41782 w tej samej Wi‑Fi i odpal ./start.sh.',
    });
    return null;
  }
  const url = `ws://${pc}:${PROTOCOL.videoBridgePort}`;
  return openJpegWs(url, onFrame, (ev) => {
    if (ev.type === 'error') {
      onEvent?.({
        type: 'error',
        message: `Brak klatek z ${url}. Na PC: ./start.sh — mostek :${PROTOCOL.videoBridgePort}.`,
      });
      return;
    }
    onEvent?.(ev);
  });
}

function openSiteVideo(
  robotHost: string,
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
): VideoLink | null {
  const host = robotHostname(robotHost);
  const siteUrl = videoWsUrl({ host, sitePort: getActiveSitePort() || PROTOCOL.sitePort });
  return openJpegWs(siteUrl, onFrame, (ev) => {
    if (ev.type === 'error') {
      onEvent?.({
        type: 'error',
        message: `Brak ws://${host}:3000/video (zapas). Preferowany tor: UDP :${PROTOCOL.videoUdpPort} na tablet.`,
      });
      return;
    }
    onEvent?.(ev);
  });
}

/** APK: najpierw UDP JPEG na telefonie; zapas = panel :3000/video. */
export function openVideoIngress(
  port: number,
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
  robotHost?: string | null,
): VideoLink | null {
  if (usesPcRelay()) {
    return openBridgeOnPc(onFrame, onEvent);
  }

  const dgram = loadUdpFactory();
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
        onEvent?.({ type: 'error', message: `UDP kamera :${port || PROTOCOL.videoUdpPort} — błąd.` });
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

  const host = robotHost || getActiveRobotHost();
  if (host) {
    return openSiteVideo(host, onFrame, onEvent);
  }

  onEvent?.({
    type: 'error',
    message: 'Kamera: brak UDP i brak hosta Pi.',
  });
  return null;
}
