/** Model bloczków Scratch-like dla Gremlin. */

export type ScratchCategory =
  | 'control'
  | 'motion'
  | 'sound'
  | 'components'
  | 'operators'
  | 'vars'
  | 'myblocks';

export type ScratchShape = 'hat' | 'stack' | 'cap' | 'c' | 'c_if' | 'reporter' | 'boolean';

/** Co przyjmuje slot. */
export type ScratchSlotAccept = 'stack' | 'reporter' | 'boolean';

export type ScratchKind =
  | 'start'
  | 'end'
  | 'repeat'
  | 'forever'
  | 'while'
  | 'wait'
  | 'if'
  | 'move_forward'
  | 'move_back'
  | 'turn_left'
  | 'turn_right'
  | 'stop_motors'
  | 'play_sound'
  | 'stop_sound'
  | 'when_obstacle'
  | 'distance_lt'
  | 'set_var'
  | 'change_var'
  | 'var_reporter'
  | 'device_ref'
  | 'device_is_on'
  | 'device_is_off'
  | 'device_turn_on'
  | 'device_turn_off'
  | 'number'
  | 'op_add'
  | 'op_sub'
  | 'op_mul'
  | 'op_div'
  | 'op_eq'
  | 'op_gt'
  | 'op_lt'
  | 'op_gte'
  | 'op_lte'
  | 'define_proc'
  | 'call_proc';

export type ScratchDeviceId = 'OAK-D' | 'LIDAR' | 'MIC' | 'SPEAKER';

export type ScratchInputKey = 'condition' | 'device' | 'a' | 'b' | 'value' | 'var';

export type ScratchInputs = Partial<Record<ScratchInputKey, ScratchNode | null>>;

export type ScratchFields = {
  sec?: number;
  times?: number;
  powerPct?: number;
  sound?: string;
  varName?: string;
  varId?: string;
  cmpValue?: number;
  device?: ScratchDeviceId;
  /** Literal liczby w bloku `number`. */
  numberValue?: number;
  procName?: string;
  procId?: string;
  /** Legacy — migracja starego set_device. */
  deviceOn?: boolean;
};

export type ScratchVariable = {
  id: string;
  name: string;
  value: number;
};

export type ScratchNode = {
  id: string;
  kind: ScratchKind;
  fields: ScratchFields;
  children?: ScratchNode[];
  elseChildren?: ScratchNode[];
  inputs?: ScratchInputs;
};

export type ScratchProcedure = {
  id: string;
  name: string;
  children: ScratchNode[];
  x: number;
  y: number;
};

export type ScratchProgram = {
  script: ScratchNode[];
  scriptPos: { x: number; y: number };
  procedures: ScratchProcedure[];
  variables: ScratchVariable[];
};

export const SCRATCH_COLORS: Record<ScratchCategory, string> = {
  control: '#FFAB19',
  motion: '#4C97FF',
  sound: '#CF63CF',
  components: '#5CB1D6',
  operators: '#59C059',
  vars: '#FF8C1A',
  myblocks: '#FF6680',
};

export const SCRATCH_DEVICES: { id: ScratchDeviceId; label: string }[] = [
  { id: 'OAK-D', label: 'Kamera' },
  { id: 'LIDAR', label: 'Lidar' },
  { id: 'MIC', label: 'Mikrofon' },
  { id: 'SPEAKER', label: 'Głośnik' },
];

export type ScratchBlockDef = {
  kind: ScratchKind;
  category: ScratchCategory;
  shape: ScratchShape;
  label: string;
  disabled?: boolean;
  defaults: ScratchFields;
  inputKeys?: ScratchInputKey[];
};

