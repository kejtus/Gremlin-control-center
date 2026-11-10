/**
 * ESP LiDAR — mapowanie jak site/public/esp_lidar (Gremlin), wg ESP_LIDAR_3D_EXPO.md
 */

export type EspLidarPoint = {
  x: number;
  y: number;
  z: number;
  intensity: number;
};

/** Domyślna korekta montażu (suwaki WWW). */
export const ESP_TILT_DEFAULT = { x: -122, y: 19, z: -11 } as const;

/**
 * Intensywność 0..255 → RGB 0..1 (color.js / ESP).
 * Niebieski → żółty → czerwony, bez per-frame min/max.
 */
export function espIntensityToRgb(intensity: number): [number, number, number] {
  let t = Number.isFinite(intensity) ? intensity / 255 : 0.5;
  t = Math.max(0, Math.min(1, t));
  const blue: [number, number, number] = [0.1, 0.3, 0.9];
  const yellow: [number, number, number] = [0.95, 0.8, 0.2];
  const red: [number, number, number] = [0.9, 0.15, 0.15];
  if (t <= 0.5) {
    const u = 2 * t;
    return [
      blue[0] + (yellow[0] - blue[0]) * u,
      blue[1] + (yellow[1] - blue[1]) * u,
      blue[2] + (yellow[2] - blue[2]) * u,
    ];
  }
  const u = 2 * t - 1;
  return [
    yellow[0] + (red[0] - yellow[0]) * u,
    yellow[1] + (red[1] - yellow[1]) * u,
    yellow[2] + (red[2] - yellow[2]) * u,
  ];
}

/** Układ ESP → scena Three: (-x, z, y), Y w górę, bez odbicia lustrzanego. */
export function espToScene(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x: -x, y: z, z: y };
}

/** Euler X→Y→Z w stopniach (jak viewer.js / suwaki). */
export function applyEspMountTilt(
  x: number,
  y: number,
  z: number,
  tiltDeg: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const rx = (tiltDeg.x * Math.PI) / 180;
  const ry = (tiltDeg.y * Math.PI) / 180;
  const rz = (tiltDeg.z * Math.PI) / 180;
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

/**
 * Surowy punkt (metry + intensity) → pozycja sceny po remap + opcjonalny tilt.
 * Tilt lepiej trzymać na całym obiekcie w GL; tu helper do testów / 2D.
 */
export function normalizeEspPoint(
  raw: { x: number; y: number; z?: number; intensity?: number },
  tiltDeg: { x: number; y: number; z: number } = ESP_TILT_DEFAULT,
): EspLidarPoint | null {
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  const z = Number.isFinite(raw.z) ? (raw.z as number) : 0;
  if (!Number.isFinite(z)) return null;
  const scene = espToScene(raw.x, raw.y, z);
  const tilted = applyEspMountTilt(scene.x, scene.y, scene.z, tiltDeg);
  const intensity = Number.isFinite(raw.intensity) ? Math.max(0, Math.min(255, raw.intensity as number)) : 128;
  return { x: tilted.x, y: tilted.y, z: tilted.z, intensity };
}
