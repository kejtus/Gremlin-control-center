import { Buffer } from 'buffer';
import { PROTOCOL } from '../protocol';

/** Składanie klatek JPEG z UDP Gremlina — ten sam nagłówek co site/server.js. */
const HEADER = 4 + 2 + 2 + 8;
const MAX_PENDING = 2;

export class JpegAssembler {
  private pending = new Map<number, { chunks: (Uint8Array | undefined)[]; total: number; received: number }>();

  push(msg: Uint8Array): Uint8Array | null {
    if (msg.byteLength < 2) return null;
    if (msg.byteLength >= HEADER) {
      const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
      const frameId = view.getUint32(0);
      const chunkIndex = view.getUint16(4);
      const totalChunks = view.getUint16(6);
      const payload = msg.subarray(HEADER);
      if (!totalChunks || totalChunks > 64 || chunkIndex >= totalChunks) return jpegOrNull(msg);
      if (totalChunks <= 1) return payload.length ? payload.slice() : jpegOrNull(msg);
      let pending = this.pending.get(frameId);
      if (!pending || pending.total !== totalChunks) {
        pending = { chunks: new Array(totalChunks), total: totalChunks, received: 0 };
        this.pending.set(frameId, pending);
      }
      if (!pending.chunks[chunkIndex]) {
        pending.chunks[chunkIndex] = payload.slice();
        pending.received += 1;
      }
      if (pending.received === pending.total) {
        this.pending.delete(frameId);
        const frame = concat(pending.chunks as Uint8Array[]);
        if (frame.byteLength > PROTOCOL.videoMaxJpegBytes || !isCompleteJpeg(frame)) return null;
        return frame;
      }
      while (this.pending.size > MAX_PENDING) {
        const oldest = this.pending.keys().next().value;
        if (oldest == null) break;
        this.pending.delete(oldest);
      }
      return null;
    }
    return jpegOrNull(msg);
  }
}

export function isCompleteJpeg(bytes: Uint8Array): boolean {
  const n = bytes.byteLength;
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  const from = Math.max(2, n - 32);
  for (let i = n - 2; i >= from; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return true;
  }
  return false;
}

function jpegOrNull(msg: Uint8Array): Uint8Array | null {
  if (msg.byteLength > PROTOCOL.videoMaxJpegBytes) return null;
  return isCompleteJpeg(msg) ? msg.slice() : null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/** Zostawia tylko najnowszą klatkę i rysuje w rAF — bez sztucznego capowania FPS. */
export function createFramePump(onFrame: (jpeg: Uint8Array) => void, _fps = PROTOCOL.videoMaxFps) {
  let latest: Uint8Array | null = null;
  let raf = 0;

  const flush = () => {
    raf = 0;
    const frame = latest;
    latest = null;
    if (frame) onFrame(frame);
  };

  return {
    push(jpeg: Uint8Array) {
      latest = jpeg;
      if (raf) return;
      raf =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(flush)
          : (setTimeout(flush, 16) as unknown as number);
    },
    close() {
      if (raf) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      latest = null;
    },
  };
}

export function revokePreviewUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/** Blob URL zamiast data:base64 — bez kopiowania klatki do gigantycznego stringa. */
export function bytesToPreviewUrl(bytes: Uint8Array): string {
  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const copy = bytes.slice();
    return URL.createObjectURL(new Blob([copy], { type: 'image/jpeg' }));
  }
  return bytesToDataUri(bytes);
}

export function bytesToDataUri(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
}