export const SCRATCH_CATALOG: ScratchBlockDef[] = [
  {
    kind: 'repeat',
    category: 'control',
    shape: 'c',
    label: 'Powtórz',
    defaults: { times: 3 },
  },
  {
    kind: 'forever',
    category: 'control',
    shape: 'c',
    label: 'Zawsze',
    defaults: {},
  },
  {
    kind: 'while',
    category: 'control',
    shape: 'c',
    label: 'Dopóki',
    defaults: {},
    inputKeys: ['condition'],
  },
  {
    kind: 'wait',
    category: 'control',
    shape: 'stack',
    label: 'Czekaj',
    defaults: { sec: 1 },
  },
  {
    kind: 'if',
    category: 'control',
    shape: 'c_if',
    label: 'Jeśli',
    defaults: {},
    inputKeys: ['condition'],
  },
  {
    kind: 'move_forward',
    category: 'motion',
    shape: 'stack',
    label: 'Jedź do przodu',
    defaults: { sec: 1, powerPct: 35 },
  },
  {
    kind: 'move_back',
    category: 'motion',
    shape: 'stack',
    label: 'Jedź do tyłu',
    defaults: { sec: 1, powerPct: 35 },
  },
  {
    kind: 'turn_left',
    category: 'motion',
    shape: 'stack',
    label: 'Skręć w lewo',
    defaults: { sec: 0.8, powerPct: 40 },
  },
  {
    kind: 'turn_right',
    category: 'motion',
    shape: 'stack',
    label: 'Skręć w prawo',
    defaults: { sec: 0.8, powerPct: 40 },
  },
  {
    kind: 'stop_motors',
    category: 'motion',
    shape: 'stack',
    label: 'Stop silniki',
    defaults: {},
  },
  {
    kind: 'play_sound',
    category: 'sound',
    shape: 'stack',
    label: 'Zagraj dźwięk',
    defaults: { sound: 'bark.mp3' },
  },
  {
    kind: 'stop_sound',
    category: 'sound',
    shape: 'stack',
    label: 'Stop dźwięk',
    defaults: {},
  },
  {
    kind: 'device_ref',
    category: 'components',
    shape: 'reporter',
    label: 'Kamera',
    defaults: { device: 'OAK-D' },
  },
  {
    kind: 'device_is_on',
    category: 'components',
    shape: 'boolean',
    label: 'włączony',
    defaults: {},
    inputKeys: ['device'],
  },
  {
    kind: 'device_is_off',
    category: 'components',
    shape: 'boolean',
    label: 'wyłączony',
    defaults: {},
    inputKeys: ['device'],
  },
  {
    kind: 'device_turn_on',
    category: 'components',
    shape: 'stack',
    label: 'włącz',
    defaults: {},
    inputKeys: ['device'],
  },
  {
    kind: 'device_turn_off',
    category: 'components',
    shape: 'stack',
    label: 'wyłącz',
    defaults: {},
    inputKeys: ['device'],
  },
  {
    kind: 'when_obstacle',
    category: 'components',
    shape: 'stack',
    label: 'Gdy przeszkoda (TODO)',
    disabled: true,
    defaults: {},
  },
  {
    kind: 'distance_lt',
    category: 'components',
    shape: 'stack',
    label: 'Odległość < … (TODO)',
    disabled: true,
    defaults: {},
  },
  {
    kind: 'number',
    category: 'operators',
    shape: 'reporter',
    label: 'Liczba',
    defaults: { numberValue: 0 },
  },
  {
    kind: 'op_add',
    category: 'operators',
    shape: 'reporter',
    label: '+',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_sub',
    category: 'operators',
    shape: 'reporter',
    label: '−',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_mul',
    category: 'operators',
    shape: 'reporter',
    label: '×',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_div',
    category: 'operators',
    shape: 'reporter',
    label: '÷',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_eq',
    category: 'operators',
    shape: 'boolean',
    label: '=',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_gt',
    category: 'operators',
    shape: 'boolean',
    label: '>',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_lt',
    category: 'operators',
    shape: 'boolean',
    label: '<',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_gte',
    category: 'operators',
    shape: 'boolean',
    label: '≥',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'op_lte',
    category: 'operators',
    shape: 'boolean',
    label: '≤',
    defaults: {},
    inputKeys: ['a', 'b'],
  },
  {
    kind: 'set_var',
    category: 'vars',
    shape: 'stack',
    label: 'ustaw',
    defaults: {},
    inputKeys: ['var', 'value'],
  },
  {
    kind: 'change_var',
    category: 'vars',
    shape: 'stack',
    label: 'zmień o',
    defaults: {},
    inputKeys: ['var', 'value'],
  },
];

/** Osobne wpisy urządzeń w palecie (ten sam kind, różne defaults). */
export type ScratchPaletteItem = {
  id: string;
  kind: ScratchKind;
  category: ScratchCategory;
  shape: ScratchShape;
  label: string;
  disabled?: boolean;
  defaults: ScratchFields;
};

