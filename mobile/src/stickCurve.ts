/** Martwa strefa + krzywa — mniej „szarpania” na małym ekranie. */
export function softenStick(v: number, deadzone = 0.16, gamma = 1.75): number {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  if (a < deadzone) return 0;
  const t = (a - deadzone) / (1 - deadzone);
  const shaped = Math.pow(Math.min(1, t), gamma);
  return v < 0 ? -shaped : shaped;
}

export function softenStickXY(x: number, y: number): { x: number; y: number } {
  return { x: softenStick(x), y: softenStick(y) };
}
