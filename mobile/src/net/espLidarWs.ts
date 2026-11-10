/**
 * WebSocket ESP LiDAR — ws://<pi>:8769/ws/esp_lidar
 * Format binarny jak backend/lidar/ws_server.py (ESP_LIDAR_3D_EXPO.md).
 */
import { PROTOCOL } from '../protocol';

export type EspScanFrame = {
  /** Płaska tablica [x,y,z,intensity, ...] little-endian float32. */
  flat: Float32Array;
  pointCount: number;
};

export type EspLidarWsLink = {
  close: () => void;
};

type Handlers = {
  onScan: (frame: EspScanFrame) => void;
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'error', detail?: string) => void;
  onMetrics?: (metrics: { fps?: number; points_in_window?: number }) => void;
};

const TYPE_SCAN = 1;

export function espLidarWsUrl(host: string, port = PROTOCOL.espLidarWsPort): string {
  const h = host.trim().replace(/^https?:\/\//, '').split('/')[0]!.split(':')[0]!;
  return `ws://${h}:${port}${PROTOCOL.espLidarWsPath}`;
}

/** Dekoder ramki skanu (typ 1). */
export function decodeEspScan(buffer: ArrayBuffer): EspScanFrame | null {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const type = view.getUint32(0, true);
  if (type !== TYPE_SCAN) return null;
  const pointCount = view.getUint32(4, true);
  if (buffer.byteLength !== 8 + pointCount * 16) return null;
  if (pointCount === 0) return { flat: new Float32Array(0), pointCount: 0 };

  const points = new Float32Array(pointCount * 4);
  for (let i = 0; i < pointCount; i++) {
    const offset = 8 + i * 16;
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    const intensity = view.getFloat32(offset + 12, true);
    if (![x, y, z, intensity].every(Number.isFinite)) continue;
    const o = i * 4;
    points[o] = x;
    points[o + 1] = y;
    points[o + 2] = z;
    points[o + 3] = intensity;
  }
  return { flat: points, pointCount };
}

export function openEspLidarWs(host: string, handlers: Handlers): EspLidarWsLink {
  let closed = false;
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const connect = () => {
    if (closed) return;
    clearRetry();
    const url = espLidarWsUrl(host);
    handlers.onStatus?.('connecting', url);
    try {
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      handlers.onStatus?.('error', e instanceof Error ? e.message : 'WS create failed');
      scheduleRetry();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      handlers.onStatus?.('open', url);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const j = JSON.parse(ev.data) as Record<string, unknown>;
          handlers.onMetrics?.({
            fps: typeof j.fps === 'number' ? j.fps : undefined,
            points_in_window:
              typeof j.points_in_window === 'number' ? j.points_in_window : undefined,
          });
        } catch {
          /* ignore */
        }
        return;
      }
      const buf =
        ev.data instanceof ArrayBuffer
          ? ev.data
          : ev.data instanceof Blob
            ? null
            : null;
      if (!buf) {
        // Blob — async
        if (ev.data instanceof Blob) {
          void ev.data.arrayBuffer().then((ab) => {
            const scan = decodeEspScan(ab);
            if (scan) handlers.onScan(scan);
          });
        }
        return;
      }
      const scan = decodeEspScan(buf);
      if (scan) handlers.onScan(scan);
    };

    ws.onerror = () => {
      handlers.onStatus?.('error', 'Błąd WebSocket ESP LiDAR');
    };

    ws.onclose = () => {
      handlers.onStatus?.('closed');
      ws = null;
      if (!closed) scheduleRetry();
    };
  };

  const scheduleRetry = () => {
    if (closed) return;
    attempt += 1;
    const wait = Math.min(8000, 600 * attempt);
    retryTimer = setTimeout(connect, wait);
  };

  connect();

  return {
    close() {
      closed = true;
      clearRetry();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    },
  };
}