export function buildPaletteItems(): ScratchPaletteItem[] {
  const items: ScratchPaletteItem[] = [];
  for (const def of SCRATCH_CATALOG) {
    if (def.kind === 'device_ref') {
      for (const d of SCRATCH_DEVICES) {
        items.push({
          id: `device:${d.id}`,
          kind: 'device_ref',
          category: 'components',
          shape: 'reporter',
          label: d.label,
          defaults: { device: d.id },
        });
      }
      continue;
    }
    items.push({
      id: def.kind,
      kind: def.kind,
      category: def.category,
      shape: def.shape,
      label: def.label,
      disabled: def.disabled,
      defaults: def.defaults,
    });
  }
  return items;
}

export const SCRATCH_CATEGORIES: {
  id: ScratchCategory;
  label: string;
  hint: string;
}[] = [
  { id: 'control', label: 'Sterowanie', hint: 'Pętle, czekaj, jeśli' },
  { id: 'motion', label: 'Ruch', hint: 'Jazda i skręty' },
  { id: 'sound', label: 'Dźwięk', hint: 'Odtwarzanie na Pi' },
  { id: 'components', label: 'Komponenty', hint: 'Kamera, lidar, mic…' },
  { id: 'operators', label: 'Operatory', hint: 'Liczby i porównania' },
  { id: 'vars', label: 'Zmienne', hint: 'Jak moje bloki' },
  { id: 'myblocks', label: 'Moje bloki', hint: 'Własne procedury' },
];

export function newScratchId(prefix = 'n'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function scratchDef(kind: ScratchKind): ScratchBlockDef | undefined {
  return SCRATCH_CATALOG.find((d) => d.kind === kind);
}

export function nodeAcceptKind(kind: ScratchKind): ScratchSlotAccept {
  const def = scratchDef(kind);
  if (def?.shape === 'boolean') return 'boolean';
  if (def?.shape === 'reporter') return 'reporter';
  if (kind === 'var_reporter') return 'reporter';
  return 'stack';
}

export function slotAccepts(accept: ScratchSlotAccept, nodeKind: ScratchKind): boolean {
  const got = nodeAcceptKind(nodeKind);
  if (accept === 'stack') return got === 'stack';
  if (accept === 'boolean') return got === 'boolean' || got === 'reporter';
  return got === 'reporter' || got === 'boolean';
}

export function categoryColor(kind: ScratchKind, procedures: ScratchProcedure[] = []): string {
  if (kind === 'start' || kind === 'end') return '#FFBF00';
  if (kind === 'define_proc' || kind === 'call_proc') return SCRATCH_COLORS.myblocks;
  if (kind === 'var_reporter') return SCRATCH_COLORS.vars;
  const def = scratchDef(kind);
  if (def) return SCRATCH_COLORS[def.category];
  if (procedures.some((p) => p.id === kind)) return SCRATCH_COLORS.myblocks;
  return '#888';
}

export function createInitialScript(): ScratchNode[] {
  return [
    { id: 'start', kind: 'start', fields: {}, children: [] },
    { id: 'end', kind: 'end', fields: {} },
  ];
}

export function createEmptyProgram(): ScratchProgram {
  return {
    script: createInitialScript(),
    scriptPos: { x: 120, y: 80 },
    procedures: [],
    variables: [],
  };
}

export function addVariable(program: ScratchProgram, name: string): ScratchProgram {
  const next = cloneProgram(program);
  const n = next.variables.length;
  const base = name.trim() || `zmienna${n + 1}`;
  let final = base;
  let i = 2;
  while (next.variables.some((v) => v.name === final)) {
    final = `${base}${i++}`;
  }
  next.variables.push({ id: newScratchId('v'), name: final, value: 0 });
  return next;
}

export function renameVariable(program: ScratchProgram, varId: string, name: string): ScratchProgram {
  const next = cloneProgram(program);
  const v = next.variables.find((x) => x.id === varId);
  if (!v) return program;
  const trimmed = name.trim() || v.name;
  v.name = trimmed;
  const patch = (nodes: ScratchNode[]) => {
    for (const n of nodes) {
      if (n.kind === 'var_reporter' && n.fields.varId === varId) n.fields.varName = trimmed;
      if (n.children) patch(n.children);
      if (n.elseChildren) patch(n.elseChildren);
      if (n.inputs) {
        for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
          const child = n.inputs[key];
          if (child) patch([child]);
        }
      }
    }
  };
  patch(next.script);
  for (const p of next.procedures) patch(p.children);
  return next;
}

