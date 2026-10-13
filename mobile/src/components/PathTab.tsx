import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { A11yPressable, useAccessibility, a11yFont} from '../accessibility';
import {
  PATH_LIMITS,
  addAnchor,
  buildDrivePlan,
  clampFieldSide,
  clampSpeedPct,
  clearPath,
  fieldErrorMessage,
  moveAnchor,
  moveControl,
  pathLengthM,
  removeAnchor,
  resizeField,
  samplePath,
  validateSquareSide,
  type PathModel,
} from '../pathFollow';
import { colors, radii } from '../theme';

type Props = {
  online: boolean;
  onDrive: (x: number, y: number, omega?: number, power01?: number) => void;
  onStop: () => void;
};

type Hit = { id: string; kind: 'anchor' | 'control' };

const CLICK_SLOP = 10;
const SIDE_PRESETS = [0.5, 1, 1.5, 2, 3, 5] as const;

export function PathTab({ online, onDrive, onStop }: Props) {
  const styles = useStyles();
  const [sideText, setSideText] = useState(String(PATH_LIMITS.defaultSideM));
  const [speedPct, setSpeedPct] = useState<number>(PATH_LIMITS.defaultSpeedPct);
  const [model, setModel] = useState<PathModel>(() => clearPath(PATH_LIMITS.defaultSideM));
  const [fieldPx, setFieldPx] = useState({ w: 280, h: 280 });
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Kliknij w pole, żeby dodać punkt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Blokada ScrollView na czas gestu na polu (Bezier / punkty). */
  const [fieldGesture, setFieldGesture] = useState(false);

  const touchRef = useRef<{
    startX: number;
    startY: number;
    hit: Hit | null;
    dragged: boolean;
  } | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  const playGen = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driveRef = useRef(onDrive);
  driveRef.current = onDrive;
  const stopRef = useRef(onStop);
  stopRef.current = onStop;

  const sideRaw = Number(sideText.replace(',', '.')) || 0;
  const sideM = clampFieldSide(sideRaw);
  const sizeErr = validateSquareSide(sideRaw);

  const samples = useMemo(() => samplePath(model), [model]);
  const lengthM = useMemo(() => pathLengthM(samples), [samples]);

  const applySide = (next: number) => {
    if (playing) return;
    const s = clampFieldSide(next);
    setSideText(String(s));
    setModel((m) => resizeField(m, s));
    setSelectedId(null);
    setStatus(`Pole ${s}×${s} m · start na środku`);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Przycisk STOP — pełny stop na Pi. */
  const halt = useCallback(() => {
    playGen.current += 1;
    clearTimer();
    setPlaying(false);
    stopRef.current();
    setStatus('STOP');
  }, []);

  useEffect(() => {
    return () => {
      playGen.current += 1;
      clearTimer();
      driveRef.current(0, 0, 0);
    };
  }, []);

  // +Y = przód (góra ekranu), +X = prawo
  const toField = (px: number, py: number) => {
    const x = (px / Math.max(1, fieldPx.w)) * sideM;
    const y = ((fieldPx.h - py) / Math.max(1, fieldPx.h)) * sideM;
    return { x, y };
  };

  const toPx = (x: number, y: number) => ({
    left: (x / Math.max(0.001, sideM)) * fieldPx.w,
    top: (1 - y / Math.max(0.001, sideM)) * fieldPx.h,
  });

  const onFieldLayout = (ev: LayoutChangeEvent) => {
    const { width, height } = ev.nativeEvent.layout;
    if (width > 0 && height > 0) setFieldPx({ w: width, h: height });
  };

  const hitTest = (px: number, py: number, m: PathModel = modelRef.current): Hit | null => {
    for (const c of m.controls) {
      const p = toPx(c.x, c.y);
      if (Math.hypot(px - p.left, py - p.top) <= 28) return { id: c.id, kind: 'control' };
    }
    for (const a of m.anchors) {
      const p = toPx(a.x, a.y);
      const r = a.isStart ? 22 : 18;
      if (Math.hypot(px - p.left, py - p.top) <= r) return { id: a.id, kind: 'anchor' };
    }
    return null;
  };

  const endFieldGesture = () => {
    touchRef.current = null;
    setFieldGesture(false);
  };

  const addAt = (px: number, py: number) => {
    if (playing || sizeErr) return;
    const next = addAnchor(modelRef.current, toField(px, py), sideM);
    if (!next) {
      setStatus(
        modelRef.current.anchors.length >= PATH_LIMITS.maxAnchors
          ? `Max ${PATH_LIMITS.maxAnchors} punktów`
          : 'Punkt za blisko poprzedniego',
      );
      return;
    }
    setModel(next);
    setSelectedId(next.anchors[next.anchors.length - 1].id);
    setStatus(
      next.anchors.length <= 2
        ? 'Start na środku. Kliknij kolejne punkty trasy.'
        : `Punkt ${next.anchors.length} · pomarańczowy = Bezier`,
    );
  };

  const play = () => {
    if (!online) {
      setStatus('Najpierw połącz z Pi');
      return;
    }
    if (sizeErr) {
      setStatus(fieldErrorMessage(sizeErr) || 'Zły rozmiar pola');
      return;
    }
    if (model.anchors.length < 2) {
      setStatus('Potrzeba min. 2 punktów (start + cel)');
      return;
    }
    const plan = buildDrivePlan(model, speedPct);
    if (!plan.length) {
      setStatus('Ścieżka za krótka');
      return;
    }

    // Anuluj poprzednie odtwarzanie bez type:stop (żeby nie zgasić zaraz kolejnych motorów).
    playGen.current += 1;
    clearTimer();
    const gen = playGen.current;
    setPlaying(true);
    setStatus(`Start · ${lengthM.toFixed(2)} m · ${speedPct}% · ${plan.length} odc.`);

    let i = 0;

    const finish = (msg: string) => {
      if (gen !== playGen.current) return;
      clearTimer();
      // Tylko zera PWM — bez type:stop, żeby kolejne komendy (dźwięki itd.) nie ginęły w wyścigu.
      driveRef.current(0, 0, 0);
      setPlaying(false);
      setStatus(msg);
    };

    const step = () => {
      if (gen !== playGen.current) return;
      if (i >= plan.length) {
        finish('Koniec trasy');
        return;
      }
      const seg = plan[i];
      driveRef.current(seg.vx, seg.vy, seg.omega, seg.power01);
      setStatus(
        seg.kind === 'turn'
          ? `Obrót ${i + 1}/${plan.length}`
          : seg.kind === 'settle'
            ? `Stop ${i + 1}/${plan.length}`
            : `Jazda ${i + 1}/${plan.length}`,
      );
      i += 1;
      // settle może być krótki; nie sztucznie wydłużaj do 100 ms
      const wait = seg.kind === 'settle' ? Math.max(40, seg.durationMs) : Math.max(60, seg.durationMs);
      timerRef.current = setTimeout(step, wait);
    };
    step();
  };

  const undo = () => {
    if (playing || model.anchors.length <= 1) return;
    const last = model.anchors[model.anchors.length - 1];
    if (last.isStart || last.id === 'start') return;
    setModel(removeAnchor(model, last.id));
    setSelectedId(null);
    setStatus('Usunięto ostatni punkt');
  };

  const deleteSelected = () => {
    if (!selectedId || playing) return;
    if (model.controls.some((c) => c.id === selectedId)) {
      setStatus('To uchwyt Bezier — przeciągnij go.');
      return;
    }
    const a = model.anchors.find((x) => x.id === selectedId);
    if (a?.isStart || selectedId === 'start') {
      setStatus('Start jest na środku — nie da się usunąć');
      return;
    }
    setModel(removeAnchor(model, selectedId));
    setSelectedId(null);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      bounces={false}
      scrollEnabled={!fieldGesture}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Trasa na polu</Text>
      <Text style={styles.hint}>
        Start (S) na środku, nos w PRZÓD. Same kliknięcia = proste odcinki i ostre rogi.
        Przeciągnij pomarańczowy uchwyt = płynna krzywa Bezier.
      </Text>

      <Text style={styles.label}>Bok kwadratu (m)</Text>
      <View style={styles.speedRow}>
        {SIDE_PRESETS.map((s) => {
          const on = Math.abs(sideM - s) < 0.001 && !sizeErr;
          return (
            <A11yPressable
              key={s}
              boost={false}
              disabled={playing}
              onPress={() => applySide(s)}
              accessibilityLabel={`${s} metrów`}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{s} m</Text>
            </A11yPressable>
          );
        })}
      </View>
      <View style={styles.sizeRow}>
        <TextInput
          value={sideText}
          onChangeText={setSideText}
          onEndEditing={() => {
            if (!sizeErr) applySide(sideRaw);
          }}
          keyboardType="decimal-pad"
          style={styles.input}
          editable={!playing}
        />
        <Text style={styles.unit}>× {sideText || '?'} m</Text>
      </View>
      {sizeErr ? <Text style={styles.error}>{fieldErrorMessage(sizeErr)}</Text> : null}

      <Text style={styles.label}>Prędkość {speedPct}%</Text>
      <View style={styles.speedRow}>
        {[15, 25, 35, 50, 70].map((p) => {
          const on = speedPct === p;
          return (
            <A11yPressable
              key={p}
              boost={false}
              disabled={playing}
              onPress={() => setSpeedPct(clampSpeedPct(p))}
              accessibilityLabel={`Prędkość ${p} procent`}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p}%</Text>
            </A11yPressable>
          );
        })}
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.dirTop} pointerEvents="none">
          PRZÓD (+Y)
        </Text>
        <View style={styles.fieldMid}>
          <Text style={styles.dirSide} pointerEvents="none">
            LEWO{'\n'}(−X)
          </Text>
          <View
            style={[styles.field, { opacity: sizeErr ? 0.45 : 1 }]}
            onLayout={onFieldLayout}
            onStartShouldSetResponder={() => !playing && !sizeErr}
            onMoveShouldSetResponder={() => true}
            onStartShouldSetResponderCapture={() => !playing && !sizeErr}
            onMoveShouldSetResponderCapture={() => !playing && !sizeErr}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(ev) => {
              setFieldGesture(true);
              const { locationX, locationY } = ev.nativeEvent;
              const hit = hitTest(locationX, locationY);
              touchRef.current = {
                startX: locationX,
                startY: locationY,
                hit,
                dragged: false,
              };
              if (hit) {
                if (hit.kind === 'anchor') {
                  const a = modelRef.current.anchors.find((x) => x.id === hit.id);
                  if (a?.isStart || hit.id === 'start') {
                    setSelectedId(hit.id);
                    // start nie przesuwamy — traktuj jak „tylko zaznacz”
                    touchRef.current.hit = null;
                    return;
                  }
                }
                setSelectedId(hit.id);
              }
            }}
            onResponderMove={(ev) => {
              const t = touchRef.current;
              if (!t || playing) return;
              const { locationX, locationY } = ev.nativeEvent;
              const moved = Math.hypot(locationX - t.startX, locationY - t.startY);
              if (moved > CLICK_SLOP) t.dragged = true;
              if (!t.hit || !t.dragged) return;
              const pt = toField(locationX, locationY);
              if (t.hit.kind === 'anchor') {
                setModel((m) => moveAnchor(m, t.hit!.id, pt, sideM));
              } else {
                setModel((m) => moveControl(m, t.hit!.id, pt, sideM));
              }
            }}
            onResponderRelease={(ev) => {
              const t = touchRef.current;
              const { locationX, locationY } = ev.nativeEvent;
              endFieldGesture();
              if (!t || playing || sizeErr) return;
              if (!t.hit && !t.dragged) {
                addAt(locationX, locationY);
              }
            }}
            onResponderTerminate={() => {
              endFieldGesture();
            }}
          >
            {[0.25, 0.5, 0.75].map((t) => (
              <View
                key={`v${t}`}
                pointerEvents="none"
                style={[styles.gridV, { left: `${t * 100}%` }]}
              />
            ))}
            {[0.25, 0.5, 0.75].map((t) => (
              <View
                key={`h${t}`}
                pointerEvents="none"
                style={[styles.gridH, { top: `${t * 100}%` }]}
              />
            ))}

            {model.anchors.length >= 2
              ? model.anchors.slice(0, -1).map((a, i) => {
                  const b = model.anchors[i + 1];
                  const c = model.controls.find((h) => h.afterAnchorId === a.id);
                  if (!c) return null;
                  const pa = toPx(a.x, a.y);
                  const pb = toPx(b.x, b.y);
                  const pc = toPx(c.x, c.y);
                  return (
                    <View key={`guide-${a.id}`} pointerEvents="none">
                      <GuideLine from={pa} to={pc} />
                      <GuideLine from={pc} to={pb} />
                    </View>
                  );
                })
              : null}

            {samples.length > 1
              ? samples.map((p, i) => {
                  if (i === 0) return null;
                  const a = toPx(samples[i - 1].x, samples[i - 1].y);
                  const b = toPx(p.x, p.y);
                  const dx = b.left - a.left;
                  const dy = b.top - a.top;
                  const len = Math.hypot(dx, dy);
                  if (len < 0.8) return null;
                  const midX = (a.left + b.left) / 2;
                  const midY = (a.top + b.top) / 2;
                  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
                  return (
                    <View
                      key={`s${i}`}
                      pointerEvents="none"
                      style={[
                        styles.seg,
                        {
                          width: len,
                          left: midX - len / 2,
                          top: midY - 1.5,
                          transform: [{ rotate: `${ang}deg` }],
                        },
                      ]}
                    />
                  );
                })
              : null}

            {model.controls.map((c) => {
              const p = toPx(c.x, c.y);
              const on = selectedId === c.id;
              return (
                <View
                  key={c.id}
                  pointerEvents="none"
                  style={[styles.ctrlHit, { left: p.left - 18, top: p.top - 18 }]}
                >
                  <View style={[styles.ctrl, on && styles.ctrlOn]} />
                </View>
              );
            })}

            {model.anchors.map((a, i) => {
              const p = toPx(a.x, a.y);
              const on = selectedId === a.id;
              const start = !!a.isStart || i === 0;
              const size = start ? 26 : 22;
              return (
                <View
                  key={a.id}
                  pointerEvents="none"
                  style={[
                    styles.anchor,
                    {
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      left: p.left - size / 2,
                      top: p.top - size / 2,
                    },
                    start && styles.anchorStart,
                    on && styles.anchorOn,
                  ]}
                >
                  <Text style={styles.anchorText}>{start ? 'S' : String(i + 1)}</Text>
                </View>
              );
            })}

            <Text style={styles.fieldBadge} pointerEvents="none">
              {sideM.toFixed(2)}×{sideM.toFixed(2)} m
            </Text>
          </View>
          <Text style={styles.dirSide} pointerEvents="none">
            PRAWO{'\n'}(+X)
          </Text>
        </View>
        <Text style={styles.dirBottom} pointerEvents="none">
          TYŁ (−Y)
        </Text>
      </View>

      <Text style={styles.status}>{status}</Text>
      <Text style={styles.meta}>
        Punkty: {model.anchors.length}/{PATH_LIMITS.maxAnchors}
        {lengthM > 0 ? ` · ~${lengthM.toFixed(2)} m` : ''}
        {!online ? ' · brak połączenia' : ''}
      </Text>

      <View style={styles.actions}>
        <A11yPressable
          onPress={play}
          disabled={playing || !!sizeErr || model.anchors.length < 2}
          style={[
            styles.btn,
            styles.btnPlay,
            (playing || !!sizeErr || model.anchors.length < 2) && styles.btnOff,
          ]}
        >
          <Text style={styles.btnText}>Odtwórz trasę</Text>
        </A11yPressable>
        <A11yPressable onPress={halt} style={[styles.btn, styles.btnStop]}>
          <Text style={styles.btnText}>STOP</Text>
        </A11yPressable>
      </View>

      <View style={styles.actions}>
        <A11yPressable
          onPress={undo}
          disabled={playing || model.anchors.length <= 1}
          style={[styles.btn, styles.btnSec]}
        >
          <Text style={styles.btnSecText}>Cofnij punkt</Text>
        </A11yPressable>
        <A11yPressable
          onPress={deleteSelected}
          disabled={playing || !selectedId}
          style={[styles.btn, styles.btnSec]}
        >
          <Text style={styles.btnSecText}>Usuń zaznaczony</Text>
        </A11yPressable>
      </View>
      <View style={styles.actions}>
        <A11yPressable
          onPress={() => {
            if (playing) return;
            setModel(clearPath(sideM));
            setSelectedId(null);
            setStatus('Wyczyszczono · start na środku');
          }}
          disabled={playing}
          style={[styles.btn, styles.btnSec]}
        >
          <Text style={styles.btnSecText}>Wyczyść</Text>
        </A11yPressable>
      </View>
    </ScrollView>
  );
}

