import { getDevServerHost } from './lanIp';
import { PROTOCOL } from '../protocol';

export type VideoEvent = { type: 'open' | 'error' | 'close'; message?: string };

export type VideoLink = {
  mode: 'udp' | 'bridge';
  close: () => void;
};

function rafNow(cb: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(cb, 16) as unknown as number;
}

function cancelRaf(id: number) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}

/** Najnowsza klatka, jedna na tick ekranu — bez dodatkowej kolejki FPS. */
export function openJpegWs(
  url: string,
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
): VideoLink | null {
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    onEvent?.({ type: 'error', message: `Nie otwarto ${url}` });
    return null;
  }
  ws.binaryType = 'arraybuffer';
  let latest: Uint8Array | null = null;
  let raf = 0;
  const flush = () => {
    raf = 0;
    const frame = latest;
    latest = null;
    if (frame) onFrame(frame);
  };
  const take = (bytes: Uint8Array) => {
    latest = bytes;
    if (!raf) raf = rafNow(flush);
  };
  ws.onopen = () => onEvent?.({ type: 'open' });
  ws.onmessage = (ev) => {
    const data = ev.data;
    if (data instanceof ArrayBuffer) take(new Uint8Array(data));
    else if (ArrayBuffer.isView(data)) {
      take(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      void data.arrayBuffer().then((buf) => take(new Uint8Array(buf)));
    }
  };
  ws.onerror = () => {
    onEvent?.({ type: 'error', message: `Mostek kamery (${url}) nie działa.` });
  };
  ws.onclose = () => onEvent?.({ type: 'close' });
  return {
    mode: 'bridge',
    close() {
      if (raf) cancelRaf(raf);
      raf = 0;
      latest = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Mostek na PC — nie 127.0.0.1, gdy UI otwarte na telefonie w LAN. */
export function localVideoBridgeUrl(): string {
  const host = getDevServerHost() || '127.0.0.1';
  return `ws://${host}:${PROTOCOL.videoBridgePort}`;
}