export function removeVariable(program: ScratchProgram, varId: string): ScratchProgram {
  const next = cloneProgram(program);
  next.variables = next.variables.filter((v) => v.id !== varId);
  const strip = (nodes: ScratchNode[]): ScratchNode[] => {
    const out: ScratchNode[] = [];
    for (const n of nodes) {
      if (n.kind === 'var_reporter' && n.fields.varId === varId) continue;
      if (n.children) n.children = strip(n.children);
      if (n.elseChildren) n.elseChildren = strip(n.elseChildren);
      if (n.inputs) {
        for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
          const child = n.inputs[key];
          if (child) {
            if (child.kind === 'var_reporter' && child.fields.varId === varId) {
              n.inputs[key] = null;
            } else {
              const [kept] = strip([child]);
              n.inputs[key] = kept || null;
            }
          }
        }
      }
      out.push(n);
    }
    return out;
  };
  const start = next.script.find((n) => n.kind === 'start');
  if (start?.children) start.children = strip(start.children);
  for (const p of next.procedures) p.children = strip(p.children);
  return next;
}

export function ensureVariable(program: ScratchProgram, name: string, _value = 0): ScratchProgram {
  const n = name.trim() || 'zmienna';
  if (program.variables.some((v) => v.name === n)) return program;
  return addVariable(program, n);
}

export function makeNode(kind: ScratchKind, fields?: ScratchFields): ScratchNode {
  const def = scratchDef(kind);
  const base: ScratchNode = {
    id: newScratchId(),
    kind,
    fields: { ...(def?.defaults || {}), ...fields },
  };
  if (def?.shape === 'c' || def?.shape === 'c_if' || kind === 'define_proc') {
    base.children = [];
  }
  if (def?.shape === 'c_if') {
    base.elseChildren = [];
  }
  if (def?.inputKeys?.length) {
    base.inputs = {};
    for (const k of def.inputKeys) base.inputs[k] = null;
  }
  return base;
}

export function makePaletteNode(item: ScratchPaletteItem): ScratchNode {
  return makeNode(item.kind, item.defaults);
}

export function makeVarReporter(variable: ScratchVariable): ScratchNode {
  return {
    id: newScratchId(),
    kind: 'var_reporter',
    fields: { varId: variable.id, varName: variable.name },
  };
}

function walkFind(nodes: ScratchNode[], id: string): ScratchNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const c = walkFind(n.children, id);
      if (c) return c;
    }
    if (n.elseChildren) {
      const e = walkFind(n.elseChildren, id);
      if (e) return e;
    }
    if (n.inputs) {
      for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
        const child = n.inputs[key];
        if (!child) continue;
        if (child.id === id) return child;
        const d = walkFind([child], id);
        if (d) return d;
      }
    }
  }
  return null;
}

export function findNode(program: ScratchProgram, id: string): ScratchNode | null {
  const inScript = walkFind(program.script, id);
  if (inScript) return inScript;
  for (const proc of program.procedures) {
    const inBody = walkFind(proc.children, id);
    if (inBody) return inBody;
  }
  return null;
}

export type InsertTarget = {
  parentId: string;
  branch: 'children' | 'elseChildren' | 'input';
  index: number;
  inputKey?: ScratchInputKey;
  accept?: ScratchSlotAccept;
};

export function insertInto(
  program: ScratchProgram,
  parentId: string,
  branch: 'children' | 'elseChildren',
  index: number,
  node: ScratchNode,
): ScratchProgram {
  const next = cloneProgram(program);
  const target = locateMutable(next, parentId);
  if (!target) return program;
  const list =
    branch === 'elseChildren'
      ? (target.elseChildren ?? (target.elseChildren = []))
      : (target.children ?? (target.children = []));
  const i = Math.max(0, Math.min(index, list.length));
  list.splice(i, 0, node);
  return next;
}

export function setInput(
  program: ScratchProgram,
  parentId: string,
  inputKey: ScratchInputKey,
  node: ScratchNode | null,
): ScratchProgram {
  const next = cloneProgram(program);
  const target = locateMutable(next, parentId);
  if (!target) return program;
  if (!target.inputs) target.inputs = {};
  target.inputs[inputKey] = node;
  return next;
}

