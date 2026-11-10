import { useEffect, useState , useMemo} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont } from '../accessibility';
import { pickMp3 } from '../net/pickMp3';
import { FALLBACK_SOUNDS, soundControlPath } from '../protocol';
import { loadSoundVolume, saveSoundVolume } from '../storage';
import { radii } from '../theme';
import { control, makeUi, space } from '../ui';

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
  const { colors, prefs } = useAccessibility();
  const ui = useMemo(() => makeUi(colors, prefs.highContrast), [colors, prefs.highContrast]);
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
      <Text style={ui.sectionTitle}>Własne MP3</Text>
      <Text style={ui.sectionHint}>Wybierz plik (max 3 MB), potem odtwarzaj ile razy chcesz.</Text>

      <A11yPressable
        onPress={() => void pickCustom()}
        disabled={busy}
        style={[ui.btnPrimary, busy && styles.uploadBusy]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={ui.btnPrimaryText}>{custom ? 'Zmień plik' : 'Wybierz MP3'}</Text>
        )}
      </A11yPressable>

      {custom ? (
        <View style={ui.panel}>
          <A11yPressable
            onPress={playCustom}
            style={[styles.play, playing === custom.name && styles.playOn]}
          >
            <Text style={styles.playText} numberOfLines={2}>
              {prettyName(custom.name)}
            </Text>
          </A11yPressable>
          <View style={ui.btnRow}>
            {VOLUMES.map((v) => (
              <A11yPressable
                key={v}
                onPress={() => setUploadVol(v)}
                boost={false}
                style={[ui.chip, uploadVol === v && ui.chipOn]}
              >
                <Text style={ui.chipText}>{v}%</Text>
              </A11yPressable>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.status}>Brak wybranego pliku</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={[ui.sectionTitle, { marginTop: space.sm }]}>Gotowe dźwięki</Text>
      <Text style={ui.sectionHint}>Odtwarzanie na głośniku Pi.</Text>

      <View style={ui.btnRow}>
        <A11yPressable onPress={stop} style={[ui.btnDanger, { flex: 1 }]}>
          <Text style={ui.btnPrimaryText}>Stop</Text>
        </A11yPressable>
      </View>
      <Text style={styles.status}>{playing ? `Gra: ${prettyName(playing)}` : 'Gotowy'}</Text>

      {sounds.map((name) => {
        const pct = volumes[name] ?? 100;
        const on = playing === name;
        return (
          <View key={name} style={ui.panel}>
            <A11yPressable onPress={() => play(name)} style={[styles.play, on && styles.playOn]}>
              <Text style={styles.playText} numberOfLines={2}>
                {prettyName(name)}
              </Text>
            </A11yPressable>
            <View style={ui.btnRow}>
              {VOLUMES.map((v) => (
                <A11yPressable
                  key={v}
                  onPress={() => setVol(name, v)}
                  style={[ui.chip, pct === v && ui.chipOn]}
                >
                  <Text style={ui.chipText}>{v}%</Text>
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
          gap: space.md,
          padding: space.lg,
        },
        uploadBusy: { opacity: 0.7 },
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
        play: {
          backgroundColor: colors.button,
          borderRadius: radii.sm,
          minHeight: control.heightSm,
          paddingVertical: 10,
          paddingHorizontal: 12,
          justifyContent: 'center',
        },
        playOn: {
          borderWidth: 1,
          borderColor: colors.cardBorder,
          backgroundColor: colors.buttonOn,
        },
        playText: {
          color: colors.ink,
          fontWeight: '700',
          fontSize: a11yFont(14, textScale),
        },
      }),
    [colors, textScale],
  );
}

