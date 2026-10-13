import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { a11yFont, useAccessibility } from '../accessibility';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import {
  SCRATCH_CATEGORIES,
  SCRATCH_COLORS,
  applyInsert,
  addProcedure,
  addVariable,
  buildPaletteItems,
  createEmptyProgram,
  defaultInsertTarget,
  makeNode,
  makeVarReporter,
  moveNode,
  nodeAcceptKind,
  normalizeProgram,
  removeNode,
  removeProcedure,
  removeVariable,
  renameProcedure,
  renameVariable,
  setInput,
  setProcedurePos,
  setScriptPos,
  updateNodeFields,
  type InsertTarget,
  type ScratchCategory,
  type ScratchDeviceId,
  type ScratchFields,
  type ScratchInputKey,
  type ScratchKind,
  type ScratchNode,
  type ScratchPaletteItem,
  type ScratchProgram,
  type ScratchSlotAccept,
} from '../scratch/blocks';
import { runScratchProgram, type ScratchRunnerHandle } from '../scratch/runner';
import { loadScratchProgram, saveScratchProgram } from '../storage';
import { colors, radii } from '../theme';
import {
  ScratchBlockView,
  ScratchProcBody,
  slotKey,
  type SlotRect,
} from './scratch/ScratchBlockView';

type Props = {
  online: boolean;
  onDrive: (x: number, y: number, omega?: number) => void;
  onStop: () => void;
  onPlaySound: (file: string, volume?: number) => void;
  onStopSound: () => void;
  devicePower: Partial<Record<ScratchDeviceId, boolean>>;
  batteryPct: number;
  onSetDevicePower: (device: ScratchDeviceId, enabled: boolean) => boolean;
};

const RAIL_ICONS: Record<ScratchCategory, string> = {
  control: '⟳',
  motion: '➔',
  sound: '♪',
  components: '◉',
  operators: '∑',
  vars: '𝑥',
  myblocks: '★',
};

const WORLD = 1100;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.8;
const PALETTE = buildPaletteItems();

function compatibleAccept(slot: ScratchSlotAccept, dragged: ScratchSlotAccept): boolean {
  if (slot === 'stack') return dragged === 'stack';
  if (slot === 'boolean') return dragged === 'boolean' || dragged === 'reporter';
  return dragged === 'reporter' || dragged === 'boolean';
}

function sameDefaults(a?: ScratchFields, b?: ScratchFields): boolean {
  if (!a && !b) return true;
  if (!a || !b) return !a && !b;
  return JSON.stringify(a) === JSON.stringify(b);
}

type DragGhost = {
  label: string;
  color: string;
  x: number;
  y: number;
  accept: ScratchSlotAccept;
  source:
    | { type: 'kind'; kind: ScratchKind; defaults?: ScratchFields }
    | { type: 'call'; procId: string }
    | { type: 'var'; varId: string }
    | { type: 'move'; nodeId: string }
    | { type: 'script' }
    | { type: 'proc'; procId: string };
};

type Cam = { x: number; y: number; scale: number };

