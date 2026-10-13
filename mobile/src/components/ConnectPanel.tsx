import { useState , useMemo} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAccessibility, a11yFont } from '../accessibility';
import { useLayout } from '../layout';
import type { RobotInfo } from '../protocol';
import { PROTOCOL } from '../protocol';
import { colors, radii } from '../theme';
import { isStandaloneNative, usesPcRelay } from '../net/runtime';
import type { Phase } from '../net/useRobot';

type Props = {
  phase: Phase;
  robots: RobotInfo[];
  error: string | null;
  udpAvailable: boolean;
  onRetry: () => void;
  onPreview: () => void;
  onOpenA11y?: () => void;
  onPick: (info: RobotInfo) => void;
  onManual: (host: string) => void;
};

export function ConnectPanel({
  phase,
  robots,
  error,
  udpAvailable,
  onRetry,
  onPreview,
  onOpenA11y,
  onPick,
  onManual,
}: Props) {
  const styles = useStyles();
  const [host, setHost] = useState(PROTOCOL.defaultPiHost);
  const searching = phase === 'searching' || phase === 'booting' || phase === 'connecting';
  const layout = useLayout();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.wrap,
        layout.phone && { padding: 12, gap: 8 },
      ]}
      bounces={false}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={onPreview}
        style={[styles.preview, layout.phone && { padding: 10 }]}
        accessibilityRole="button"
        accessibilityLabel="Pracuj nad UI bez Pi"
        accessibilityHint="Otwiera pełny układ aplikacji bez połączenia z robotem"
      >
        <Text style={[styles.previewTitle]}>Pracuj nad UI bez Pi</Text>
        <Text style={[styles.previewSub]}>
          Pełny układ z atrapą kamery — nic nie idzie na robota.
        </Text>
      </Pressable>

      {onOpenA11y ? (
        <Pressable
          onPress={onOpenA11y}
          style={[styles.a11yEntry, layout.phone && { padding: 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Ustawienia dostępności"
        >
          <Text style={[styles.a11yEntryTitle]}>Dostępność</Text>
          <Text style={[styles.a11yEntrySub]}>
            Duży tekst, kontrast, etykiety zakładek, większe przyciski.
          </Text>
        </Pressable>
      ) : null}

      <Text style={[styles.title]}>
        {searching ? 'Szukam robota w sieci…' : 'Nie znaleziono robota'}
      </Text>
      <Text style={[styles.body]}>
        {isStandaloneNative()
          ? `APK → bezpośrednio Pi WS :${PROTOCOL.wsPort} (domyślnie ${PROTOCOL.defaultPiHost}). Zamknij Expo Go i panel Gremlina — na :8765 jest tylko jeden klient.`
          : usesPcRelay() || !udpAvailable
            ? `Expo Go (offline LAN): telefon → PC (./start.sh) → Pi ${PROTOCOL.defaultPiHost}. Ta sama Wi‑Fi, bez internetu. Kamera: Pi→UDP→PC→WS.`
            : 'Broadcast GREMLIN_DISCOVER, potem połączenie z Pi.'}
      </Text>

      <View style={styles.statusRow}>
        {searching ? <ActivityIndicator color={colors.accent} /> : null}
        <Text style={styles.status}>
          {phase === 'connecting' ? 'Łączenie…' : searching ? 'Nasłuchiwanie odpowiedzi' : 'Tryb ręczny'}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {robots.length > 0 ? (
        <View style={styles.list}>
          {robots.map((r) => (
            <Pressable key={r.id} onPress={() => onPick(r)} style={styles.robot}>
              <View>
                <Text style={styles.robotName}>{r.name}</Text>
                <Text style={styles.robotHost}>
                  {r.host}:{r.wsPort || PROTOCOL.wsPort} · {r.via}
                </Text>
              </View>
              <Text style={styles.cta}>połącz</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Adres ręczny</Text>
      <View style={styles.manual}>
        <TextInput
          value={host}
          onChangeText={setHost}
          placeholder={PROTOCOL.defaultPiHost}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable onPress={() => onManual(host)} style={styles.go}>
          <Text style={styles.goText}>OK</Text>
        </Pressable>
      </View>

        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Szukaj / połącz ponownie</Text>
        </Pressable>
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
  wrap: {
    flexGrow: 1,
    padding: 20,
    gap: 10,
  },
  preview: {
    backgroundColor: colors.button,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 6,
  },
  a11yEntry: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 2,
    borderColor: colors.accent,
    marginBottom: 6,
  },
  a11yEntryTitle: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: a11yFont(16, textScale),
  },
  a11yEntrySub: {
    color: colors.muted,
    fontSize: a11yFont(13, textScale),
    marginTop: 4,
  },
  previewTitle: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: a11yFont(16, textScale),
  },
  previewSub: {
    color: colors.muted,
    fontSize: a11yFont(13, textScale),
    marginTop: 4,
    lineHeight: 18,
  },
  title: {
    color: colors.ink,
    fontSize: a11yFont(20, textScale),
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: a11yFont(14, textScale),
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
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
  list: {
    gap: 8,
    marginTop: 4,
  },
  robot: {
    backgroundColor: colors.button,
    borderRadius: radii.md,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  robotName: {
    color: colors.ink,
    fontWeight: '700',
  },
  robotHost: {
    color: colors.muted,
    fontSize: a11yFont(12, textScale),
    marginTop: 2,
  },
  cta: {
    color: colors.accent,
    fontWeight: '800',
  },
  label: {
    color: colors.muted,
    fontSize: a11yFont(12, textScale),
    marginTop: 8,
    fontWeight: '600',
  },
  manual: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgRaised,
    color: colors.ink,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: a11yFont(14, textScale),
  },
  go: {
    backgroundColor: colors.tabBar,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  goText: {
    color: '#fff',
    fontWeight: '700',
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  retryText: {
    color: colors.cyan,
    fontSize: a11yFont(13, textScale),
    fontWeight: '700',
  },

      }),
    [colors, textScale],
  );
}

