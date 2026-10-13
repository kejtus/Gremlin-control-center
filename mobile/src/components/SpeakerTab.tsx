import { useEffect, useState , useMemo} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont} from '../accessibility';
import { pickMp3 } from '../net/pickMp3';
import { FALLBACK_SOUNDS, soundControlPath } from '../protocol';
import { loadSoundVolume, saveSoundVolume } from '../storage';
import { colors, radii } from '../theme';

const VOLUMES = [25, 50, 75, 100];

type Props = {
  onPlay: (file: string, volume: number) => void;
  onPlayUpload: (name: string, audioBase64: string, volume: number) => void;
  onStop: () => void;
};

function prettyName(file: string): string {
  return file.replace(/\.(mp3|wav)$/i, '').replace(/[_-]+/g, ' ');
}

export function SpeakerTab({ onPlay, onPlayUpload, onStop }: Props) {
  const styles = useStyles();
  const sounds = FALLBACK_SOUNDS;
  const [playing, setPlaying] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [uploadVol, setUploadVol] = useState(100);
  const [custom, setCustom] = useState<{ name: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        sounds.map(async (name) => {
          next[name] = await loadSoundVolume(name);
        }),
      );
      if (!cancelled) setVolumes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const play = (name: string) => {
    const pct = volumes[name] ?? 100;
    setError(null);
    setPlaying(name);
    onPlay(soundControlPath(name), pct / 100);
  };

  const stop = () => {
    setPlaying(null);
    onStop();
  };

  const setVol = (name: string, pct: number) => {
    setVolumes((prev) => ({ ...prev, [name]: pct }));
    void saveSoundVolume(name, pct);
  };

  const pickCustom = async () => {
    setError(null);
    setBusy(true);
    try {
      const picked = await pickMp3();
      if (!picked) return;
      setCustom({ name: picked.name, base64: picked.base64 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wczytać MP3.');
    } finally {
      setBusy(false);
    }
  };

  const playCustom = () => {
    if (!custom) return;
    setError(null);
    setPlaying(custom.name);
    onPlayUpload(custom.name, custom.base64, uploadVol / 100);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Własne MP3</Text>
      <Text style={styles.hint}>
        Wybierz plik raz — potem odtwarzaj przyciskiem poniżej ile chcesz (max 3&nbsp;MB). Na Pi musi być
        patch <Text style={styles.mono}>play_sound + audio_b64</Text>.
      </Text>

      <A11yPressable
        onPress={() => void pickCustom()}
        disabled={busy}
        style={[styles.upload, busy && styles.uploadBusy]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadText}>{custom ? 'Zmień MP3' : 'Wybierz MP3'}</Text>
        )}
      </A11yPressable>

      {custom ? (
        <View style={styles.card}>
          <A11yPressable
            onPress={playCustom}
            style={[styles.play, playing === custom.name && styles.playOn]}
          >
            <Text style={styles.playText} numberOfLines={2}>
              ▶ {prettyName(custom.name)}
            </Text>
          </A11yPressable>
          <View style={styles.vols}>
            {VOLUMES.map((v) => (
              <A11yPressable
                key={v}
                onPress={() => setUploadVol(v)}
                boost={false} style={[styles.vol, uploadVol === v && styles.volOn]}
              >
                <Text style={styles.volText}>{v}%</Text>
              </A11yPressable>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.status}>Brak wybranego pliku</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={[styles.section, { marginTop: 8 }]}>Gotowe dźwięki</Text>
      <Text style={styles.hint}>Odtwarzanie na głośniku Pi przez WS (pliki z katalogu sounds/).</Text>

      <A11yPressable onPress={stop} style={styles.stop}>
        <Text style={styles.stopText}>STOP</Text>
      </A11yPressable>
      <Text style={styles.status}>{playing ? `Odtwarzanie: ${playing}` : 'Gotowy'}</Text>

      {sounds.map((name) => {
        const pct = volumes[name] ?? 100;
        const on = playing === name;
        return (
          <View key={name} style={styles.card}>
            <A11yPressable onPress={() => play(name)} style={[styles.play, on && styles.playOn]}>
              <Text style={styles.playText} numberOfLines={2}>
                {prettyName(name)}
              </Text>
            </A11yPressable>
            <View style={styles.vols}>
              {VOLUMES.map((v) => (
                <A11yPressable
                  key={v}
                  onPress={() => setVol(name, v)}
                  style={[styles.vol, pct === v && styles.volOn]}
                >
                  <Text style={styles.volText}>{v}%</Text>
                </A11yPressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  wrap: {
    gap: 10,
    padding: 16,
  },
  section: {
    color: colors.ink,
    fontSize: a11yFont(16, textScale),
    fontWeight: '800',
  },
  hint: {
    color: colors.muted,
    fontSize: a11yFont(13, textScale),
    lineHeight: 19,
  },
  mono: {
    fontFamily: 'monospace',
    color: colors.cyan,
    fontSize: a11yFont(12, textScale),
  },
  upload: {
    backgroundColor: colors.tabBar,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  uploadBusy: {
    opacity: 0.7,
  },
  uploadText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: a11yFont(15, textScale),
  },
  stop: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  stopText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 2,
  },
  status: {
    color: colors.cyan,
    fontSize: a11yFont(13, textScale),
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    fontSize: a11yFont(13, textScale),
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.bgRaised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  play: {
    backgroundColor: colors.button,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  playOn: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.buttonOn,
  },
  playText: {
    color: colors.ink,
    fontWeight: '700',
  },
  vols: {
    flexDirection: 'row',
    gap: 6,
  },
  vol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  volOn: {
    borderColor: colors.accent,
    backgroundColor: colors.buttonOn,
  },
  volText: {
    color: colors.ink,
    fontSize: a11yFont(12, textScale),
    fontWeight: '700',
  },

      }),
    [colors, textScale],
  );
}