export function removeNode(program: ScratchProgram, id: string): ScratchProgram {
  if (id === 'start' || id === 'end') return program;
  const next = cloneProgram(program);
  if (removeFromList(next.script, id)) return next;
  for (const proc of next.procedures) {
    if (removeFromList(proc.children, id)) return next;
  }
  return program;
}

export function extractNode(
  program: ScratchProgram,
  id: string,
): { program: ScratchProgram; node: ScratchNode } | null {
  if (id === 'start' || id === 'end') return null;
  const next = cloneProgram(program);
  const pulled = pullFromList(next.script, id);
  if (pulled) return { program: next, node: pulled };
  for (const proc of next.procedures) {
    const p = pullFromList(proc.children, id);
    if (p) return { program: next, node: p };
  }
  return null;
}

function pullFromList(nodes: ScratchNode[], id: string): ScratchNode | null {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    const [n] = nodes.splice(idx, 1);
    return n;
  }
  for (const n of nodes) {
    if (n.children) {
      const c = pullFromList(n.children, id);
      if (c) return c;
    }
    if (n.elseChildren) {
      const e = pullFromList(n.elseChildren, id);
      if (e) return e;
    }
    if (n.inputs) {
      for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
        const child = n.inputs[key];
        if (!child) continue;
        if (child.id === id) {
          n.inputs[key] = null;
          return child;
        }
        const deeper = pullFromList([child], id);
        if (deeper) return deeper;
      }
    }
  }
  return null;
}

export function moveNode(
  program: ScratchProgram,
  nodeId: string,
  target: InsertTarget,
): ScratchProgram {
  const extracted = extractNode(program, nodeId);
  if (!extracted) return program;
  let idx = target.index;
  const oldLoc = findLocation(program, nodeId);
  if (
    oldLoc &&
    oldLoc.parentId === target.parentId &&
    oldLoc.branch === target.branch &&
    oldLoc.inputKey === target.inputKey &&
    oldLoc.branch !== 'input' &&
    oldLoc.index < target.index
  ) {
    idx = Math.max(0, target.index - 1);
  }
  return applyInsert(extracted.program, { ...target, index: idx }, extracted.node);
}

function findLocation(program: ScratchProgram, id: string): InsertTarget | null {
  const search = (
    nodes: ScratchNode[],
    parentId: string,
    branch: 'children' | 'elseChildren',
  ): InsertTarget | null => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return { parentId, branch, index: i };
      const n = nodes[i];
      if (n.children) {
        const hit = search(n.children, n.id, 'children');
        if (hit) return hit;
      }
      if (n.elseChildren) {
        const hit = search(n.elseChildren, n.id, 'elseChildren');
        if (hit) return hit;
      }
      if (n.inputs) {
        for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
          const child = n.inputs[key];
          if (!child) continue;
          if (child.id === id) {
            return { parentId: n.id, branch: 'input', index: 0, inputKey: key };
          }
          const hit = search([child], child.id, 'children');
          if (hit) return hit;
        }
      }
    }
    return null;
  };
  const start = program.script.find((n) => n.kind === 'start');
  if (start?.children) {
    const hit = search(start.children, 'start', 'children');
    if (hit) return hit;
  }
  for (const proc of program.procedures) {
    const hit = search(proc.children, `proc-body:${proc.id}`, 'children');
    if (hit) return hit;
  }
  return null;
}

function removeFromList(nodes: ScratchNode[], id: string): boolean {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    nodes.splice(idx, 1);
    return true;
  }
  for (const n of nodes) {
    if (n.children && removeFromList(n.children, id)) return true;
    if (n.elseChildren && removeFromList(n.elseChildren, id)) return true;
    if (n.inputs) {
      for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
        const child = n.inputs[key];
        if (!child) continue;
        if (child.id === id) {
          n.inputs[key] = null;
          return true;
        }
        if (removeFromList([child], id)) return true;
      }
    }
  }
  return false;
}

function locateMutable(program: ScratchProgram, parentId: string): ScratchNode | null {
  if (parentId.startsWith('proc-body:')) {
    const procId = parentId.slice('proc-body:'.length);
    const proc = program.procedures.find((p) => p.id === procId);
    if (!proc) return null;
    return { id: parentId, kind: 'define_proc', fields: {}, children: proc.children };
  }
  return (
    walkFind(program.script, parentId) ||
    program.procedures.reduce<ScratchNode | null>(
      (acc, proc) => acc || walkFind(proc.children, parentId),
      null,
    )
  );
}

