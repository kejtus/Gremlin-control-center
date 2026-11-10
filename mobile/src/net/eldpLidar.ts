/**
 * ESP LiDAR UDP (ELDP) — ten sam format co forward z Pi → Node.
 * Po złożeniu: punkty + korekta montażu jak Gremlin Control Center.
 */
import { normalizeLidarPoint, type LidarPoint } from '../lidar';

const HEADER_BYTES = 20;
const POINT_BYTES = 16;
/** Duże ramki (~14k pkt) lecą wieloma UDP — daj czas na złożenie. */
const FRAME_TIMEOUT_MS = 2500;
const MAX_IN_FLIGHT = 4;
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAGIC = 'ELDP';
/** Max payload chunk (Pi czasem > klasyczne 1380). */
const MAX_CHUNK_PAYLOAD = 2048;

type Pending = {
  chunkCount: number;
  totalPoints: number;
  chunks: Map<number, Uint8Array>;
  receivedPoints: number;
  timer: ReturnType<typeof setTimeout>;
};

/** Składanie datagramów ELDP → lista punktów. */
export class EldpAssembler {
  private frames = new Map<number, Pending>();

  push(message: Uint8Array): LidarPoint[] | null {
    if (message.byteLength < HEADER_BYTES) return null;
    const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
    const magic = String.fromCharCode(
      message[0]!,
      message[1]!,
      message[2]!,
      message[3]!,
    );
    if (magic !== MAGIC) return null;

    const version = view.getUint8(4);
    const type = view.getUint8(5);
    const headerBytes = view.getUint16(6, true);
    const frameId = view.getUint32(8, true);
    const chunkIndex = view.getUint16(12, true);
    const chunkCount = view.getUint16(14, true);
    const totalPoints = view.getUint32(16, true);
    const payload = message.subarray(HEADER_BYTES);

    if (version !== 1 || type !== 1 || headerBytes !== HEADER_BYTES) return null;
    if (chunkCount === 0 || chunkIndex >= chunkCount) return null;
    if (payload.byteLength % POINT_BYTES !== 0) return null;
    if (totalPoints * POINT_BYTES > MAX_FRAME_BYTES) return null;
    if (payload.byteLength > MAX_CHUNK_PAYLOAD) return null;

    let frame = this.frames.get(frameId);
    if (!frame) {
      if (this.frames.size >= MAX_IN_FLIGHT) {
        const oldest = this.frames.keys().next().value;
        if (oldest != null) this.discard(oldest);
      }
      frame = {
        chunkCount,
        totalPoints,
        chunks: new Map(),
        receivedPoints: 0,
        timer: setTimeout(() => this.discard(frameId), FRAME_TIMEOUT_MS),
      };
      this.frames.set(frameId, frame);
    }

    if (frame.chunkCount !== chunkCount || frame.totalPoints !== totalPoints) {
      this.discard(frameId);
      return null;
    }
    if (frame.chunks.has(chunkIndex)) return null;

    const chunkPoints = payload.byteLength / POINT_BYTES;
    if (frame.receivedPoints + chunkPoints > frame.totalPoints) {
      this.discard(frameId);
      return null;
    }

    frame.chunks.set(chunkIndex, payload.slice());
    frame.receivedPoints += chunkPoints;
    if (frame.chunks.size !== frame.chunkCount) return null;

    const parts: Uint8Array[] = [];
    for (let i = 0; i < frame.chunkCount; i++) {
      const c = frame.chunks.get(i);
      if (!c) {
        this.discard(frameId);
        return null;
      }
      parts.push(c);
    }
    const pointBytes = concat(parts);
    if (
      frame.receivedPoints !== frame.totalPoints ||
      pointBytes.byteLength !== frame.totalPoints * POINT_BYTES
    ) {
      this.discard(frameId);
      return null;
    }

    this.discard(frameId);
    return decodePoints(pointBytes, frame.totalPoints);
  }

  private discard(frameId: number) {
    const frame = this.frames.get(frameId);
    if (!frame) return;
    clearTimeout(frame.timer);
    this.frames.delete(frameId);
  }

  close() {
    for (const id of [...this.frames.keys()]) this.discard(id);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.byteLength;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

function decodePoints(pointBytes: Uint8Array, count: number): LidarPoint[] {
  const view = new DataView(pointBytes.buffer, pointBytes.byteOffset, pointBytes.byteLength);
  const out: LidarPoint[] = [];
  for (let i = 0; i < count; i++) {
    const off = i * POINT_BYTES;
    const x = view.getFloat32(off, true);
    const y = view.getFloat32(off + 4, true);
    const z = view.getFloat32(off + 8, true);
    const intensity = view.getFloat32(off + 12, true);
    const n = normalizeLidarPoint({ x, y, z, intensity });
    if (n) out.push(n);
  }
  return out;
}
