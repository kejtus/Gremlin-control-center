export type LidarPoint = {
  x: number;
  y: number;
  z?: number;
  intensity?: number;
  color?: string;
};

/** Jak w site/public/lidar/js/pointcloud.js — korekta montażu L1. */
const BASE_TILT_X_DEG = -122;
const BASE_TILT_Y_DEG = 19;
const BASE_TILT_Z_DEG = -11;
const INTENSITY_MIN = 86;
const INTENSITY_MAX = 234;

/** Gradient jak color.js: niebieski → żółty → czerwony. */
export function intensityToCssColor(intensity: number): string {
  const range = INTENSITY_MAX - INTENSITY_MIN;
  let t = range > 0 ? (intensity - INTENSITY_MIN) / range : 0.5;
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [0.1, 0.3, 0.9],
    [0.95, 0.8, 0.2],
    [0.9, 0.15, 0.15],
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  const localT = scaled - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const r = Math.round(255 * (a[0] + (b[0] - a[0]) * localT));
  const g = Math.round(255 * (a[1] + (b[1] - a[1]) * localT));
  const bl = Math.round(255 * (a[2] + (b[2] - a[2]) * localT));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/** Rotacja X→Y→Z (stopnie) jak w Gremlin Control Center. */
export function applyLidarMountTilt(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const rx = (BASE_TILT_X_DEG * Math.PI) / 180;
  const ry = (BASE_TILT_Y_DEG * Math.PI) / 180;
  const rz = (BASE_TILT_Z_DEG * Math.PI) / 180;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  let y1 = cx * y - sx * z;
  let z1 = sx * y + cx * z;
  y = y1;
  z = z1;

  let x2 = cy * x + sy * z;
  let z2 = -sy * x + cy * z;
  x = x2;
  z = z2;

  let x3 = cz * x - sz * y;
  let y3 = sz * x + cz * y;
  return { x: x3, y: y3, z };
}

/** Surowy punkt ESP → układ „podłogi” + kolor intensywności (jak CCC). */
export function normalizeLidarPoint(raw: {
  x: number;
  y: number;
  z?: number;
  intensity?: number;
}): LidarPoint | null {
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  const z = Number.isFinite(raw.z) ? (raw.z as number) : 0;
  const tilted = applyLidarMountTilt(raw.x, raw.y, z);
  const intensity = Number.isFinite(raw.intensity) ? (raw.intensity as number) : 128;
  return {
    x: tilted.x,
    y: tilted.y,
    z: tilted.z,
    intensity,
    color: intensityToCssColor(intensity),
  };
}

export function normalizeLidarCloud(points: LidarPoint[]): LidarPoint[] {
  const out: LidarPoint[] = [];
  for (const p of points) {
    const n = normalizeLidarPoint(p);
    if (n) out.push(n);
  }
  return out;
}

/** Auto-zakres widoku (metry) z percentyla odległości. */
export function lidarViewRangeM(points: LidarPoint[], fallback = 8): number {
  if (!points.length) return fallback;
  const dists: number[] = [];
  for (const p of points) {
    const d = Math.hypot(p.x, p.y);
    if (Number.isFinite(d) && d > 0.05) dists.push(d);
  }
  if (!dists.length) return fallback;
  dists.sort((a, b) => a - b);
  const p95 = dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.95))]!;
  return Math.max(2, Math.min(12, p95 * 1.15));
}

/** Demo 3D — ściany + podłoga (już w układzie po tilt, Y_lidar ≈ przód). */
export function demoLidarPoints(t = Date.now()): LidarPoint[] {
  const points: LidarPoint[] = [];
  const phase = t / 900;
  // podłoga
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2 + phase * 0.05;
    const r = 0.4 + (i % 7) * 0.35;
    const intensity = 95 + (i % 15) * 4;
    points.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z: -0.05 + 0.02 * Math.sin(i + phase),
      intensity,
      color: intensityToCssColor(intensity),
    });
  }
  // pierścień ścian
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2 + phase * 0.02;
    const r = 2.4 + 0.35 * Math.sin(i * 0.35 + phase);
    const h = 0.2 + (i % 8) * 0.12 + 0.15 * Math.sin(phase + i * 0.1);
    const intensity = 110 + (i % 25) * 5;
    points.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z: h,
      intensity,
      color: intensityToCssColor(intensity),
    });
  }
  // „przeszkoda” z przodu
  for (let i = 0; i < 40; i++) {
    const x = -0.6 + (i % 8) * 0.15;
    const z = 0.3 + Math.floor(i / 8) * 0.2;
    const intensity = 180 + (i % 10) * 4;
    points.push({
      x,
      y: 1.6 + 0.1 * Math.sin(phase),
      z,
      intensity,
      color: intensityToCssColor(intensity),
    });
  }
  return points;
}

export function parseLidarPoints(raw: unknown): LidarPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: LidarPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const n = normalizeLidarPoint({
      x: Number(o.x),
      y: Number(o.y),
      z: Number(o.z),
      intensity: Number(o.intensity),
    });
    if (n) out.push(n);
  }
  return out;
}
