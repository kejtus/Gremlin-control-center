/** Ścieżka na polu: punkty, Bezier, walidacja, open-loop follow. */

export type FieldPoint = { x: number; y: number };

export type PathAnchor = FieldPoint & {
  id: string;
  /** true = pozycja startowa robota (pierwszy punkt ścieżki). */
  isStart?: boolean;
};

/** Punkt kontrolny Bezier między dwoma kotwicami. */
export type PathControl = FieldPoint & {
  id: string;
  /** Id kotwicy na początku odcinka (anchors[i] → anchors[i+1]). */
  afterAnchorId: string;
  /** true = użytkownik przeciągnął uchwyt; nie resetuj do środka. */
  custom?: boolean;
};

export type PathModel = {
  anchors: PathAnchor[];
  controls: PathControl[];
};

export const PATH_LIMITS = {
  minSideM: 0.3,
  maxSideM: 20,
  minSpeedPct: 8,
  maxSpeedPct: 100,
  defaultSpeedPct: 35,
  /** Domyślny bok kwadratu (m). */
  defaultSideM: 1,
  maxAnchors: 24,
  minAnchorGapM: 0.05,
  baseSpeedMps: 0.28,
  /**
   * |ω| (rad/s) przy omega=1 i power=1.
   * Czas skrętu = kąt / (baseTurnRadPs * power01).
   * Za wysoka → niedokręca (90°→45°); za niska → przekręca.
   */
  baseTurnRadPs: 3.6,
  turnDurationMargin: 1.05,
  /** Stały narzut na rozruch silników (ms). */
  turnSpinUpMs: 90,
  /** Pauza po obrocie — gasi pęd. */
  turnSettleMs: 160,
  sampleStepM: 0.022,
} as const;

export type FieldSizeError = 'too_small' | 'too_large' | 'invalid' | null;

export function clampFieldSide(m: number): number {
  if (!Number.isFinite(m)) return PATH_LIMITS.defaultSideM;
  return Math.max(PATH_LIMITS.minSideM, Math.min(PATH_LIMITS.maxSideM, m));
}

export function validateSquareSide(sideM: number): FieldSizeError {
  if (!Number.isFinite(sideM) || sideM <= 0) return 'invalid';
  if (sideM < PATH_LIMITS.minSideM) return 'too_small';
  if (sideM > PATH_LIMITS.maxSideM) return 'too_large';
  return null;
}

export function fieldErrorMessage(err: FieldSizeError): string | null {
  if (!err) return null;
  if (err === 'too_small') return `Min. bok kwadratu: ${PATH_LIMITS.minSideM} m.`;
  if (err === 'too_large') return `Max. bok kwadratu: ${PATH_LIMITS.maxSideM} m.`;
  return 'Nieprawidłowy rozmiar pola.';
}

export function clampSpeedPct(pct: number): number {
  if (!Number.isFinite(pct)) return PATH_LIMITS.defaultSpeedPct;
  return Math.max(PATH_LIMITS.minSpeedPct, Math.min(PATH_LIMITS.maxSpeedPct, Math.round(pct)));
}

