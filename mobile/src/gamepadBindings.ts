import { DANCES, READY_MOVES, channelsFromDirs, readyMoveById } from './dances';
import { FALLBACK_SOUNDS, soundControlPath } from './protocol';
import { motorPackets } from './mecanum';

export type PadButtonId = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'start' | 'select';

export type PadActionKind = 'none' | 'stop' | 'sound' | 'dance' | 'move';

export type PadAction = {
  id: string;
  kind: PadActionKind;
  label: string;
  /** Dla sound: ścieżka sounds/…; dance/move: id. */
  payload?: string;
};

export type PadBindings = Partial<Record<PadButtonId, string>>;

/** Pakiet sterujący wysyłany na Pi po naciśnięciu pada. */
export type RobotPacket = Record<string, unknown>;

export const PAD_BUTTONS: { id: PadButtonId; label: string; color: string }[] = [
  { id: 'y', label: 'Y', color: '#e6c84a' },
  { id: 'x', label: 'X', color: '#4aa3e6' },
  { id: 'b', label: 'B', color: '#e65a4a' },
  { id: 'a', label: 'A', color: '#4ae68a' },
  { id: 'lb', label: 'LB', color: '#6b8298' },
  { id: 'rb', label: 'RB', color: '#6b8298' },
  { id: 'lt', label: 'LT', color: '#4e6073' },
  { id: 'rt', label: 'RT', color: '#4e6073' },
  { id: 'select', label: 'Select', color: '#334050' },
  { id: 'start', label: 'Start', color: '#334050' },
];

export const NONE_ACTION: PadAction = { id: 'none', kind: 'none', label: '— brak —' };

export function buildPadActions(): PadAction[] {
  const sounds: PadAction[] = FALLBACK_SOUNDS.map((file) => ({
    id: `sound:${file}`,
    kind: 'sound',
    label: `Dźwięk: ${file.replace(/\.(mp3|wav)$/i, '').replace(/[_-]+/g, ' ')}`,
    payload: soundControlPath(file),
  }));
  const dances: PadAction[] = DANCES.map((d) => ({
    id: `dance:${d.id}`,
    kind: 'dance',
    label: `Taniec: ${d.label}`,
    payload: d.id,
  }));
  const moves: PadAction[] = READY_MOVES.map((m) => ({
    id: `move:${m.id}`,
    kind: 'move',
    label: `Ruch: ${m.label}`,
    payload: m.id,
  }));
  return [
    NONE_ACTION,
    { id: 'stop', kind: 'stop', label: 'STOP' },
    ...sounds,
    ...dances,
    ...moves,
  ];
}

export function actionById(id: string | undefined, catalog: PadAction[]): PadAction {
  if (!id) return NONE_ACTION;
  return catalog.find((a) => a.id === id) ?? NONE_ACTION;
}

export const DEFAULT_PAD_BINDINGS: PadBindings = {
  a: 'sound:bark.mp3',
  b: 'stop',
  x: 'sound:oiia-oiia-sound.mp3',
  y: 'sound:chicken-on-tree-screaming.mp3',
};

/** Przyciski face, których config synchronizujemy z Pi. */
export const PAD_FACE_BUTTONS: PadButtonId[] = ['a', 'b', 'x', 'y'];

export type PadButtonConfig = {
  id: string;
  kind: PadActionKind;
  label: string;
  /** play_sound */
  file?: string;
  volume?: number;
  /** dance / move */
  dance_id?: string;
  move_id?: string;
};

/**
 * Konfiguracja A/B/X/Y wysyłana na Pi przy starcie i po każdej zmianie.
 *
 * {
 *   "type": "pad_config",
 *   "pad": "genesis_mangan_pv58",
 *   "buttons": { "a": {…}, "b": {…}, "x": {…}, "y": {…} }
 * }
 */
export function buildPadConfigPacket(
  bindings: PadBindings,
  catalog: PadAction[] = buildPadActions(),
): RobotPacket {
  const buttons: Record<string, PadButtonConfig> = {};
  for (const btn of PAD_FACE_BUTTONS) {
    buttons[btn] = buttonConfigFor(bindings[btn], catalog);
  }
  return {
    type: 'pad_config',
    pad: 'genesis_mangan_pv58',
    buttons,
  };
}

function buttonConfigFor(actionId: string | undefined, catalog: PadAction[]): PadButtonConfig {
  const action = actionById(actionId, catalog);
  const entry: PadButtonConfig = {
    id: action.id,
    kind: action.kind,
    label: action.label,
  };
  if (action.kind === 'sound' && action.payload) {
    entry.file = soundControlPath(action.payload);
    entry.volume = 1;
  } else if (action.kind === 'dance' && action.payload) {
    entry.dance_id = action.payload;
  } else if (action.kind === 'move' && action.payload) {
    entry.move_id = action.payload;
  }
  return entry;
}

/**
 * Zawartość pliku keymap.json — osobny pakiet WS, żeby Pi mógł zapisać / przeładować mapę.
 *
 * {
 *   "type": "keymap",
 *   "filename": "keymap.json",
 *   "keymap": {
 *     "a": { "id": "sound:bark.mp3", "kind": "sound", "file": "sounds/bark.mp3", "volume": 1, "label": "…" },
 *     "b": { "id": "stop", "kind": "stop", "label": "STOP" },
 *     "x": { … },
 *     "y": { … }
 *   }
 * }
 */
export function buildKeymapPacket(
  bindings: PadBindings,
  catalog: PadAction[] = buildPadActions(),
): RobotPacket {
  const keymap: Record<string, PadButtonConfig> = {};
  for (const btn of PAD_FACE_BUTTONS) {
    keymap[btn] = buttonConfigFor(bindings[btn], catalog);
  }
  return {
    type: 'keymap',
    filename: 'keymap.json',
    keymap,
  };
}

/** pad_config + keymap.json w jednej wysyłce. */
export function buildPadSyncPackets(
  bindings: PadBindings,
  catalog: PadAction[] = buildPadActions(),
): RobotPacket[] {
  return [buildPadConfigPacket(bindings, catalog), buildKeymapPacket(bindings, catalog)];
}

/**
 * Zamienia akcję pada na pakiety WebSocket rozumiane przez Gremlina na Pi.
 * Dźwięk: { type: "play_sound", file: "sounds/….mp3", volume: 1 }
 */
export function packetsForPadAction(action: PadAction): RobotPacket[] {
  if (action.kind === 'none') return [];

  if (action.kind === 'sound' && action.payload) {
    return [
      {
        type: 'play_sound',
        file: soundControlPath(action.payload),
        volume: 1,
      },
    ];
  }

  if (action.kind === 'stop') {
    const zeros = motorPackets({
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
    });
    return [{ type: 'stop_sound' }, { type: 'stop' }, ...zeros];
  }

  if (action.kind === 'dance' && action.payload) {
    const dance = DANCES.find((d) => d.id === action.payload);
    if (!dance) return [];
    const step = dance.steps[0];
    if (!step) return [];
    const channels = channelsFromDirs(step.dirs, step.powerPct ?? dance.powerPct);
    return motorPackets(channels);
  }

  if (action.kind === 'move' && action.payload) {
    const move = readyMoveById(action.payload);
    if (!move) return [];
    return motorPackets(channelsFromDirs(move.dirs, move.powerPct));
  }

  return [];
}
