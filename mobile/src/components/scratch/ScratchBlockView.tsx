import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  categoryColor,
  deviceLabel,
  inputSlotAccept,
  makeNode,
  scratchDef,
  type InsertTarget,
  type ScratchFields,
  type ScratchInputKey,
  type ScratchNode,
  type ScratchProcedure,
  type ScratchSlotAccept,
  type ScratchVariable,
} from '../../scratch/blocks';
import { FALLBACK_SOUNDS } from '../../protocol';
import { colors } from '../../theme';

export type SlotRect = {
  key: string;
  target: InsertTarget;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RegisterSlot = (
  rect: SlotRect | null,
  key: string,
  remeasure?: (done?: () => void) => void,
) => void;

export function slotKey(t: InsertTarget): string {
  if (t.branch === 'input') return `${t.parentId}|input|${t.inputKey}`;
  return `${t.parentId}|${t.branch}|${t.index}`;
}

type DragCbs = {
  onDragBlockStart: (nodeId: string, pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
};

type Props = {
  node: ScratchNode;
  procedures: ScratchProcedure[];
  variables: ScratchVariable[];
  hoverKey: string | null;
  draggingId: string | null;
  registerSlot: RegisterSlot;
  onRemove: (id: string) => void;
  onChangeFields: (id: string, patch: ScratchFields) => void;
  onSetInput: (parentId: string, key: ScratchInputKey, node: ScratchNode | null) => void;
} & DragCbs;

function Slot({
  target,
  hot,
  registerSlot,
  wide,
}: {
  target: InsertTarget;
  hot: boolean;
  registerSlot: RegisterSlot;
  wide?: boolean;
}) {
  const key = slotKey(target);
  const ref = useRef<View>(null);

  const measure = (done?: () => void) => {
    ref.current?.measureInWindow((x, y, w, h) => {
      registerSlot({ key, target, x, y, w, h }, key, measure);
      done?.();
    });
  };

  return (
    <View
      ref={ref}
      onLayout={() => measure()}
      collapsable={false}
      style={[styles.slot, wide && styles.slotWide, hot && styles.slotHot]}
    />
  );
}

function InputHole({
  parentId,
  inputKey,
  accept,
  child,
  hot,
  registerSlot,
  props,
  placeholder,
}: {
  parentId: string;
  inputKey: ScratchInputKey;
  accept: ScratchSlotAccept;
  child: ScratchNode | null | undefined;
  hot: boolean;
  registerSlot: RegisterSlot;
  props: Props;
  placeholder?: string;
}) {
  const target: InsertTarget = {
    parentId,
    branch: 'input',
    index: 0,
    inputKey,
    accept,
  };
  const key = slotKey(target);
  const ref = useRef<View>(null);
  const [draft, setDraft] = useState('');
  const allowType = inputKey === 'a' || inputKey === 'b' || inputKey === 'value';

  const measure = (done?: () => void) => {
    ref.current?.measureInWindow((x, y, w, h) => {
      registerSlot({ key, target, x, y, w: Math.max(w, 48), h: Math.max(h, 28) }, key, measure);
      done?.();
    });
  };

  const commitNumber = (raw: string) => {
    const cleaned = raw.trim().replace(',', '.');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
      setDraft('');
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
      setDraft('');
      return;
    }
    props.onSetInput(parentId, inputKey, makeNode('number', { numberValue: n }));
    setDraft('');
  };

  return (
    <View
      ref={ref}
      onLayout={() => measure()}
      collapsable={false}
      style={[styles.inputHoleWrap, hot && styles.inputHoleHot]}
    >
      {child ? (
        <View style={styles.inputFilled}>
          <ScratchBlockView {...props} node={child} />
        </View>
      ) : allowType ? (
        <TextInput
          value={draft}
          onChangeText={(t) => {
            if (/^-?\d*[.,]?\d*$/.test(t) || t === '') setDraft(t);
          }}
          onBlur={() => commitNumber(draft)}
          onSubmitEditing={() => commitNumber(draft)}
          placeholder={placeholder || '0'}
          placeholderTextColor="rgba(0,0,0,0.35)"
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={styles.holeInput}
        />
      ) : (
        <Text style={styles.holeHint}>{placeholder || '□'}</Text>
      )}
    </View>
  );
}

function FieldNum({
  label,
  value,
  onChange,
  min,
  max,
  decimals = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const cleaned = raw.trim().replace(',', '.');
    if (cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned === '-.') {
      setText(String(value));
      return;
    }
    let n = Number(cleaned);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    if (decimals > 0) {
      const f = 10 ** decimals;
      n = Math.round(n * f) / f;
    } else {
      n = Math.round(n);
    }
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
    setText(String(n));
  };

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          commit(text);
        }}
        onChangeText={(t) => {
          if (/^-?\d*[.,]?\d*$/.test(t) || t === '') setText(t);
        }}
        onSubmitEditing={() => commit(text)}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={styles.fieldInput}
      />
    </View>
  );
}

