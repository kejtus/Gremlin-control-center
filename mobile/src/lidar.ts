export type LidarPoint = {
  x: number;
  y: number;
  z?: number;
  intensity?: number;
  color?: string;
};

/** Demo — krąg przeszkód gdy Pi nie odpowiada / podgląd UI. */
export function demoLidarPoints(t = Date.now()): LidarPoint[] {
  const points: LidarPoint[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 + t / 8000;
    const r = 2.2 + 0.6 * Math.sin(i * 0.4 + t / 1200);
    points.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      intensity: 120,
      color: i % 9 === 0 ? '#ff6b4a' : '#5dffb0',
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
    const x = Number(o.x);
    const y = Number(o.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({
      x,
      y,
      z: Number.isFinite(Number(o.z)) ? Number(o.z) : undefined,
      intensity: Number.isFinite(Number(o.intensity)) ? Number(o.intensity) : undefined,
      color: typeof o.color === 'string' ? o.color : undefined,
    });
  }
  return out;
}
