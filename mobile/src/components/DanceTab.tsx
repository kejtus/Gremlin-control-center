import { useCallback, useEffect, useRef, useState , useMemo} from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont} from '../accessibility';
import { DANCES, READY_MOVES, channelsFromDirs, type Dance } from '../dances';
import { colors, radii } from '../theme';
import { DanceBuilder } from './DanceBuilder';

type Props = {
  onSendChannels: (channels: Record<number, number>) => void;
  onStop: () => void;
};

export function DanceTab({ onSendChannels, onStop }: Props) {
  const styles = useStyles();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [status, setStatus] = useState('BRAK TAŃCA');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<string | null>(null);
  const loopRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const halt = useCallback(() => {
    clearTimer();
    activeRef.current = null;
    setActiveId(null);
    setStatus('BRAK TAŃCA');
    onStop();
  }, [onStop]);

  useEffect(() => () => halt(), [halt]);

  const sendDirs = (dirs: string[], powerPct: number) => {
    onSendChannels(channelsFromDirs(dirs, powerPct));
  };

  const playStep = (dance: Dance, stepIndex: number) => {
    if (activeRef.current !== dance.id) return;
    if (stepIndex >= dance.steps.length) {
      if (loopRef.current) {
        playStep(dance, 0);
        return;
      }
      sendDirs([], 0);
      activeRef.current = null;
      setActiveId(null);
      setStatus('KONIEC');
      return;
    }
    const step = dance.steps[stepIndex];
    const pct = step.powerPct ?? dance.powerPct;
    sendDirs(step.dirs, pct);
    setStatus(`${dance.label} · ${stepIndex + 1}/${dance.steps.length}`);
    timerRef.current = setTimeout(() => playStep(dance, stepIndex + 1), step.ms);
  };

  const startDance = (dance: Dance) => {
    clearTimer();
    onStop();
    activeRef.current = dance.id;
    loopRef.current = loop;
    setActiveId(dance.id);
    setStatus(dance.label);
    playStep(dance, 0);
  };

  const holdMove = (dirs: string[], powerPct: number) => {
    if (activeRef.current) halt();
    sendDirs(dirs, powerPct);
    setStatus(dirs.join('+') || 'STOP');
  };

  const releaseMove = () => {
    if (activeRef.current) return;
    sendDirs([], 0);
    setStatus('BRAK TAŃCA');
  };

  const customPlaying = !!activeId?.startsWith('custom-');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      bounces={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Tańce</Text>
      <Text style={styles.status}>{status}</Text>

      <View style={styles.row}>
        {DANCES.map((d) => {
          const on = activeId === d.id;
          return (
            <A11yPressable
              key={d.id}
              onPress={() => (on ? halt() : startDance(d))}
              style={[styles.danceBtn, on && styles.danceOn]}
            >
              <Text style={[styles.danceText, on && styles.danceTextOn]}>{d.label}</Text>
            </A11yPressable>
          );
        })}
      </View>

      <A11yPressable onPress={() => setLoop((v) => !v)} style={styles.loopRow}>
        <View style={[styles.check, loop && styles.checkOn]} />
        <Text style={styles.loopLabel}>Zapętlaj taniec</Text>
      </A11yPressable>

      <Text style={[styles.title, { marginTop: 18 }]}>Gotowe ruchy</Text>
      <Text style={styles.hint}>Przytrzymaj — puść = stop · obrót = w miejscu</Text>
      <View style={styles.row}>
        {READY_MOVES.map((m) => (
          <A11yPressable
            key={m.id}
            onPressIn={() => holdMove(m.dirs, m.powerPct)}
            onPressOut={releaseMove}
            style={styles.moveBtn}
          >
            <Text style={styles.moveText}>{m.label}</Text>
          </A11yPressable>
        ))}
      </View>

      <DanceBuilder
        playing={customPlaying}
        onPlay={(dance) => startDance(dance)}
        onStop={halt}
      />

      <A11yPressable onPress={halt} style={styles.stop}>
        <Text style={styles.stopText}>STOP</Text>
      </A11yPressable>
    </ScrollView>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  scroll: {
    flex: 1,
  },
  root: {
    padding: 14,
    paddingBottom: 28,
  },
  title: {
    color: colors.ink,
    fontSize: a11yFont(18, textScale),
    fontWeight: '800',
    marginBottom: 6,
  },
  status: {
    color: colors.muted,
    fontSize: a11yFont(12, textScale),
    fontWeight: '700',
    marginBottom: 12,
  },
  hint: {
    color: colors.muted,
    fontSize: a11yFont(11, textScale),
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  danceBtn: {
    backgroundColor: colors.tabBar,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    minWidth: '46%',
    flexGrow: 1,
  },
  danceOn: {
    backgroundColor: colors.tabActive,
  },
  danceText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: a11yFont(13, textScale),
  },
  danceTextOn: {
    color: colors.ink,
  },
  loopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.tabBar,
    backgroundColor: colors.card,
  },
  checkOn: {
    backgroundColor: colors.tabActive,
  },
  loopLabel: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: a11yFont(13, textScale),
  },
  moveBtn: {
    backgroundColor: '#e8eef3',
    borderWidth: 2,
    borderColor: colors.tabBar,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: radii.md,
    minWidth: '30%',
    flexGrow: 1,
  },
  moveText: {
    color: colors.ink,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: a11yFont(12, textScale),
  },
  stop: {
    marginTop: 18,
    backgroundColor: '#c62828',
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  stopText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: a11yFont(16, textScale),
    letterSpacing: 1,
  },

      }),
    [colors, textScale],
  );
}