function useGripDrag(nodeId: string, cbs: DragCbs) {
  const idRef = useRef(nodeId);
  idRef.current = nodeId;
  const cbsRef = useRef(cbs);
  cbsRef.current = cbs;

  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        cbsRef.current.onDragBlockStart(
          idRef.current,
          e.nativeEvent.pageX,
          e.nativeEvent.pageY,
        );
      },
      onPanResponderMove: (e) =>
        cbsRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) =>
        cbsRef.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderTerminate: (e) =>
        cbsRef.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
    }),
  ).current;
}

export function ScratchBlockView(props: Props) {
  const {
    node,
    procedures,
    hoverKey,
    draggingId,
    registerSlot,
    onRemove,
    onChangeFields,
    onDragBlockStart,
    onDragMove,
    onDragEnd,
  } = props;
  const def = scratchDef(node.kind);
  const bg = categoryColor(node.kind, procedures);
  const canRemove = node.kind !== 'start' && node.kind !== 'end';
  const gripPan = useGripDrag(node.id, {
    onDragBlockStart,
    onDragMove,
    onDragEnd,
  });
  const dim = draggingId === node.id;
  const shape = def?.shape || (node.kind === 'var_reporter' ? 'reporter' : 'stack');
  const isReporter = shape === 'reporter' || shape === 'boolean';

  const title = (() => {
    if (node.kind === 'start') return 'Start';
    if (node.kind === 'end') return 'Koniec';
    if (node.kind === 'call_proc') {
      const p = procedures.find((x) => x.id === node.fields.procId);
      return p ? p.name : 'blok';
    }
    if (node.kind === 'var_reporter') return node.fields.varName || 'zmienna';
    if (node.kind === 'device_ref') return deviceLabel(node.fields.device);
    return def?.label || node.kind;
  })();

  const renderKids = (
    parentId: string,
    branch: 'children' | 'elseChildren',
    kids: ScratchNode[],
  ) => (
    <View style={styles.nest}>
      {kids.map((child, i) => (
        <View key={child.id}>
          <Slot
            target={{ parentId, branch, index: i, accept: 'stack' }}
            hot={hoverKey === slotKey({ parentId, branch, index: i })}
            registerSlot={registerSlot}
          />
          <ScratchBlockView {...props} node={child} />
        </View>
      ))}
      <Slot
        target={{ parentId, branch, index: kids.length, accept: 'stack' }}
        hot={hoverKey === slotKey({ parentId, branch, index: kids.length })}
        registerSlot={registerSlot}
      />
    </View>
  );

  const hole = (key: ScratchInputKey, placeholder?: string) => (
    <InputHole
      parentId={node.id}
      inputKey={key}
      accept={inputSlotAccept(key)}
      child={node.inputs?.[key]}
      hot={hoverKey === slotKey({ parentId: node.id, branch: 'input', index: 0, inputKey: key })}
      registerSlot={registerSlot}
      props={props}
      placeholder={placeholder}
    />
  );

  if (node.kind === 'end') return null;

  if (node.kind === 'start') {
    return (
      <View style={styles.column}>
        <View style={[styles.block, styles.hat, { backgroundColor: bg }]}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.cShell}>
          <View style={[styles.railBar, { backgroundColor: bg }]} />
          <View style={styles.cInner}>{renderKids('start', 'children', node.children || [])}</View>
        </View>
        <View style={[styles.block, styles.footCap, { backgroundColor: bg }]}>
          <Text style={styles.title}>Koniec</Text>
        </View>
      </View>
    );
  }

  // Reporter / boolean — kompaktowy owal
  if (isReporter) {
    const isBool = shape === 'boolean';
    return (
      <View style={[styles.reporterWrap, dim && styles.dim]}>
        <View
          style={[
            styles.reporter,
            isBool ? styles.boolean : styles.oval,
            { backgroundColor: bg },
          ]}
        >
          <View {...gripPan.panHandlers} style={styles.gripHit} hitSlop={6}>
            <Text style={styles.grip}>⠿</Text>
          </View>
          {node.kind === 'number' ? (
            <FieldNum
              label=""
              value={node.fields.numberValue ?? 0}
              decimals={0}
              onChange={(n) => onChangeFields(node.id, { numberValue: n })}
            />
          ) : node.kind.startsWith('op_') ? (
            <View style={styles.opRow}>
              {hole('a')}
              <Text style={styles.opSign}>{title}</Text>
              {hole('b')}
            </View>
          ) : node.kind === 'device_is_on' || node.kind === 'device_is_off' ? (
            <View style={styles.opRow}>
              <Text style={styles.title}>{title}</Text>
              {hole('device', '…')}
            </View>
          ) : (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
          {canRemove ? (
            <Pressable onPress={() => onRemove(node.id)} hitSlop={8}>
              <Text style={styles.x}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const isC = def?.shape === 'c' || def?.shape === 'c_if';
  const isIf = def?.shape === 'c_if';

  return (
    <View style={[styles.column, dim && styles.dim]}>
      <View
        style={[
          styles.block,
          isC ? styles.stackCHead : styles.stack,
          { backgroundColor: bg },
        ]}
      >
        <View style={styles.headRow}>
          {canRemove ? (
            <View {...gripPan.panHandlers} style={styles.gripHit} hitSlop={8}>
              <Text style={styles.grip}>⠿</Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {canRemove ? (
            <Pressable onPress={() => onRemove(node.id)} hitSlop={10}>
              <Text style={styles.x}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.fields}>
          {node.kind === 'if' || node.kind === 'while' ? hole('condition', 'warunek') : null}

          {node.kind === 'device_turn_on' || node.kind === 'device_turn_off'
            ? hole('device', 'komponent')
            : null}

          {node.kind === 'set_var' || node.kind === 'change_var' ? (
            <>
              {hole('var', 'zmienna')}
              {node.kind === 'set_var' ? <Text style={styles.inlineEq}>=</Text> : null}
              {hole('value', 'wartość')}
            </>
          ) : null}

          {node.kind === 'repeat' ? (
            <FieldNum
              label="×"
              value={node.fields.times ?? 3}
              min={1}
              decimals={0}
              onChange={(n) => onChangeFields(node.id, { times: n })}
            />
          ) : null}
          {node.kind === 'wait' ||
          node.kind === 'move_forward' ||
          node.kind === 'move_back' ||
          node.kind === 'turn_left' ||
          node.kind === 'turn_right' ? (
            <FieldNum
              label="s"
              value={node.fields.sec ?? 1}
              min={0.1}
              decimals={1}
              onChange={(n) => onChangeFields(node.id, { sec: n })}
            />
          ) : null}
          {node.kind === 'move_forward' ||
          node.kind === 'move_back' ||
          node.kind === 'turn_left' ||
          node.kind === 'turn_right' ? (
            <FieldNum
              label="%"
              value={node.fields.powerPct ?? 35}
              min={5}
              max={100}
              decimals={0}
              onChange={(n) => onChangeFields(node.id, { powerPct: n })}
            />
          ) : null}
        </View>

        {node.kind === 'play_sound' ? (
          <View style={styles.soundWrap}>
            {FALLBACK_SOUNDS.map((s) => {
              const on = (node.fields.sound || FALLBACK_SOUNDS[0]) === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => onChangeFields(node.id, { sound: s })}
                  style={[styles.soundChip, on && styles.soundChipOn]}
                >
                  <Text style={[styles.soundText, on && styles.soundTextOn]} numberOfLines={1}>
                    {s.replace(/\.(mp3|wav)$/i, '').slice(0, 10)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {isC && !isIf ? (
        <>
          <View style={styles.cShell}>
            <View style={[styles.railBar, { backgroundColor: bg }]} />
            <View style={styles.cInner}>{renderKids(node.id, 'children', node.children || [])}</View>
          </View>
          <View style={[styles.foot, { backgroundColor: bg }]} />
        </>
      ) : null}

      {isIf ? (
        <>
          <View style={styles.cShell}>
            <View style={[styles.railBar, { backgroundColor: bg }]} />
            <View style={styles.cInner}>{renderKids(node.id, 'children', node.children || [])}</View>
          </View>
          <View style={[styles.elseBar, { backgroundColor: bg }]}>
            <Text style={styles.title}>Inaczej</Text>
          </View>
          <View style={styles.cShell}>
            <View style={[styles.railBar, { backgroundColor: bg }]} />
            <View style={styles.cInner}>
              {renderKids(node.id, 'elseChildren', node.elseChildren || [])}
            </View>
          </View>
          <View style={[styles.foot, { backgroundColor: bg }]} />
        </>
      ) : null}
    </View>
  );
}

export function ScratchProcBody({
  proc,
  onRename,
  ...rest
}: {
  proc: ScratchProcedure;
  onRename: (name: string) => void;
} & Omit<Props, 'node'>) {
  const parentId = `proc-body:${proc.id}`;
  const bg = '#FF6680';
  return (
    <View style={styles.column}>
      <View style={[styles.block, styles.hat, { backgroundColor: bg }]}>
        <Text style={styles.defineLabel}>Zdefiniuj</Text>
        <TextInput
          value={proc.name}
          onChangeText={onRename}
          style={styles.procName}
          placeholder="Nazwa"
          placeholderTextColor="rgba(255,255,255,0.55)"
        />
      </View>
      <View style={styles.cShell}>
        <View style={[styles.railBar, { backgroundColor: bg }]} />
        <View style={styles.cInner}>
          {proc.children.map((child, i) => (
            <View key={child.id}>
              <Slot
                target={{ parentId, branch: 'children', index: i, accept: 'stack' }}
                hot={rest.hoverKey === slotKey({ parentId, branch: 'children', index: i })}
                registerSlot={rest.registerSlot}
              />
              <ScratchBlockView {...rest} node={child} />
            </View>
          ))}
          <Slot
            target={{ parentId, branch: 'children', index: proc.children.length, accept: 'stack' }}
            hot={
              rest.hoverKey ===
              slotKey({ parentId, branch: 'children', index: proc.children.length })
            }
            registerSlot={rest.registerSlot}
          />
        </View>
      </View>
      <View style={[styles.foot, { backgroundColor: bg }]} />
    </View>
  );
}

const R = 7;

const styles = StyleSheet.create({
  column: { alignSelf: 'flex-start', maxWidth: 280 },
  block: {
    alignSelf: 'stretch',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  hat: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: R,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    minWidth: 118,
  },
  stack: { borderRadius: R, minWidth: 118 },
  stackCHead: {
    borderTopLeftRadius: R,
    borderTopRightRadius: R,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    minWidth: 118,
  },
  cShell: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: -2,
    marginBottom: -2,
  },
  railBar: {
    width: 10,
    alignSelf: 'stretch',
    minHeight: 12,
  },
  cInner: {
    flexShrink: 1,
    paddingLeft: 4,
    paddingVertical: 2,
    minWidth: 84,
  },
  foot: {
    alignSelf: 'stretch',
    height: 10,
    borderBottomLeftRadius: R,
    borderBottomRightRadius: R,
  },
  footCap: {
    alignSelf: 'stretch',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: R,
    minWidth: 118,
    paddingVertical: 6,
  },
  elseBar: {
    alignSelf: 'stretch',
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  nest: {},
  dim: { opacity: 0.3 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gripHit: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginRight: 2,
  },
  grip: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '900' },
  title: { color: '#fff', fontWeight: '800', fontSize: 12, flexShrink: 1 },
  x: { color: '#fff', fontWeight: '900', fontSize: 12, paddingLeft: 2 },
  slot: {
    height: 10,
    marginVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.2)',
    backgroundColor: 'rgba(255,255,255,0.4)',
    minWidth: 72,
  },
  slotWide: {
    minWidth: 56,
    minHeight: 22,
    height: 22,
    borderRadius: 8,
  },
  slotHot: {
    height: 18,
    borderColor: '#2E8B57',
    backgroundColor: 'rgba(46,139,87,0.45)',
    borderStyle: 'solid',
  },
  inputHoleWrap: {
    position: 'relative',
    minWidth: 52,
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.28)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  inputHoleHot: {
    borderColor: '#2E8B57',
    backgroundColor: 'rgba(46,139,87,0.4)',
    borderStyle: 'solid',
    minHeight: 34,
  },
  holeInput: {
    minWidth: 44,
    paddingHorizontal: 4,
    paddingVertical: 2,
    color: colors.ink,
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  holeHint: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  inputFilled: { maxWidth: 220 },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  fieldLabel: { color: '#fff', fontWeight: '700', fontSize: 11 },
  fieldInput: {
    minWidth: 32,
    backgroundColor: '#fff',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    color: colors.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  inlineEq: { color: '#fff', fontWeight: '900', fontSize: 14, paddingHorizontal: 2 },
  reporterWrap: { alignSelf: 'flex-start', maxWidth: 300 },
  reporter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 300,
  },
  oval: { borderRadius: 14 },
  boolean: {
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', flexShrink: 1 },
  opSign: { color: '#fff', fontWeight: '900', fontSize: 14, paddingHorizontal: 2 },
  soundWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3, maxWidth: 220 },
  soundChip: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  soundChipOn: { backgroundColor: '#fff' },
  soundText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  soundTextOn: { color: '#CF63CF' },
  defineLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '700' },
  procName: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    marginTop: 0,
    padding: 0,
    minWidth: 88,
  },
});