function GuideLine({
  from,
  to,
}: {
  from: { left: number; top: number };
  to: { left: number; top: number };
}) {
  const styles = useStyles();
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.guide,
        {
          width: len,
          left: (from.left + to.left) / 2 - len / 2,
          top: (from.top + to.top) / 2 - 0.5,
          transform: [{ rotate: `${ang}deg` }],
        },
      ]}
    />
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  scroll: { flex: 1 },
  root: { padding: 14, paddingBottom: 28 },
  title: { color: colors.ink, fontSize: a11yFont(18, textScale), fontWeight: '800', marginBottom: 4 },
  hint: { color: colors.muted, fontSize: a11yFont(12, textScale), lineHeight: 17, marginBottom: 12 },
  label: { color: colors.ink, fontWeight: '800', fontSize: a11yFont(13, textScale), marginBottom: 6 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.tabBar,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.ink,
    fontWeight: '700',
    fontSize: a11yFont(15, textScale),
  },
  unit: { color: colors.muted, fontWeight: '700', minWidth: 72 },
  error: { color: colors.danger, fontWeight: '700', fontSize: a11yFont(12, textScale), marginBottom: 4 },
  meta: { color: colors.muted, fontSize: a11yFont(11, textScale), marginBottom: 10 },
  speedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.tabBar, borderColor: colors.tabBar },
  chipText: { color: colors.ink, fontWeight: '800', fontSize: a11yFont(12, textScale) },
  chipTextOn: { color: '#fff' },
  fieldWrap: { marginBottom: 8, alignItems: 'center' },
  fieldMid: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  dirTop: {
    color: colors.tabBar,
    fontWeight: '900',
    fontSize: a11yFont(11, textScale),
    letterSpacing: 0.6,
    marginBottom: 4,
    textAlign: 'center',
  },
  dirBottom: {
    color: colors.tabBar,
    fontWeight: '900',
    fontSize: a11yFont(11, textScale),
    letterSpacing: 0.6,
    marginTop: 4,
    textAlign: 'center',
  },
  dirSide: {
    color: colors.tabBar,
    fontWeight: '900',
    fontSize: a11yFont(10, textScale),
    letterSpacing: 0.4,
    textAlign: 'center',
    width: 44,
    lineHeight: 13,
  },
  field: {
    flexGrow: 1,
    flexShrink: 1,
    aspectRatio: 1,
    alignSelf: 'center',
    backgroundColor: '#eef3f7',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.tabBar,
    overflow: 'hidden',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(51,64,80,0.12)',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(51,64,80,0.12)',
  },
  guide: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,152,0,0.55)',
  },
  seg: {
    position: 'absolute',
    height: 3,
    backgroundColor: colors.cyan,
    borderRadius: 2,
  },
  anchor: {
    position: 'absolute',
    backgroundColor: colors.tabBar,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  anchorStart: { backgroundColor: colors.ok },
  anchorOn: { borderColor: colors.warn, borderWidth: 3 },
  anchorText: { color: '#fff', fontWeight: '900', fontSize: a11yFont(10, textScale) },
  ctrlHit: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  ctrl: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#FF9800',
    borderWidth: 2,
    borderColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  ctrlOn: { backgroundColor: '#E65100', borderColor: colors.warn, width: 20, height: 20 },
  fieldBadge: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    color: colors.muted,
    fontSize: a11yFont(10, textScale),
    fontWeight: '700',
  },
  status: {
    color: colors.cyan,
    fontWeight: '700',
    fontSize: a11yFont(12, textScale),
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnPlay: { backgroundColor: colors.tabBar },
  btnStop: { backgroundColor: colors.danger },
  btnSec: { backgroundColor: colors.bgRaised, borderWidth: 1.5, borderColor: colors.tabBar },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: a11yFont(13, textScale) },
  btnSecText: { color: colors.ink, fontWeight: '800', fontSize: a11yFont(12, textScale) },

      }),
    [colors, textScale],
  );
}

