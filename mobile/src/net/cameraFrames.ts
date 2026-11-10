/**
 * Klatki JPEG z kanału sterowania WS (Gremlin: type=camera_frame).
 * Bez UDP, bez mostka, bez dodatkowego skryptu na Pi.
 */
type FrameListener = (jpeg: Uint8Array) => void;

const listeners = new Set<FrameListener>();

export function subscribeCameraFrames(fn: FrameListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishCameraFrame(jpeg: Uint8Array) {
  if (!jpeg?.byteLength || !listeners.size) return;
  for (const fn of listeners) {
    try {
      fn(jpeg);
    } catch {
      /* ignore */
    }
  }
}

export function decodeCameraFrameB64(b64: string): Uint8Array | null {
  try {
    const raw = b64.includes(',') ? b64.split(',').pop()! : b64;
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    if (out.byteLength < 4 || out[0] !== 0xff || out[1] !== 0xd8) return null;
    return out;
  } catch {
    return null;
  }
}
