import { useCallback, useEffect, useState , useMemo} from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAccessibility, a11yFont } from '../accessibility';
import {
  DANCE_BLOCKS,
  blockDef,
  customBlocksToDance,
  type CustomDanceBlock,
  type Dance,
  type DanceBlockKind,
} from '../dances';
import { loadCustomDance, saveCustomDance } from '../storage';
import { colors, radii } from '../theme';

const SEC_PRESETS = [0.5, 1, 2, 3, 5];

type Props = {
  playing: boolean;
  onPlay: (dance: Dance) => void;
  onStop: () => void;
};

function newId() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function DanceBuilder({ playing, onPlay, onStop }: Props) {
  const styles = useStyles();
  const [name, setName] = useState('Mój taniec');
  const [blocks, setBlocks] = useState<CustomDanceBlock[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadCustomDance().then((saved) => {
      if (saved) {
        setName(saved.name || 'Mój taniec');
        setBlocks(
          saved.blocks
            .filter((b) => DANCE_BLOCKS.some((d) => d.kind === b.kind))
            .map((b) => ({
              id: b.id || newId(),
              kind: b.kind as DanceBlockKind,
              sec: Math.max(0.1, Number(b.sec) || 1),
              powerPct: Math.max(0, Math.min(100, Number(b.powerPct) || 40)),
            })),
        );
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((nextName: string, nextBlocks: CustomDanceBlock[]) => {
    void saveCustomDance({
      name: nextName,
      blocks: nextBlocks.map((b) => ({
        id: b.id,
        kind: b.kind,
        sec: b.sec,
        powerPct: b.powerPct,
      })),
    });
  }, []);

  const addBlock = (kind: DanceBlockKind) => {
    const def = blockDef(kind);
    const next = [
      ...blocks,
      {
        id: newId(),
        kind,
        sec: def.defaultSec,
        powerPct: def.defaultPower,
      },
    ];
    setBlocks(next);
    persist(name, next);
  };

  const updateBlock = (id: string, patch: Partial<CustomDanceBlock>) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    setBlocks(next);
    persist(name, next);
  };

  const removeBlock = (id: string) => {
    const next = blocks.filter((b) => b.id !== id);
    setBlocks(next);
    persist(name, next);
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    setBlocks(next);
    persist(name, next);
  };

  const clearAll = () => {
    setBlocks([]);
    persist(name, []);
  };

  const play = () => {
    if (!blocks.length) return;
    onPlay(customBlocksToDance(name, blocks));
  };

  if (!loaded) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Własny taniec</Text>
      <Text style={styles.hint}>
        Dotknij bloczek, żeby dodać go do stosu — jak w Scratchu. Ustaw czas (np. 5 s) i kolejność.
      </Text>

      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          persist(t, blocks);
        }}
        placeholder="Nazwa tańca"
        placeholderTextColor={colors.muted}
        style={styles.nameInput}
      />

      <Text style={styles.section}>Bloczki</Text>
      <View style={styles.palette}>
        {DANCE_BLOCKS.map((b) => (
          <Pressable
            key={b.kind}
            onPress={() => addBlock(b.kind)}
            style={[styles.paletteBlock, { backgroundColor: b.color }]}
          >
            <Text style={styles.paletteTitle}>{b.title}</Text>
            <Text style={styles.paletteSub}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.stackHead}>
        <Text style={styles.section}>Stos ({blocks.length})</Text>
        {blocks.length > 0 ? (
          <Pressable onPress={clearAll} hitSlop={8}>
            <Text style={styles.clear}>wyczyść</Text>
          </Pressable>
        ) : null}
      </View>

      {blocks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Pusty stos — dodaj bloczki powyżej</Text>
        </View>
      ) : (
        <View style={styles.stack}>
          {blocks.map((b, i) => {
            const def = blockDef(b.kind);
            return (
              <View key={b.id} style={[styles.stackBlock, { backgroundColor: def.color }]}>
                <View style={styles.stackTop}>
                  <Text style={styles.stackTitle}>
                    {i + 1}. {def.title}
                  </Text>
                  <View style={styles.stackActions}>
                    <Pressable onPress={() => moveBlock(i, -1)} style={styles.iconBtn} hitSlop={6}>
                      <Text style={styles.iconText}>↑</Text>
                    </Pressable>
                    <Pressable onPress={() => moveBlock(i, 1)} style={styles.iconBtn} hitSlop={6}>
                      <Text style={styles.iconText}>↓</Text>
                    </Pressable>
                    <Pressable onPress={() => removeBlock(b.id)} style={styles.iconBtn} hitSlop={6}>
                      <Text style={styles.iconText}>×</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.stackLabel}>przez</Text>
                <View style={styles.secRow}>
                  {SEC_PRESETS.map((s) => {
                    const on = Math.abs(b.sec - s) < 0.01;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => updateBlock(b.id, { sec: s })}
                        style={[styles.secChip, on && styles.secChipOn]}
                      >
                        <Text style={[styles.secChipText, on && styles.secChipTextOn]}>{s}s</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {def.kind !== 'wait' ? (
                  <>
                    <Text style={styles.stackLabel}>moc {b.powerPct}%</Text>
                    <View style={styles.secRow}>
                      {[25, 40, 55, 70].map((p) => {
                        const on = b.powerPct === p;
                        return (
                          <Pressable
                            key={p}
                            onPress={() => updateBlock(b.id, { powerPct: p })}
                            style={[styles.secChip, on && styles.secChipOn]}
                          >
                            <Text style={[styles.secChipText, on && styles.secChipTextOn]}>{p}%</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.playRow}>
        <Pressable
          onPress={playing ? onStop : play}
          disabled={!playing && blocks.length === 0}
          style={[
            styles.playBtn,
            playing && styles.playBtnStop,
            !playing && blocks.length === 0 && styles.playDisabled,
          ]}
        >
          <Text style={styles.playText}>{playing ? 'Zatrzymaj własny' : 'Odtwórz własny taniec'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  wrap: {
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  title: {
    color: colors.ink,
    fontSize: a11yFont(18, textScale),
    fontWeight: '800',
    marginBottom: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: a11yFont(12, textScale),
    lineHeight: 17,
    marginBottom: 10,
  },
  nameInput: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.tabBar,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '700',
    fontSize: a11yFont(14, textScale),
    marginBottom: 12,
  },
  section: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: a11yFont(14, textScale),
    marginBottom: 8,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  paletteBlock: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.18)',
  },
  paletteTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: a11yFont(13, textScale),
    letterSpacing: 0.3,
  },
  paletteSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: a11yFont(11, textScale),
    marginTop: 2,
  },
  stackHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clear: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: a11yFont(12, textScale),
    marginBottom: 8,
  },
  empty: {
    backgroundColor: colors.bgRaised,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.tabActive,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: a11yFont(13, textScale),
  },
  stack: {
    gap: 8,
    marginBottom: 12,
  },
  stackBlock: {
    borderRadius: 12,
    padding: 10,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  stackTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stackTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: a11yFont(14, textScale),
    flex: 1,
  },
  stackActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: a11yFont(14, textScale),
  },
  stackLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    fontSize: a11yFont(11, textScale),
    marginBottom: 4,
  },
  secRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  secChip: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  secChipOn: {
    backgroundColor: colors.card,
  },
  secChipText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: a11yFont(12, textScale),
  },
  secChipTextOn: {
    color: colors.ink,
  },
  playRow: {
    marginTop: 4,
  },
  playBtn: {
    backgroundColor: colors.tabBar,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  playBtnStop: {
    backgroundColor: colors.danger,
  },
  playDisabled: {
    opacity: 0.45,
  },
  playText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: a11yFont(14, textScale),
  },

      }),
    [colors, textScale],
  );
}

