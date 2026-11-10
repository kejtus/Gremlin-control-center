import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAccessibility, a11yFont } from '../accessibility';
import {
  DEFAULT_PAD_BINDINGS,
  PAD_BUTTONS,
  actionById,
  buildPadActions,
  buildPadSyncPackets,
  packetsForPadAction,
  type PadAction,
  type PadBindings,
  type PadButtonId,
  type RobotPacket,
} from '../gamepadBindings';
import { loadPadBindings, savePadBindings } from '../storage';
import { colors, radii } from '../theme';

type Props = {
  /** Wysyła pakiety JSON na Pi przez otwarty WebSocket. */
  onSendPackets: (packets: RobotPacket[]) => boolean;
  online: boolean;
};

export function GamepadTab({ onSendPackets, online }: Props) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const catalog = useMemo(() => buildPadActions(), []);
  const [bindings, setBindings] = useState<PadBindings>({ ...DEFAULT_PAD_BINDINGS });
  const [picking, setPicking] = useState<PadButtonId | null>(null);
  const [flash, setFlash] = useState<PadButtonId | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const padW = Math.min(width - 28, 360);
  const padH = Math.round(padW * 0.62);

  const syncConfigToPi = (next: PadBindings) => {
    if (!online) return false;
    return onSendPackets(buildPadSyncPackets(next, catalog));
  };

  useEffect(() => {
    let cancelled = false;
    void loadPadBindings().then((b) => {
      if (cancelled) return;
      setBindings(b);
      if (online) {
        onSendPackets(buildPadSyncPackets(b, catalog));
        setStatus('pad_config + keymap.json → Pi');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [online, catalog, onSendPackets]);

  const fire = (button: PadButtonId, action: PadAction) => {
    if (action.kind === 'none') {
      setStatus(`${button.toUpperCase()}: brak funkcji — przytrzymaj, żeby przypisać`);
      return;
    }

    const packets = packetsForPadAction(action);
    if (!packets.length) {
      setStatus('Nie udało się zbudować komendy');
      return;
    }

    if (!online) {
      setStatus('Brak połączenia z Pi — najpierw połącz robota');
      return;
    }

    const ok = onSendPackets(packets);
    if (!ok) {
      setStatus('WS zamknięty — połącz ponownie z Pi');
      return;
    }

    const summary =
      action.kind === 'sound'
        ? `▶ play_sound → ${packets[0].file}`
        : action.kind === 'stop'
          ? '■ stop_sound + stop → Pi'
          : `→ Pi: ${action.label}`;
    setStatus(`${button.toUpperCase()}: ${summary}`);

    if (action.kind === 'move') {
      setTimeout(() => {
        onSendPackets(
          packetsForPadAction({ id: 'stop', kind: 'stop', label: 'STOP' }).filter((p) => p.type === 'motor'),
        );
      }, 400);
    }
  };

  const setBinding = (btn: PadButtonId, actionId: string) => {
    const action = actionById(actionId === 'none' ? undefined : actionId, catalog);
    setBindings((prev) => {
      const next = { ...prev, [btn]: actionId === 'none' ? undefined : actionId };
      void savePadBindings(next);
      const synced = syncConfigToPi(next);
      if (synced) setStatus(`pad_config + keymap.json → Pi (zmiana ${btn.toUpperCase()})`);
      return next;
    });
    setPicking(null);
    if (action.kind !== 'none') fire(btn, action);
  };

  const onFacePress = (id: PadButtonId) => {
    setFlash(id);
    setTimeout(() => setFlash(null), 180);
    fire(id, actionById(bindings[id], catalog));
  };

  const onFaceLongPress = (id: PadButtonId) => {
    setPicking(id);
  };

  const labelFor = (id: PadButtonId) => {
    const a = actionById(bindings[id], catalog);
    if (a.kind === 'none') return 'przypisz…';
    return a.label.replace(/^(Dźwięk|Taniec|Ruch):\s*/i, '');
  };

  const pickingLabel = picking ? PAD_BUTTONS.find((b) => b.id === picking)?.label ?? picking : '';

  return (
    <ScrollView contentContainerStyle={styles.wrap} bounces={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Genesis Mangan PV58</Text>
      <Text style={styles.hint}>
        Klik przycisku = komenda na Pi (np. play_sound). Przytrzymaj A/B/X/Y = wybór funkcji.
      </Text>
      <Text style={[styles.linkState, !online && styles.linkOff]}>
        {online ? 'Połączenie: WS → Pi' : 'Połączenie: brak'}
      </Text>
      {status ? <Text style={styles.statusLine}>{status}</Text> : null}

      <View style={[styles.pad, { width: padW, height: padH }]}>
        <View style={[styles.grip, styles.gripL]} pointerEvents="none" />
        <View style={[styles.grip, styles.gripR]} pointerEvents="none" />

        <View style={styles.body}>
          <View style={styles.shoulderRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Przycisk LT"
              accessibilityHint="Krótko: komenda. Przytrzymaj: zmiana przypisania."
              onPress={() => onFacePress('lt')}
              onLongPress={() => onFaceLongPress('lt')}
              style={[styles.shoulder, flash === 'lt' && styles.flash]}
            >
              <Text style={styles.shoulderText}>LT</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Przycisk RT"
              accessibilityHint="Krótko: komenda. Przytrzymaj: zmiana przypisania."
              onPress={() => onFacePress('rt')}
              onLongPress={() => onFaceLongPress('rt')}
              style={[styles.shoulder, flash === 'rt' && styles.flash]}
            >
              <Text style={styles.shoulderText}>RT</Text>
            </Pressable>
          </View>
          <View style={styles.shoulderRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Przycisk LB"
              onPress={() => onFacePress('lb')}
              onLongPress={() => onFaceLongPress('lb')}
              style={[styles.bumper, flash === 'lb' && styles.flash]}
            >
              <Text style={styles.shoulderText}>LB</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Przycisk RB"
              onPress={() => onFacePress('rb')}
              onLongPress={() => onFaceLongPress('rb')}
              style={[styles.bumper, flash === 'rb' && styles.flash]}
            >
              <Text style={styles.shoulderText}>RB</Text>
            </Pressable>
          </View>

          <View style={styles.mainRow}>
            <View style={styles.leftCluster} pointerEvents="none">
              <View style={styles.stickOuter}>
                <View style={styles.stickInner} />
              </View>
              <View style={styles.dpad}>
                <View style={[styles.dpadArm, styles.dpadV]} />
                <View style={[styles.dpadArm, styles.dpadH]} />
              </View>
            </View>

            <View style={styles.midCluster}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Przycisk Select"
                onPress={() => onFacePress('select')}
                onLongPress={() => onFaceLongPress('select')}
                style={[styles.pill, flash === 'select' && styles.flash]}
              >
                <Text style={styles.pillText}>◉</Text>
              </Pressable>
              <Text style={styles.brandTiny} accessibilityElementsHidden>
                PV58
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Przycisk Start"
                onPress={() => onFacePress('start')}
                onLongPress={() => onFaceLongPress('start')}
                style={[styles.pill, flash === 'start' && styles.flash]}
              >
                <Text style={styles.pillText}>☰</Text>
              </Pressable>
            </View>

            <View style={styles.faceCluster}>
              <View style={styles.stickOuterSmall} pointerEvents="none">
                <View style={styles.stickInnerSmall} />
              </View>
              <FaceBtn id="y" label="Y" color="#e6c84a" style={styles.faceY} active={flash === 'y'} onPress={onFacePress} onLongPress={onFaceLongPress} />
              <FaceBtn id="x" label="X" color="#4aa3e6" style={styles.faceX} active={flash === 'x'} onPress={onFacePress} onLongPress={onFaceLongPress} />
              <FaceBtn id="b" label="B" color="#e65a4a" style={styles.faceB} active={flash === 'b'} onPress={onFacePress} onLongPress={onFaceLongPress} />
              <FaceBtn id="a" label="A" color="#4ae68a" style={styles.faceA} active={flash === 'a'} onPress={onFacePress} onLongPress={onFaceLongPress} />
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.section}>Przypisania · klik kolor = play, „zmień” = lista</Text>
      <View style={styles.bindList}>
        {(['y', 'x', 'b', 'a'] as PadButtonId[]).map((id) => {
          const meta = PAD_BUTTONS.find((b) => b.id === id)!;
          return (
            <View key={id} style={styles.bindRow}>
              <Pressable onPress={() => onFacePress(id)} style={[styles.bindDot, { backgroundColor: meta.color }]} hitSlop={8}>
                <Text style={styles.bindDotText}>{meta.label}</Text>
              </Pressable>
              <Pressable onPress={() => setPicking(id)} style={{ flex: 1 }}>
                <Text style={styles.bindLabel} numberOfLines={1}>
                  {labelFor(id)}
                </Text>
              </Pressable>
              <Pressable onPress={() => setPicking(id)} hitSlop={8}>
                <Text style={styles.bindEdit}>zmień</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <Modal visible={picking != null} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.modalBg} onPress={() => setPicking(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Przycisk {pickingLabel}</Text>
            <Text style={styles.modalSub}>Po wyborze od razu wyśle komendę na Pi</Text>
            <ScrollView style={styles.modalScroll} bounces={false}>
              {catalog.map((action) => {
                const on =
                  picking != null &&
                  (bindings[picking] === action.id || (!bindings[picking] && action.id === 'none'));
                return (
                  <Pressable
                    key={action.id}
                    onPress={() => picking && setBinding(picking, action.id)}
                    style={[styles.actionRow, on && styles.actionOn]}
                  >
                    <Text style={[styles.actionText, on && styles.actionTextOn]}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setPicking(null)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>Zamknij</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function FaceBtn({
  id,
  label,
  color,
  style,
  active,
  onPress,
  onLongPress,
}: {
  id: PadButtonId;
  label: string;
  color: string;
  style: object;
  active: boolean;
  onPress: (id: PadButtonId) => void;
  onLongPress: (id: PadButtonId) => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Przycisk ${label}`}
      accessibilityHint="Krótko: uruchom przypisaną komendę. Przytrzymaj: wybór funkcji."
      onPress={() => onPress(id)}
      onLongPress={() => onLongPress(id)}
      delayLongPress={380}
      hitSlop={6}
      style={[styles.faceBtn, style, { backgroundColor: color }, active && styles.flash]}
    >
      <Text style={styles.faceText}>{label}</Text>
    </Pressable>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  wrap: { padding: 14, paddingBottom: 24, alignItems: 'center' },
  title: { alignSelf: 'stretch', color: colors.ink, fontSize: a11yFont(18, textScale), fontWeight: '800' },
  hint: {
    alignSelf: 'stretch',
    color: colors.muted,
    fontSize: a11yFont(12, textScale),
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 17,
  },
  linkState: { alignSelf: 'stretch', color: colors.ok, fontWeight: '700', fontSize: a11yFont(12, textScale), marginBottom: 6 },
  linkOff: { color: colors.danger },
  statusLine: {
    alignSelf: 'stretch',
    color: colors.cyan,
    fontWeight: '700',
    fontSize: a11yFont(12, textScale),
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  pad: { position: 'relative', marginBottom: 16 },
  grip: {
    position: 'absolute',
    bottom: 0,
    width: '28%',
    height: '55%',
    backgroundColor: '#2a3542',
    borderRadius: 28,
  },
  gripL: { left: 0 },
  gripR: { right: 0 },
  body: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    top: '8%',
    bottom: '10%',
    backgroundColor: '#3d4c5c',
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 10,
  },
  shoulderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  shoulder: {
    width: '42%',
    height: 18,
    borderRadius: 6,
    backgroundColor: '#24303c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumper: {
    width: '42%',
    height: 16,
    borderRadius: 5,
    backgroundColor: '#2f3d4c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoulderText: { color: '#c8d2dc', fontSize: a11yFont(9, textScale), fontWeight: '800' },
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  leftCluster: { width: '32%', alignItems: 'center', gap: 8 },
  stickOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#24303c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickInner: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a222c' },
  dpad: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dpadArm: { position: 'absolute', backgroundColor: '#24303c', borderRadius: 3 },
  dpadV: { width: 14, height: 44 },
  dpadH: { width: 44, height: 14 },
  midCluster: { width: '20%', alignItems: 'center', gap: 8 },
  brandTiny: { color: '#9aafc2', fontSize: a11yFont(9, textScale), fontWeight: '800', letterSpacing: 0.6 },
  pill: {
    width: 28,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#24303c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: '#c8d2dc', fontSize: a11yFont(10, textScale) },
  faceCluster: { width: 118, height: 118, position: 'relative' },
  faceBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.2)',
    zIndex: 2,
  },
  // Y góra, X lewo, B prawo, A dół.
  faceY: { top: 0, left: 39 },
  faceX: { top: 39, left: 0 },
  faceB: { top: 39, right: 0 },
  faceA: { bottom: 0, left: 39 },
  faceText: { color: '#111', fontWeight: '900', fontSize: a11yFont(15, textScale) },
  stickOuterSmall: {
    position: 'absolute',
    left: 38,
    top: 38,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#24303c',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.35,
    zIndex: 0,
  },
  stickInnerSmall: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#1a222c' },
  flash: { opacity: 0.55, transform: [{ scale: 0.94 }] },
  section: { alignSelf: 'stretch', color: colors.ink, fontWeight: '800', fontSize: a11yFont(14, textScale), marginBottom: 8 },
  bindList: { alignSelf: 'stretch', gap: 8 },
  bindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  bindDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bindDotText: { color: '#111', fontWeight: '900', fontSize: a11yFont(13, textScale) },
  bindLabel: { flex: 1, color: colors.ink, fontWeight: '600', fontSize: a11yFont(13, textScale) },
  bindEdit: { color: colors.cyan, fontWeight: '700', fontSize: a11yFont(12, textScale) },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 14,
  },
  modalTitle: { color: colors.ink, fontSize: a11yFont(18, textScale), fontWeight: '800' },
  modalSub: { color: colors.muted, fontSize: a11yFont(12, textScale), marginBottom: 10 },
  modalScroll: { maxHeight: 360 },
  actionRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    marginBottom: 4,
    backgroundColor: colors.bgRaised,
  },
  actionOn: { backgroundColor: colors.tabBar },
  actionText: { color: colors.ink, fontWeight: '600', fontSize: a11yFont(14, textScale) },
  actionTextOn: { color: '#fff' },
  modalClose: { marginTop: 10, alignItems: 'center', paddingVertical: 12 },
  modalCloseText: { color: colors.cyan, fontWeight: '800' },

      }),
    [colors, textScale],
  );
}