export function ScratchTab({
  online,
  onDrive,
  onStop,
  onPlaySound,
  onStopSound,
  devicePower,
  batteryPct,
  onSetDevicePower,
}: Props) {
  const styles = useStyles();

  const [program, setProgram] = useState<ScratchProgram>(() => createEmptyProgram());
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<ScratchCategory | null>('motion');
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('⠿ przeciągnij bloczek · przesuwaj płótno');
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [cam, setCam] = useState<Cam>({ x: 20, y: 30, scale: 1 });

  const runnerRef = useRef<ScratchRunnerHandle | null>(null);
  const slotsRef = useRef<Map<string, SlotRect>>(new Map());
  const slotRemeasureRef = useRef<Map<string, (done?: () => void) => void>>(new Map());
  const rootRef = useRef<View>(null);
  const rootOrigin = useRef({ x: 0, y: 0 });
  const programRef = useRef(program);
  programRef.current = program;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const camRef = useRef(cam);
  camRef.current = cam;
  const camStart = useRef({ x: 0, y: 0, scale: 1 });
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const viewportRef = useRef({ w: 300, h: 400 });
  const movingStack = useRef<{ kind: 'script' | 'proc'; id?: string; ox: number; oy: number } | null>(
    null,
  );

  const measureRoot = () => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOrigin.current = { x, y };
    });
  };

  /** pageX/Y → lokalne względem root (ghost nie „ucieka” pod palcem). */
  const ghostPos = (pageX: number, pageY: number) => ({
    x: pageX - rootOrigin.current.x - 28,
    y: pageY - rootOrigin.current.y - 14,
  });

  useEffect(() => {
    let cancelled = false;
    void loadScratchProgram().then((raw) => {
      if (cancelled) return;
      setProgram(normalizeProgram(raw));
      setReady(true);
    });
    return () => {
      cancelled = true;
      runnerRef.current?.stop();
    };
  }, []);

  const persist = useCallback((next: ScratchProgram) => {
    setProgram(next);
    void saveScratchProgram(next);
  }, []);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const registerSlot = useCallback(
    (rect: SlotRect | null, key: string, remeasure?: (done?: () => void) => void) => {
      if (!rect) {
        slotsRef.current.delete(key);
        slotRemeasureRef.current.delete(key);
        return;
      }
      slotsRef.current.set(key, rect);
      if (remeasure) slotRemeasureRef.current.set(key, remeasure);
    },
    [],
  );

  /** Odśwież pozycje slotów (pan/zoom psuje stare measureInWindow). */
  const refreshSlots = useCallback((done?: () => void) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      done?.();
    };
    const fns = [...slotRemeasureRef.current.values()];
    if (!fns.length) {
      finish();
      return;
    }
    let left = fns.length;
    for (const fn of fns) {
      fn(() => {
        left -= 1;
        if (left <= 0) finish();
      });
    }
    setTimeout(finish, 60);
  }, []);

  const findSlotAt = useCallback(
    (pageX: number, pageY: number, accept?: ScratchSlotAccept): InsertTarget | null => {
      let best: SlotRect | null = null;
      let bestScore = Infinity;
      for (const s of slotsRef.current.values()) {
        const need = s.target.accept || (s.target.branch === 'input' ? 'reporter' : 'stack');
        if (accept && !compatibleAccept(need, accept)) continue;
        const pad = s.target.branch === 'input' ? 28 : 14;
        const inside =
          pageX >= s.x - 10 &&
          pageX <= s.x + Math.max(s.w, 24) + 10 &&
          pageY >= s.y - pad &&
          pageY <= s.y + Math.max(s.h, 18) + pad;
        if (inside) {
          const cx = s.x + Math.max(s.w, 24) / 2;
          const cy = s.y + Math.max(s.h, 18) / 2;
          let d = Math.hypot(pageX - cx, pageY - cy);
          if (s.target.branch === 'input') d *= 0.35;
          if (d < bestScore) {
            bestScore = d;
            best = s;
          }
        }
      }
      return best?.target ?? null;
    },
    [],
  );
  const findSlotAtRef = useRef(findSlotAt);
  findSlotAtRef.current = findSlotAt;

  const updateHover = useCallback(
    (pageX: number, pageY: number) => {
      refreshSlots();
      const accept = ghostRef.current?.accept;
      const t = findSlotAtRef.current(pageX, pageY, accept);
      setHoverKey(t ? slotKey(t) : null);
    },
    [refreshSlots],
  );

  const dropAt = useCallback(
    (pageX: number, pageY: number) => {
      const g = ghostRef.current;
      if (!g || playingRef.current) {
        setGhost(null);
        setHoverKey(null);
        setDraggingId(null);
        movingStack.current = null;
        return;
      }

      const finish = () => {
        setGhost(null);
        setHoverKey(null);
        setDraggingId(null);
        movingStack.current = null;

        if (g.source.type === 'script' || g.source.type === 'proc') {
          persistRef.current(programRef.current);
          setStatus('Przesunięto skrypt');
          return;
        }

        const target =
          findSlotAtRef.current(pageX, pageY, g.accept) ||
          (g.accept === 'stack' ? defaultInsertTarget(programRef.current) : null);
        if (!target) {
          setStatus('Upuść w puste pole (□) bloku');
          return;
        }

        let next = programRef.current;
        const src = g.source;
        if (src.type === 'kind') {
          const item = PALETTE.find(
            (p) => p.kind === src.kind && sameDefaults(p.defaults, src.defaults),
          );
          if (item?.disabled) {
            setStatus('TODO — niedostępne');
            return;
          }
          next = applyInsert(next, target, makeNode(src.kind, src.defaults));
          setStatus(`Dodano: ${g.label}`);
        } else if (src.type === 'call') {
          const proc = next.procedures.find((p) => p.id === src.procId);
          next = applyInsert(
            next,
            target,
            makeNode('call_proc', { procId: src.procId, procName: proc?.name }),
          );
          setStatus(`Dodano: ${g.label}`);
        } else if (src.type === 'var') {
          const v = next.variables.find((x) => x.id === src.varId);
          if (!v) return;
          next = applyInsert(next, target, makeVarReporter(v));
          setStatus(`Dodano: ${g.label}`);
        } else {
          next = moveNode(next, src.nodeId, target);
          setStatus('Przeniesiono');
        }
        persistRef.current(next);
      };

      refreshSlots(finish);
    },
    [refreshSlots],
  );

  const pageToWorld = (pageX: number, pageY: number, origin: { x: number; y: number }) => {
    const c = camRef.current;
    const lx = pageX - origin.x;
    const ly = pageY - origin.y;
    // po kompensacji środka: visualOffset = cam + WORLD/2*(1-scale)
    const ox = c.x + (WORLD / 2) * (1 - c.scale);
    const oy = c.y + (WORLD / 2) * (1 - c.scale);
    return {
      x: (lx - ox) / c.scale,
      y: (ly - oy) / c.scale,
    };
  };

  const viewportOrigin = useRef({ x: 0, y: 0 });

  const onDragBlockStart = useCallback(
    (nodeId: string, pageX: number, pageY: number) => {
      if (playingRef.current) return;
      measureRoot();
      const walk = (
        nodes: ScratchProgram['script'],
      ): { label: string; color: string; kind: ScratchKind } | null => {
        for (const n of nodes) {
          if (n.id === nodeId) {
            const def = PALETTE.find((d) => d.kind === n.kind);
            let label = def?.label || n.kind;
            if (n.kind === 'var_reporter') label = n.fields.varName || 'zmienna';
            if (n.kind === 'device_ref') {
              label =
                PALETTE.find(
                  (p) => p.kind === 'device_ref' && p.defaults.device === n.fields.device,
                )?.label || 'komponent';
            }
            return {
              label,
              color: SCRATCH_COLORS[def?.category || 'motion'],
              kind: n.kind,
            };
          }
          if (n.children) {
            const h = walk(n.children);
            if (h) return h;
          }
          if (n.elseChildren) {
            const h = walk(n.elseChildren);
            if (h) return h;
          }
          if (n.inputs) {
            for (const child of Object.values(n.inputs)) {
              if (child) {
                const h = walk([child]);
                if (h) return h;
              }
            }
          }
        }
        return null;
      };
      let info = walk(programRef.current.script);
      if (!info) {
        for (const p of programRef.current.procedures) {
          info = walk(p.children);
          if (info) break;
        }
      }
      const pos = ghostPos(pageX, pageY);
      const accept = info ? nodeAcceptKind(info.kind) : 'stack';
      setDraggingId(nodeId);
      setGhost({
        label: info?.label || 'blok',
        color: info?.color || SCRATCH_COLORS.motion,
        x: pos.x,
        y: pos.y,
        accept,
        source: { type: 'move', nodeId },
      });
      updateHover(pageX, pageY);
    },
    [updateHover],
  );

  const onDragMove = useCallback(
    (pageX: number, pageY: number) => {
      const g = ghostRef.current;
      const pos = ghostPos(pageX, pageY);
      if (g?.source.type === 'script' || g?.source.type === 'proc') {
        const w = pageToWorld(pageX, pageY, viewportOrigin.current);
        const m = movingStack.current;
        if (m) {
          const nx = w.x - m.ox;
          const ny = w.y - m.oy;
          if (m.kind === 'script') {
            setProgram((p) => setScriptPos(p, { x: nx, y: ny }));
          } else if (m.id) {
            setProgram((p) => setProcedurePos(p, m.id!, { x: nx, y: ny }));
          }
        }
        setGhost((prev) => (prev ? { ...prev, x: pos.x, y: pos.y } : prev));
        return;
      }
      setGhost((prev) => (prev ? { ...prev, x: pos.x, y: pos.y } : prev));
      updateHover(pageX, pageY);
    },
    [updateHover],
  );

  const onDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      dropAt(pageX, pageY);
    },
    [dropAt],
  );

  const startMoveScript = (pageX: number, pageY: number) => {
    measureRoot();
    const w = pageToWorld(pageX, pageY, viewportOrigin.current);
    const pos = programRef.current.scriptPos;
    movingStack.current = { kind: 'script', ox: w.x - pos.x, oy: w.y - pos.y };
    const gp = ghostPos(pageX, pageY);
    setGhost({
      label: 'Start',
      color: '#FFBF00',
      x: gp.x,
      y: gp.y,
      accept: 'stack',
      source: { type: 'script' },
    });
  };

  const startMoveProc = (procId: string, pageX: number, pageY: number) => {
    measureRoot();
    const proc = programRef.current.procedures.find((p) => p.id === procId);
    if (!proc) return;
    const w = pageToWorld(pageX, pageY, viewportOrigin.current);
    movingStack.current = { kind: 'proc', id: procId, ox: w.x - proc.x, oy: w.y - proc.y };
    const gp = ghostPos(pageX, pageY);
    setGhost({
      label: proc.name,
      color: SCRATCH_COLORS.myblocks,
      x: gp.x,
      y: gp.y,
      accept: 'stack',
      source: { type: 'proc', procId },
    });
  };

  const scriptMovePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => startMoveScript(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderMove: (e) => onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderRelease: (e) => onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderTerminate: (e) => onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
      }),
    [onDragMove, onDragEnd],
  );

  const procMovePans = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const getProcMovePan = (procId: string) => {
    let pan = procMovePans.current.get(procId);
    if (!pan) {
      pan = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) =>
          startMoveProc(procId, e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderMove: (e) => onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderRelease: (e) => onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderTerminate: (e) => onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
      });
      procMovePans.current.set(procId, pan);
    }
    return pan;
  };

  const touchDist = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };

  const workspacePan = useMemo(
    () =>
      PanResponder.create({
        // NIE przechwytywaj od razu — inaczej bloczki na płótnie nie da się ruszyć
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          !ghostRef.current && (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10),
        onPanResponderGrant: (e) => {
          camStart.current = { ...camRef.current };
          const d = touchDist(e);
          pinchStart.current = d > 0 ? { dist: d, scale: camRef.current.scale } : null;
        },
        onPanResponderMove: (e, g) => {
          if (ghostRef.current) return;
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            const d = touchDist(e);
            if (!pinchStart.current) {
              pinchStart.current = { dist: d, scale: camRef.current.scale };
              return;
            }
            const ratio = d / Math.max(1, pinchStart.current.dist);
            const nextScale = Math.max(
              MIN_SCALE,
              Math.min(MAX_SCALE, pinchStart.current.scale * ratio),
            );
            setCam((c) => ({ ...c, scale: nextScale }));
            return;
          }
          pinchStart.current = null;
          setCam({
            x: camStart.current.x + g.dx,
            y: camStart.current.y + g.dy,
            scale: camStart.current.scale,
          });
        },
        onPanResponderRelease: () => {
          pinchStart.current = null;
        },
      }),
    [],
  );

  const palettePanById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof PanResponder.create>>();
    for (const b of PALETTE) {
      const item: ScratchPaletteItem = b;
      map.set(
        item.id,
        PanResponder.create({
          onStartShouldSetPanResponder: () => !playingRef.current && !item.disabled,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: (e: GestureResponderEvent) => {
            if (playingRef.current || item.disabled) return;
            measureRoot();
            const pos = ghostPos(e.nativeEvent.pageX, e.nativeEvent.pageY);
            setGhost({
              label: item.label,
              color: SCRATCH_COLORS[item.category],
              x: pos.x,
              y: pos.y,
              accept: nodeAcceptKind(item.kind),
              source: { type: 'kind', kind: item.kind, defaults: item.defaults },
            });
            updateHover(e.nativeEvent.pageX, e.nativeEvent.pageY);
          },
          onPanResponderMove: (e) => {
            const { pageX, pageY } = e.nativeEvent;
            const pos = ghostPos(pageX, pageY);
            setGhost((g) => (g ? { ...g, x: pos.x, y: pos.y } : g));
            updateHover(pageX, pageY);
          },
          onPanResponderRelease: (e) => dropAt(e.nativeEvent.pageX, e.nativeEvent.pageY),
          onPanResponderTerminate: (e) => dropAt(e.nativeEvent.pageX, e.nativeEvent.pageY),
        }),
      );
    }
    return map;
  }, [dropAt, updateHover]);

  const callPanCache = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const getCallPan = (procId: string, name: string) => {
    let pan = callPanCache.current.get(procId);
    if (!pan) {
      pan = PanResponder.create({
        onStartShouldSetPanResponder: () => !playingRef.current,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          if (playingRef.current) return;
          measureRoot();
          const pos = ghostPos(e.nativeEvent.pageX, e.nativeEvent.pageY);
          setGhost({
            label: name,
            color: SCRATCH_COLORS.myblocks,
            x: pos.x,
            y: pos.y,
            accept: 'stack',
            source: { type: 'call', procId },
          });
          updateHover(e.nativeEvent.pageX, e.nativeEvent.pageY);
        },
        onPanResponderMove: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          const pos = ghostPos(pageX, pageY);
          setGhost((g) => (g ? { ...g, x: pos.x, y: pos.y } : g));
          updateHover(pageX, pageY);
        },
        onPanResponderRelease: (e) => dropAt(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderTerminate: (e) => dropAt(e.nativeEvent.pageX, e.nativeEvent.pageY),
      });
      callPanCache.current.set(procId, pan);
    }
    return pan;
  };

  const varPanCache = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const getVarPan = (varId: string, name: string) => {
    let pan = varPanCache.current.get(varId);
    if (!pan) {
      pan = PanResponder.create({
        onStartShouldSetPanResponder: () => !playingRef.current,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          if (playingRef.current) return;
          measureRoot();
          const pos = ghostPos(e.nativeEvent.pageX, e.nativeEvent.pageY);
          setGhost({
            label: name,
            color: SCRATCH_COLORS.vars,
            x: pos.x,
            y: pos.y,
            accept: 'reporter',
            source: { type: 'var', varId },
          });
          updateHover(e.nativeEvent.pageX, e.nativeEvent.pageY);
        },
        onPanResponderMove: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          const pos = ghostPos(pageX, pageY);
          setGhost((g) => (g ? { ...g, x: pos.x, y: pos.y } : g));
          updateHover(pageX, pageY);
        },
        onPanResponderRelease: (e) => dropAt(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderTerminate: (e) => dropAt(e.nativeEvent.pageX, e.nativeEvent.pageY),
      });
      varPanCache.current.set(varId, pan);
    }
    return pan;
  };

  const halt = useCallback(() => {
    runnerRef.current?.stop();
    runnerRef.current = null;
    setPlaying(false);
    onStop();
    setStatus('STOP');
  }, [onStop]);

  const play = () => {
    if (!online) {
      setStatus('Najpierw połącz z Pi');
      return;
    }
    runnerRef.current?.stop();
    runnerRef.current = null;
    onStop();
    setPlaying(true);
    setStatus('Uruchamiam…');
    const handle = runScratchProgram(program, {
      drive: onDrive,
      stop: onStop,
      playSound: onPlaySound,
      stopSound: onStopSound,
      setDevicePower: onSetDevicePower,
      isDeviceOn: (device) => devicePower[device] !== false,
      getBatteryPct: () => batteryPct,
    });
    runnerRef.current = handle;
    void handle.done.then(() => {
      if (runnerRef.current === handle) {
        runnerRef.current = null;
        setPlaying(false);
        setStatus('Koniec programu');
      }
    });
  };

  const createProc = () => {
    if (playing) return;
    const next = addProcedure(program, `Blok ${program.procedures.length + 1}`);
    persist(next);
    setCategory('myblocks');
    setStatus('Nowa procedura na płótnie');
  };

  const createVar = () => {
    if (playing) return;
    const next = addVariable(program, `zmienna${program.variables.length + 1}`);
    persist(next);
    setCategory('vars');
    setStatus('Nowa zmienna — przeciągnij z palety');
  };

  const zoomBy = (factor: number) => {
    setCam((c) => ({
      ...c,
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * factor)),
    }));
  };

  const onViewportLayout = (e: LayoutChangeEvent) => {
    viewportRef.current = {
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    };
  };

  const flyoutBlocks = useMemo(
    () => (category ? PALETTE.filter((b) => b.category === category) : []),
    [category],
  );

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.muted}>Ładowanie…</Text>
      </View>
    );
  }

  const start = program.script.find((n) => n.kind === 'start');
  const dragging = !!ghost;

  const sharedBlockProps = {
    procedures: program.procedures,
    variables: program.variables,
    hoverKey,
    draggingId,
    registerSlot,
    onRemove: (id: string) => {
      persist(removeNode(program, id));
      setStatus('Usunięto');
    },
    onChangeFields: (id: string, patch: Parameters<typeof updateNodeFields>[2]) => {
      const next = updateNodeFields(program, id, patch);
      persist(next);
    },
    onSetInput: (parentId: string, key: ScratchInputKey, node: ScratchNode | null) => {
      persist(setInput(program, parentId, key, node));
    },
    onDragBlockStart,
    onDragMove,
    onDragEnd,
  };

  return (
    <View style={styles.root} ref={rootRef} onLayout={measureRoot}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>Program</Text>
        <View style={styles.toolbarBtns}>
          <Pressable onPress={play} disabled={playing} style={[styles.runBtn, playing && styles.btnOff]}>
            <Text style={styles.runText}>Uruchom</Text>
          </Pressable>
          <Pressable onPress={halt} style={styles.stopBtn}>
            <Text style={styles.runText}>Stop</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.status} numberOfLines={1}>
        {status}
      </Text>

      <View style={styles.main}>
        <View style={styles.rail}>
          {SCRATCH_CATEGORIES.map((c) => {
            const on = category === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(on ? null : c.id)}
                style={[
                  styles.railBtn,
                  { backgroundColor: on ? SCRATCH_COLORS[c.id] : 'rgba(255,255,255,0.45)' },
                ]}
              >
                <Text style={[styles.railIcon, on && styles.railIconOn]}>{RAIL_ICONS[c.id]}</Text>
              </Pressable>
            );
          })}
        </View>

        {category ? (
          <View style={styles.flyout}>
            <ScrollView
              contentContainerStyle={styles.flyoutInner}
              bounces={false}
              scrollEnabled={!dragging}
            >
              <Text style={styles.flyoutTitle}>
                {SCRATCH_CATEGORIES.find((c) => c.id === category)?.label}
              </Text>
              {category === 'myblocks' ? (
                <>
                  <Pressable onPress={createProc} style={styles.createProc}>
                    <Text style={styles.createProcText}>+ nowy</Text>
                  </Pressable>
                  {program.procedures.map((p) => {
                    const pan = getCallPan(p.id, p.name);
                    return (
                      <View key={p.id} style={styles.procRow}>
                        <View
                          {...pan.panHandlers}
                          style={[styles.flyBlock, { backgroundColor: SCRATCH_COLORS.myblocks }]}
                        >
                          <Text style={styles.flyBlockText} numberOfLines={2}>
                            {p.name}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            persist(removeProcedure(program, p.id));
                            setStatus(`Usunięto „${p.name}”`);
                          }}
                        >
                          <Text style={styles.procDelText}>usuń</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </>
              ) : category === 'vars' ? (
                <>
                  <Pressable
                    onPress={createVar}
                    style={[styles.createProc, { backgroundColor: SCRATCH_COLORS.vars }]}
                  >
                    <Text style={styles.createProcText}>+ nowa</Text>
                  </Pressable>
                  {program.variables.map((v) => {
                    const pan = getVarPan(v.id, v.name);
                    return (
                      <View key={v.id} style={styles.procRow}>
                        <View style={styles.varRow}>
                          <View
                            {...pan.panHandlers}
                            style={[
                              styles.flyBlock,
                              styles.flyOval,
                              styles.varGrip,
                              { backgroundColor: SCRATCH_COLORS.vars },
                            ]}
                          >
                            <Text style={styles.flyBlockText}>⠿</Text>
                          </View>
                          <TextInput
                            value={v.name}
                            onChangeText={(t) => persist(renameVariable(program, v.id, t))}
                            style={styles.varNameInput}
                            placeholder="nazwa"
                            placeholderTextColor="rgba(0,0,0,0.35)"
                          />
                        </View>
                        <Pressable
                          onPress={() => {
                            persist(removeVariable(program, v.id));
                            setStatus(`Usunięto „${v.name}”`);
                          }}
                        >
                          <Text style={styles.procDelText}>usuń</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {flyoutBlocks.map((b) => {
                    const pan = palettePanById.get(b.id);
                    return (
                      <View
                        key={b.id}
                        {...(b.disabled || playing || !pan ? {} : pan.panHandlers)}
                        style={[
                          styles.flyBlock,
                          { backgroundColor: SCRATCH_COLORS[b.category] },
                          b.disabled && styles.flyDisabled,
                        ]}
                      >
                        <Text style={styles.flyBlockText} numberOfLines={2}>
                          {b.label}
                        </Text>
                      </View>
                    );
                  })}
                </>
              ) : (
                flyoutBlocks.map((b) => {
                  const pan = palettePanById.get(b.id);
                  const oval = b.shape === 'reporter' || b.shape === 'boolean';
                  return (
                    <View
                      key={b.id}
                      {...(b.disabled || playing || !pan ? {} : pan.panHandlers)}
                      style={[
                        styles.flyBlock,
                        oval && styles.flyOval,
                        b.shape === 'boolean' && styles.flyBool,
                        { backgroundColor: SCRATCH_COLORS[b.category] },
                        b.disabled && styles.flyDisabled,
                      ]}
                    >
                      <Text style={styles.flyBlockText} numberOfLines={2}>
                        {b.label}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        ) : null}

        <View
          style={styles.workspace}
          onLayout={onViewportLayout}
          ref={(r) => {
            r?.measureInWindow((x, y) => {
              viewportOrigin.current = { x, y };
            });
          }}
          {...(dragging ? {} : workspacePan.panHandlers)}
        >
          <View
            style={[
              styles.world,
              {
                width: WORLD,
                height: WORLD,
                transform: [
                  // kompensacja: RN skaluje od środka → trzymamy origin w lewym górnym
                  { translateX: cam.x + (WORLD / 2) * (1 - cam.scale) },
                  { translateY: cam.y + (WORLD / 2) * (1 - cam.scale) },
                  { scale: cam.scale },
                ],
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.worldTint,
                { width: WORLD, height: WORLD },
              ]}
            />

            {/* Główny skrypt */}
            <View
              style={[
                styles.stackAbs,
                { left: program.scriptPos.x, top: program.scriptPos.y },
              ]}
            >
              <View {...scriptMovePan.panHandlers} style={styles.moveHandle}>
                <Text style={styles.moveHandleTxt}>⠿ Start</Text>
              </View>
              {start ? <ScratchBlockView {...sharedBlockProps} node={start} /> : null}
            </View>

            {program.procedures.map((proc) => (
              <View key={proc.id} style={[styles.stackAbs, { left: proc.x, top: proc.y }]}>
                <View {...getProcMovePan(proc.id).panHandlers} style={styles.moveHandle}>
                  <Text style={styles.moveHandleTxt}>⠿ {proc.name}</Text>
                </View>
                <ScratchProcBody
                  {...sharedBlockProps}
                  proc={proc}
                  onRename={(name) => persist(renameProcedure(program, proc.id, name))}
                />
              </View>
            ))}
          </View>

          <View style={styles.zoomBar} pointerEvents="box-none">
            <Pressable onPress={() => zoomBy(1.2)} style={styles.zoomBtn}>
              <Text style={styles.zoomTxt}>+</Text>
            </Pressable>
            <Text style={styles.zoomPct}>{Math.round(cam.scale * 100)}%</Text>
            <Pressable onPress={() => zoomBy(1 / 1.2)} style={styles.zoomBtn}>
              <Text style={styles.zoomTxt}>−</Text>
            </Pressable>
            <Pressable
              onPress={() => setCam({ x: 20, y: 30, scale: 1 })}
              style={styles.zoomBtn}
            >
              <Text style={styles.zoomTxt}>⌂</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {ghost && ghost.source.type !== 'script' && ghost.source.type !== 'proc' ? (
        <View
          pointerEvents="none"
          style={[styles.ghost, { left: ghost.x, top: ghost.y, backgroundColor: ghost.color }]}
        >
          <Text style={styles.ghostText} numberOfLines={1}>
            {ghost.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const RAIL_W = 44;
const FLY_W = 118;


function useStyles() {
  const { colors, textScale, prefs } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRaised },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.muted, fontWeight: '700', fontSize: a11yFont(13, textScale) },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { color: colors.ink, fontWeight: '900', fontSize: a11yFont(15, textScale) },
  toolbarBtns: { flexDirection: 'row', gap: 6 },
  runBtn: {
    backgroundColor: colors.ok,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
  },
  stopBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
  },
  btnOff: { opacity: 0.45 },
  runText: { color: prefs.highContrast ? '#000' : '#fff', fontWeight: '800', fontSize: a11yFont(12, textScale) },
  status: {
    color: colors.cyan,
    fontFamily: 'monospace',
    fontSize: a11yFont(10, textScale),
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.card,
  },
  main: { flex: 1, flexDirection: 'row' },
  rail: {
    width: RAIL_W,
    backgroundColor: colors.button,
    paddingVertical: 8,
    gap: 6,
    alignItems: 'center',
  },
  railBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railIcon: { fontSize: a11yFont(18, textScale), color: colors.ink, fontWeight: '900' },
  railIconOn: { color: '#fff' },
  flyout: {
    width: FLY_W,
    backgroundColor: colors.bgRaised,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  flyoutInner: { padding: 8, paddingBottom: 28, gap: 6 },
  flyoutTitle: { color: colors.ink, fontWeight: '900', fontSize: a11yFont(12, textScale), marginBottom: 2 },
  flyBlock: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  flyOval: { borderRadius: 16 },
  flyBool: { borderRadius: 6 },
  varRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  varGrip: { paddingHorizontal: 8, paddingVertical: 8, minWidth: 36 },
  varNameInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 6,
    paddingVertical: 6,
    color: colors.ink,
    fontWeight: '800',
    fontSize: a11yFont(11, textScale),
    minWidth: 0,
  },
  flyBlockText: { color: '#fff', fontWeight: '800', fontSize: a11yFont(11, textScale) },
  flyDisabled: { opacity: 0.35 },
  createProc: {
    backgroundColor: SCRATCH_COLORS.myblocks,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  createProcText: { color: '#fff', fontWeight: '900', fontSize: a11yFont(11, textScale) },
  procRow: { gap: 2 },
  procDelText: { color: colors.danger, fontSize: a11yFont(9, textScale), fontWeight: '700', textAlign: 'right' },
  workspace: {
    flex: 1,
    backgroundColor: colors.bgRaised,
    overflow: 'hidden',
  },
  world: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: colors.bgRaised,
  },
  worldTint: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'transparent',
  },
  stackAbs: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
  moveHandle: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  moveHandleTxt: {
    color: 'rgba(0,0,0,0.45)',
    fontWeight: '800',
    fontSize: a11yFont(10, textScale),
  },
  zoomBar: {
    position: 'absolute',
    right: 8,
    bottom: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  zoomBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomTxt: { color: colors.ink, fontWeight: '900', fontSize: a11yFont(16, textScale) },
  zoomPct: { color: colors.muted, fontSize: a11yFont(9, textScale), fontWeight: '700' },
  ghost: {
    position: 'absolute',
    zIndex: 20,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 72,
    maxWidth: 130,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  ghostText: { color: '#fff', fontWeight: '800', fontSize: a11yFont(11, textScale) },
}),
    [colors, textScale, prefs.highContrast],
  );
}