function dist(a: FieldPoint, b: FieldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function mid(a: FieldPoint, b: FieldPoint): FieldPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function fieldCenter(sideM: number): FieldPoint {
  const s = clampFieldSide(sideM);
  return { x: s / 2, y: s / 2 };
}

/** Puste pole = start na środku (nie da się usunąć). */
export function createInitialPath(sideM: number): PathModel {
  const c = fieldCenter(sideM);
  return {
    anchors: [{ id: 'start', x: c.x, y: c.y, isStart: true }],
    controls: [],
  };
}

export function quadBezier(p0: FieldPoint, p1: FieldPoint, p2: FieldPoint, t: number): FieldPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function sampleQuadBezier(
  p0: FieldPoint,
  p1: FieldPoint,
  p2: FieldPoint,
  stepM: number = PATH_LIMITS.sampleStepM,
): FieldPoint[] {
  const chord = dist(p0, p2) + dist(p0, p1) * 0.5 + dist(p1, p2) * 0.5;
  const n = Math.max(14, Math.ceil(chord / Math.max(0.01, stepM)));
  const out: FieldPoint[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(quadBezier(p0, p1, p2, i / n));
  }
  return out;
}

/**
 * Jeden uchwyt na odcinek. Nowe odcinki → środek.
 * Istniejące custom zostają; nie-custom → zawsze środek (gdy kotwice się ruszają).
 */
export function syncControls(anchors: PathAnchor[], prev: PathControl[] = []): PathControl[] {
  const next: PathControl[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const m = mid(a, b);
    const existing = prev.find((c) => c.afterAnchorId === a.id);
    if (existing?.custom) {
      next.push({
        ...existing,
        x: Math.max(0, existing.x),
        y: Math.max(0, existing.y),
      });
    } else if (existing) {
      next.push({ ...existing, x: m.x, y: m.y, custom: false });
    } else {
      next.push({ id: newId('c'), afterAnchorId: a.id, x: m.x, y: m.y, custom: false });
    }
  }
  return next;
}

export function addAnchor(model: PathModel, point: FieldPoint, sideM: number): PathModel | null {
  // start zajmuje 1 slot; maxAnchors liczy wszystkie kotwice
  if (model.anchors.length >= PATH_LIMITS.maxAnchors) return null;
  const s = clampFieldSide(sideM);
  const x = Math.max(0, Math.min(s, point.x));
  const y = Math.max(0, Math.min(s, point.y));
  if (model.anchors.length) {
    const last = model.anchors[model.anchors.length - 1];
    if (dist(last, { x, y }) < PATH_LIMITS.minAnchorGapM) return null;
  }
  const anchors = [
    ...model.anchors.map((a, i) => ({ ...a, isStart: i === 0 })),
    { id: newId('a'), x, y, isStart: false },
  ];
  return { anchors, controls: syncControls(anchors, model.controls) };
}

export function moveAnchor(
  model: PathModel,
  id: string,
  point: FieldPoint,
  sideM: number,
): PathModel {
  // Start na środku — nie przesuwamy.
  const target = model.anchors.find((a) => a.id === id);
  if (target?.isStart || id === 'start') return model;
  const s = clampFieldSide(sideM);
  const x = Math.max(0, Math.min(s, point.x));
  const y = Math.max(0, Math.min(s, point.y));
  const anchors = model.anchors.map((a) => (a.id === id ? { ...a, x, y } : a));
  return { anchors, controls: syncControls(anchors, model.controls) };
}

export function moveControl(
  model: PathModel,
  id: string,
  point: FieldPoint,
  sideM: number,
): PathModel {
  const s = clampFieldSide(sideM);
  const x = Math.max(0, Math.min(s, point.x));
  const y = Math.max(0, Math.min(s, point.y));
  const controls = model.controls.map((c) =>
    c.id === id ? { ...c, x, y, custom: true } : c,
  );
  return { anchors: model.anchors, controls };
}

export function removeAnchor(model: PathModel, id: string): PathModel {
  if (id === 'start') return model;
  const victim = model.anchors.find((a) => a.id === id);
  if (victim?.isStart) return model;
  const anchors = model.anchors
    .filter((a) => a.id !== id)
    .map((a, i) => ({ ...a, isStart: i === 0 }));
  // Zawsze zostaw start na środku, jeśli ktoś skasował wszystko poza... nie powinno się dać.
  if (!anchors.length) return createInitialPath(PATH_LIMITS.defaultSideM);
  return { anchors, controls: syncControls(anchors, model.controls) };
}

/** Po zmianie boku kwadratu: start na nowy środek, reszta przycięta do pola. */
export function resizeField(model: PathModel, sideM: number): PathModel {
  const s = clampFieldSide(sideM);
  const c = fieldCenter(s);
  const anchors = model.anchors.map((a, i) => {
    if (i === 0 || a.isStart || a.id === 'start') {
      return { ...a, id: 'start', x: c.x, y: c.y, isStart: true };
    }
    return {
      ...a,
      isStart: false,
      x: Math.max(0, Math.min(s, a.x)),
      y: Math.max(0, Math.min(s, a.y)),
    };
  });
  if (!anchors.length) return createInitialPath(s);
  return { anchors, controls: syncControls(anchors, model.controls) };
}

export function clearPath(sideM: number = PATH_LIMITS.defaultSideM): PathModel {
  return createInitialPath(sideM);
}

export function controlForSegment(
  model: PathModel,
  fromId: string,
  to: FieldPoint,
  from: FieldPoint,
): FieldPoint {
  const c = model.controls.find((h) => h.afterAnchorId === fromId);
  return c ?? mid(from, to);
}

export function samplePath(model: PathModel): FieldPoint[] {
  const { anchors } = model;
  if (anchors.length === 0) return [];
  if (anchors.length === 1) return [{ x: anchors[0].x, y: anchors[0].y }];
  const pts: FieldPoint[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const c = controlForSegment(model, a.id, b, a);
    const seg = sampleQuadBezier(a, c, b);
    if (i > 0) seg.shift();
    pts.push(...seg);
  }
  return pts;
}

export type PathDriveSegment = {
  /** Strafe (oś X ciała; przy jeździe „nosem” zwykle 0). */
  vx: number;
  /** Przód/tył ciała. */
  vy: number;
  /** Obrót w miejscu lub w ruchu (prawo +). */
  omega: number;
  durationMs: number;
  lengthM: number;
  kind: 'drive' | 'turn' | 'settle';
  /** PWM 0..1 dla tego odcinka. */
  power01: number;
};

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function turnDurationMs(errAbs: number, radPs: number): number {
  const body = (errAbs / Math.max(0.2, radPs)) * 1000 * PATH_LIMITS.turnDurationMargin;
  return Math.max(80, Math.round(body + PATH_LIMITS.turnSpinUpMs));
}

/** Ostre zmiany kierunku → obrót w miejscu (bez jazdy+skręt naraz). */
const CURVE_IN_PLACE_RAD = 0.18; // ~10°
const REVERSE_RAD = (Math.PI * 3) / 4; // 135°
const LOOK_AHEAD_M = 0.16;
const SLICE_M = 0.1;
const CURVE_CTRL_FRAC = 0.14;
const CURVE_CTRL_MIN_M = 0.06;

type DriveParams = {
  /** Wybrana prędkość trasy (0..1) — ta sama na jeździe i skręcie. */
  power01: number;
  mps: number;
  /** |ω_real| przy omega=±1 i power01. */
  radPs: number;
};

/**
 * Proporcjonalnie do wybranej prędkości:
 * - jazda: vy=±1, power = speed%
 * - skręt: omega=±1, power = speed% (bez skoku mocy)
 * - czas skrętu = kąt / (baseTurnRadPs * speed%) → ten sam kąt przy 20%, 50%, 100%
 */
function driveParams(speedPct: number): DriveParams {
  const power01 = Math.max(0.14, clampSpeedPct(speedPct) / 100);
  const radPs = Math.max(0.35, PATH_LIMITS.baseTurnRadPs * power01);
  const mps = Math.max(0.07, PATH_LIMITS.baseSpeedMps * power01);
  return { power01, mps, radPs };
}

function pointAlongPath(samples: FieldPoint[], cum: number[], total: number, s: number): FieldPoint {
  const t = Math.max(0, Math.min(total, s));
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= t - 1e-9) {
      const segLen = cum[i] - cum[i - 1] || 1e-6;
      const u = (t - cum[i - 1]) / segLen;
      const a = samples[i - 1];
      const b = samples[i];
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  return samples[samples.length - 1];
}

function pushDrive(
  plan: PathDriveSegment[],
  vy: number,
  durationMs: number,
  lengthM: number,
  power01: number,
) {
  const prev = plan[plan.length - 1];
  if (
    prev &&
    prev.kind === 'drive' &&
    Math.abs(prev.vy - vy) < 0.04 &&
    Math.abs(prev.omega) < 0.02 &&
    Math.abs(prev.power01 - power01) < 0.04
  ) {
    prev.durationMs += durationMs;
    prev.lengthM += lengthM;
    return;
  }
  plan.push({ vx: 0, vy, omega: 0, durationMs, lengthM, kind: 'drive', power01 });
}

function pushTurn(plan: PathDriveSegment[], err: number, p: DriveParams) {
  if (Math.abs(err) <= 0.05) return;
  plan.push({
    vx: 0,
    vy: 0,
    omega: err > 0 ? 1 : -1,
    durationMs: turnDurationMs(Math.abs(err), p.radPs),
    lengthM: 0,
    kind: 'turn',
    power01: p.power01,
  });
  plan.push({
    vx: 0,
    vy: 0,
    omega: 0,
    durationMs: PATH_LIMITS.turnSettleMs,
    lengthM: 0,
    kind: 'settle',
    power01: 0,
  });
}

function isCurveSegment(model: PathModel, from: PathAnchor, to: PathAnchor, ctrl: FieldPoint): boolean {
  const handle = model.controls.find((h) => h.afterAnchorId === from.id);
  if (handle?.custom) return true;
  const m = mid(from, to);
  const chord = dist(from, to);
  return dist(ctrl, m) > Math.max(CURVE_CTRL_MIN_M, chord * CURVE_CTRL_FRAC);
}

/** Odcinek prosty: obrót w miejscu → jazda (bez omega podczas jazdy). */
function appendStraightLeg(
  plan: PathDriveSegment[],
  headingRef: { h: number },
  target: number,
  len: number,
  p: DriveParams,
) {
  const errFwd = wrapPi(target - headingRef.h);
  const useReverse = Math.abs(errFwd) > REVERSE_RAD;
  const face = useReverse ? wrapPi(target + Math.PI) : target;
  const err = wrapPi(face - headingRef.h);
  const vy = useReverse ? -1 : 1;
  const driveMs = Math.max(100, Math.round((len / p.mps) * 1000));

  pushTurn(plan, err, p);
  headingRef.h = face;
  pushDrive(plan, vy, driveMs, len, p.power01);
}

/**
 * Bezier: też tylko stop-and-turn + jazda prosto.
 * (jazda+skręt naraz ścinają PWM kół i zmieniają „prędkość”).
 */
function appendCurvePursuit(
  plan: PathDriveSegment[],
  headingRef: { h: number },
  samples: FieldPoint[],
  p: DriveParams,
) {
  if (samples.length < 2) return;
  const cum: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    cum.push(cum[i - 1] + dist(samples[i - 1], samples[i]));
  }
  const total = cum[cum.length - 1];
  if (total < 0.02) return;

  let s = 0;
  while (s < total - 0.012) {
    const slice = Math.min(SLICE_M, total - s);
    const p0 = pointAlongPath(samples, cum, total, s);
    const p1 = pointAlongPath(samples, cum, total, Math.min(total, s + LOOK_AHEAD_M));
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    if (Math.hypot(dx, dy) < 0.002) {
      s += slice;
      continue;
    }

    const target = Math.atan2(dx, dy);
    const errFwd = wrapPi(target - headingRef.h);
    const useReverse = Math.abs(errFwd) > REVERSE_RAD;
    const face = useReverse ? wrapPi(target + Math.PI) : target;
    const err = wrapPi(face - headingRef.h);
    const driveMs = Math.max(90, Math.round((slice / p.mps) * 1000));
    const vy = useReverse ? -1 : 1;

    if (Math.abs(err) > CURVE_IN_PLACE_RAD) {
      pushTurn(plan, err, p);
      headingRef.h = face;
    } else {
      headingRef.h = face;
    }
    pushDrive(plan, vy, driveMs, slice, p.power01);
    s += slice;
  }
}

export function buildDrivePlan(model: PathModel, speedPct: number): PathDriveSegment[] {
  const { anchors } = model;
  if (anchors.length < 2) return [];

  const p = driveParams(speedPct);
  const plan: PathDriveSegment[] = [];
  const headingRef = { h: 0 };

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ctrl = controlForSegment(model, a.id, b, a);
    const len = dist(a, b);
    if (len < 0.02) continue;

    if (isCurveSegment(model, a, b, ctrl)) {
      appendCurvePursuit(plan, headingRef, sampleQuadBezier(a, ctrl, b), p);
    } else {
      appendStraightLeg(plan, headingRef, Math.atan2(b.x - a.x, b.y - a.y), len, p);
    }
  }

  return plan;
}

export function pathLengthM(samples: FieldPoint[]): number {
  let n = 0;
  for (let i = 1; i < samples.length; i++) n += dist(samples[i - 1], samples[i]);
  return n;
}