export function insertIntoProc(
  program: ScratchProgram,
  procId: string,
  index: number,
  node: ScratchNode,
): ScratchProgram {
  const next = cloneProgram(program);
  const proc = next.procedures.find((p) => p.id === procId);
  if (!proc) return program;
  const i = Math.max(0, Math.min(index, proc.children.length));
  proc.children.splice(i, 0, node);
  return next;
}

export function updateNodeFields(
  program: ScratchProgram,
  id: string,
  patch: ScratchFields,
): ScratchProgram {
  const next = cloneProgram(program);
  const node = findNodeMutable(next, id);
  if (!node) return program;
  node.fields = { ...node.fields, ...patch };
  return next;
}

function findNodeMutable(program: ScratchProgram, id: string): ScratchNode | null {
  const walk = (nodes: ScratchNode[]): ScratchNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const c = walk(n.children);
        if (c) return c;
      }
      if (n.elseChildren) {
        const e = walk(n.elseChildren);
        if (e) return e;
      }
      if (n.inputs) {
        for (const key of Object.keys(n.inputs) as ScratchInputKey[]) {
          const child = n.inputs[key];
          if (!child) continue;
          if (child.id === id) return child;
          const d = walk([child]);
          if (d) return d;
        }
      }
    }
    return null;
  };
  const s = walk(program.script);
  if (s) return s;
  for (const proc of program.procedures) {
    const p = walk(proc.children);
    if (p) return p;
  }
  return null;
}

export function addProcedure(program: ScratchProgram, name: string): ScratchProgram {
  const next = cloneProgram(program);
  const id = newScratchId('proc');
  const n = next.procedures.length;
  next.procedures.push({
    id,
    name: name.trim() || `Blok ${n + 1}`,
    children: [],
    x: 120 + (n % 3) * 200,
    y: 280 + Math.floor(n / 3) * 160,
  });
  return next;
}

export function setScriptPos(
  program: ScratchProgram,
  pos: { x: number; y: number },
): ScratchProgram {
  const next = cloneProgram(program);
  next.scriptPos = pos;
  return next;
}

export function setProcedurePos(
  program: ScratchProgram,
  procId: string,
  pos: { x: number; y: number },
): ScratchProgram {
  const next = cloneProgram(program);
  const proc = next.procedures.find((p) => p.id === procId);
  if (!proc) return program;
  proc.x = pos.x;
  proc.y = pos.y;
  return next;
}

export function renameProcedure(program: ScratchProgram, procId: string, name: string): ScratchProgram {
  const next = cloneProgram(program);
  const proc = next.procedures.find((p) => p.id === procId);
  if (!proc) return program;
  proc.name = name.trim() || proc.name;
  return next;
}

export function removeProcedure(program: ScratchProgram, procId: string): ScratchProgram {
  const next = cloneProgram(program);
  next.procedures = next.procedures.filter((p) => p.id !== procId);
  const strip = (nodes: ScratchNode[]) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].kind === 'call_proc' && nodes[i].fields.procId === procId) {
        nodes.splice(i, 1);
        continue;
      }
      if (nodes[i].children) strip(nodes[i].children!);
      if (nodes[i].elseChildren) strip(nodes[i].elseChildren!);
      if (nodes[i].inputs) {
        for (const key of Object.keys(nodes[i].inputs!) as ScratchInputKey[]) {
          const child = nodes[i].inputs![key];
          if (child) strip([child]);
        }
      }
    }
  };
  strip(next.script);
  for (const p of next.procedures) strip(p.children);
  return next;
}

export function cloneProgram(program: ScratchProgram): ScratchProgram {
  return JSON.parse(JSON.stringify(program)) as ScratchProgram;
}

