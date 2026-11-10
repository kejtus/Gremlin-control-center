import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  A11yPressable,
  a11yFont,
  testSpeechAsync,
  useAccessibility,
  type AccessibilityPrefs,
} from '../accessibility';
import { useLayout } from '../layout';
import { radii } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type ToggleKey = keyof AccessibilityPrefs;

const ITEMS: { key: ToggleKey; title: string; hint: string }[] = [
  {
    key: 'largeText',
    title: 'Duży tekst',
    hint: 'Większe napisy w menu, statusach i przyciskach.',
  },
  {
    key: 'highContrast',
    title: 'Wysoki kontrast',
    hint: 'Żółty tekst na czarnym tle — maksymalny kontrast.',
  },
  {
    key: 'tabLabels',
    title: 'Etykiety zakładek',
    hint: 'Pod ikoną widać nazwę (Sterowanie, Trasa, Głos…).',
  },
  {
    key: 'largeTouchTargets',
    title: 'Większe przyciski',
    hint: 'Większe zakładki, ikony, joysticki i przyciski we wszystkich zakładkach.',
  },
  {
    key: 'exploreTap',
    title: 'Odczyt dwuklik',
    hint: '1. klik = syntezator mowy (mówi na głos), 2. klik = uruchomienie. Przycisk „Test głosu” poniżej.',
  },
  {
    key: 'reduceMotion',
    title: 'Mniej animacji',
    hint: 'Mniej ruchu na ekranie — np. przy zawrotach głowy.',
  },
  {
    key: 'announceChanges',
    title: 'Ogłaszaj zmiany',
    hint: 'Po zmianie zakładki / statusu odczyt głosowy i napis.',
  },
];

export function AccessibilityPanel({ visible, onClose }: Props) {
  const { prefs, setPref, resetPrefs, colors, textScale, announce, speak } = useAccessibility();
  const layout = useLayout();
  const [ttsStatus, setTtsStatus] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);

  const onToggle = (key: ToggleKey, value: boolean) => {
    setPref(key, value);
    const item = ITEMS.find((i) => i.key === key);
    if (item) speak(`${item.title}: ${value ? 'włączone' : 'wyłączone'}`);
  };

  const onTestVoice = async () => {
    setTtsBusy(true);
    setTtsStatus('Uruchamiam TTS…');
    try {
      const status = await testSpeechAsync('Test głosu. Jeśli to słyszysz, odczyt działa.');
      setTtsStatus(status);
    } catch (e) {
      setTtsStatus(`Błąd: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTtsBusy(false);
    }
  };

  const openTtsSettings = async () => {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('com.android.settings.TTS_SETTINGS');
    } catch {
      try {
        const IntentLauncher = await import('expo-intent-launcher');
        await IntentLauncher.startActivityAsync('android.settings.TTS_SETTINGS');
      } catch (e) {
        setTtsStatus(
          `Nie otwarto ustawień TTS (${e instanceof Error ? e.message : 'brak'}). ` +
            'Wejdź ręcznie: Ustawienia → Dostępność → Synteza mowy / Text-to-speech.',
        );
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Zamknij" />
        <View
          style={[
            styles.sheet,
            {
              borderColor: colors.line,
              backgroundColor: colors.card,
              maxHeight: layout.height * 0.92,
            },
          ]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            bounces
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <Text
              style={[
                styles.title,
                { color: colors.ink, fontSize: a11yFont(layout.phone ? 18 : 20, textScale) },
              ]}
              accessibilityRole="header"
            >
              Dostępność
            </Text>
            <Text style={[styles.lead, { color: colors.muted, fontSize: a11yFont(13, textScale) }]}>
              Lektor: dowolny systemowy TTS (nie musi być Google). Mikrofon w zakładce Głos to Vosk
              offline.
            </Text>

            {ITEMS.map(({ key, title, hint }) => (
              <View key={key} style={[styles.row, { borderBottomColor: colors.line }]}>
                <View style={styles.rowText} accessible accessibilityRole="text">
                  <Text
                    style={[styles.rowTitle, { color: colors.text, fontSize: a11yFont(15, textScale) }]}
                  >
                    {title}
                  </Text>
                  <Text
                    style={[styles.rowHint, { color: colors.muted, fontSize: a11yFont(12, textScale) }]}
                  >
                    {hint}
                  </Text>
                </View>
                <Switch
                  value={prefs[key]}
                  onValueChange={(v) => onToggle(key, v)}
                  accessibilityLabel={title}
                  accessibilityHint={hint}
                  trackColor={{ false: colors.line, true: colors.ok }}
                  thumbColor={prefs[key] ? colors.accent : '#ccc'}
                />
              </View>
            ))}

            <View style={styles.actions}>
              <Pressable
                onPress={() => void onTestVoice()}
                disabled={ttsBusy}
                style={[
                  styles.btn,
                  { backgroundColor: colors.ok, flex: 1.2, opacity: ttsBusy ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Przetestuj syntezator mowy"
              >
                <Text
                  style={{
                    color: prefs.highContrast ? '#000' : '#fff',
                    fontWeight: '800',
                    fontSize: a11yFont(13, textScale),
                    textAlign: 'center',
                  }}
                >
                  {ttsBusy ? 'Test…' : 'Test głosu'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void openTtsSettings()}
                style={[styles.btn, styles.btnGhost, { borderColor: colors.line, flex: 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Otwórz ustawienia syntezy mowy w systemie"
              >
                <Text
                  style={{ color: colors.text, fontWeight: '700', fontSize: a11yFont(13, textScale) }}
                >
                  TTS w systemie
                </Text>
              </Pressable>
            </View>

            {ttsStatus ? (
              <Text
                style={{
                  color: colors.muted,
                  fontSize: a11yFont(12, textScale),
                  lineHeight: Math.round(16 * textScale),
                  marginTop: 4,
                }}
              >
                {ttsStatus}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <A11yPressable
                exploreId="a11y-reset"
                accessibilityLabel="Przywróć domyślne ustawienia dostępności"
                onPress={() => {
                  resetPrefs();
                  announce('Przywrócono domyślne ustawienia dostępności');
                }}
                style={[styles.btn, styles.btnGhost, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.text, fontSize: a11yFont(14, textScale) }}>Domyślne</Text>
              </A11yPressable>
              <A11yPressable
                exploreId="a11y-done"
                accessibilityLabel="Zamknij panel dostępności"
                onPress={onClose}
                style={[styles.btn, { backgroundColor: colors.accent }]}
              >
                <Text
                  style={{
                    color: prefs.highContrast ? '#000' : '#fff',
                    fontWeight: '800',
                    fontSize: a11yFont(14, textScale),
                  }}
                >
                  Gotowe
                </Text>
              </A11yPressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    borderRadius: radii.lg,
    borderWidth: 3,
    overflow: 'hidden',
    zIndex: 2,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 4,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  lead: {
    lineHeight: 18,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontWeight: '700',
  },
  rowHint: {
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    minHeight: 52,
  },
  btnGhost: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
});