function migrateNode(n: ScratchNode): ScratchNode {
  const legacyKind = n.kind as string;
  const node: ScratchNode = {
    ...n,
    kind: n.kind,
    fields: { ...n.fields },
    children: n.children?.map(migrateNode),
    elseChildren: n.elseChildren?.map(migrateNode),
    inputs: n.inputs
      ? (Object.fromEntries(
          Object.entries(n.inputs).map(([k, v]) => [k, v ? migrateNode(v) : null]),
        ) as ScratchInputs)
      : undefined,
  };
  if (legacyKind === 'set_device') {
    const device = node.fields.device || 'LIDAR';
    const on = node.fields.deviceOn !== false;
    node.kind = on ? 'device_turn_on' : 'device_turn_off';
    node.inputs = {
      device: {
        id: newScratchId(),
        kind: 'device_ref',
        fields: { device },
      },
    };
    delete node.fields.device;
    delete node.fields.deviceOn;
  }
  if (node.kind === 'if' || node.kind === 'while') {
    if (!node.inputs) node.inputs = { condition: null };
    else if (!('condition' in node.inputs)) node.inputs.condition = null;
  }
  if (node.kind === 'set_var' || node.kind === 'change_var') {
    if (!node.inputs) {
      node.inputs = { var: null, value: null };
      if (node.fields.varName) {
        node.inputs.var = {
          id: newScratchId(),
          kind: 'var_reporter',
          fields: { varName: node.fields.varName },
        };
      }
      if (node.fields.cmpValue != null) {
        node.inputs.value = {
          id: newScratchId(),
          kind: 'number',
          fields: { numberValue: node.fields.cmpValue },
        };
      }
    }
  }
  return node;
}

export function normalizeProgram(raw: unknown): ScratchProgram {
  const empty = createEmptyProgram();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Partial<ScratchProgram>;
  const script = Array.isArray(obj.script) ? obj.script : empty.script;
  const fixed = [...script];
  if (!fixed.some((n) => n.kind === 'start')) fixed.unshift(createInitialScript()[0]);
  if (!fixed.some((n) => n.kind === 'end')) fixed.push(createInitialScript()[1]);
  const start = fixed.find((n) => n.kind === 'start') || createInitialScript()[0];
  const end = fixed.find((n) => n.kind === 'end') || createInitialScript()[1];
  const mid = fixed.filter((n) => n.kind !== 'start' && n.kind !== 'end');
  if (!start.children) start.children = [];
  if (mid.length) {
    start.children = [...start.children, ...mid];
  }
  start.children = start.children.map(migrateNode);
  const procedures = (Array.isArray(obj.procedures) ? obj.procedures : []).map((p, i) => ({
    ...p,
    children: (Array.isArray(p.children) ? p.children : []).map(migrateNode),
    x: typeof p.x === 'number' ? p.x : 120 + (i % 3) * 200,
    y: typeof p.y === 'number' ? p.y : 280 + Math.floor(i / 3) * 160,
  }));
  const scriptPos =
    obj.scriptPos && typeof obj.scriptPos.x === 'number' && typeof obj.scriptPos.y === 'number'
      ? obj.scriptPos
      : empty.scriptPos;
  return {
    script: [start, end],
    scriptPos,
    procedures,
    variables: Array.isArray(obj.variables)
      ? obj.variables.map((v, i) => ({
          id: v.id || `v-${i}`,
          name: v.name || `zmienna${i + 1}`,
          value: Number.isFinite(v.value) ? Number(v.value) : 0,
        }))
      : [],
  };
}

export function defaultInsertTarget(program: ScratchProgram): InsertTarget {
  const start = program.script.find((n) => n.kind === 'start');
  const len = start?.children?.length ?? 0;
  return { parentId: 'start', branch: 'children', index: len, accept: 'stack' };
}

export function applyInsert(
  program: ScratchProgram,
  target: InsertTarget,
  node: ScratchNode,
): ScratchProgram {
  const accept = target.accept || (target.branch === 'input' ? 'reporter' : 'stack');
  if (!slotAccepts(accept, node.kind)) return program;

  if (target.branch === 'input' && target.inputKey) {
    return setInput(program, target.parentId, target.inputKey, node);
  }
  if (nodeAcceptKind(node.kind) !== 'stack') return program;
  if (target.parentId.startsWith('proc-body:')) {
    const procId = target.parentId.slice('proc-body:'.length);
    return insertIntoProc(program, procId, target.index, node);
  }
  const branch = target.branch === 'elseChildren' ? 'elseChildren' : 'children';
  return insertInto(program, target.parentId, branch, target.index, node);
}

export function inputSlotAccept(key: ScratchInputKey): ScratchSlotAccept {
  if (key === 'condition') return 'boolean';
  return 'reporter';
}

export function deviceLabel(id: ScratchDeviceId | undefined): string {
  return SCRATCH_DEVICES.find((d) => d.id === id)?.label || id || '?';
}
