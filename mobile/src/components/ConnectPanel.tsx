import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { A11yPressable, useAccessibility, a11yFont } from '../accessibility';
import { useLayout } from '../layout';
import type { RobotInfo } from '../protocol';
import { PROTOCOL } from '../protocol';
import { radii } from '../theme';
import { control, makeUi, space } from '../ui';
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
  const { colors, announce, prefs } = useAccessibility();
  const ui = useMemo(() => makeUi(colors, prefs.highContrast), [colors, prefs.highContrast]);
  const [host, setHost] = useState<string>(PROTOCOL.defaultPiHost);
  const searching = phase === 'searching' || phase === 'booting' || phase === 'connecting';
  const layout = useLayout();

  const helpBody = isStandaloneNative()
    ? `Połącz telefon z tą samą siecią Wi‑Fi co robot. Domyślny adres: ${PROTOCOL.defaultPiHost}.`
    : usesPcRelay() || !udpAvailable
      ? `Telefon, komputer i robot w tej samej Wi‑Fi. Adres robota: ${PROTOCOL.defaultPiHost}.`
      : 'Aplikacja szuka robota w sieci lokalnej. Możesz też wpisać adres ręcznie.';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.wrap, layout.phone && { padding: space.md }]}
      bounces={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Ekran łączenia z robotem"
    >
      <View style={styles.actions}>
        <A11yPressable
          exploreId="connect-preview"
          onPress={onPreview}
          style={[ui.btnGhost, styles.actionHalf]}
          accessibilityRole="button"
          accessibilityLabel="Pracuj nad wyglądem bez robota"
        >
          <Text style={ui.btnGhostText}>Podgląd UI</Text>
        </A11yPressable>
        {onOpenA11y ? (
          <A11yPressable
            exploreId="connect-a11y"
            onPress={onOpenA11y}
            style={[ui.btnGhost, styles.actionHalf]}
            accessibilityRole="button"
            accessibilityLabel="Ustawienia dostępności"
          >
            <Text style={ui.btnGhostText}>Dostępność</Text>
          </A11yPressable>
        ) : null}
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {searching ? 'Szukam robota…' : 'Połącz z robotem'}
      </Text>
      <Text style={styles.body}>{helpBody}</Text>

      <View style={styles.statusRow} accessibilityLiveRegion="polite">
        {searching ? <ActivityIndicator color={colors.accent} /> : null}
        <Text style={styles.status}>
          {phase === 'connecting'
            ? 'Łączenie…'
            : searching
              ? 'Szukam w sieci'
              : 'Wpisz adres albo szukaj ponownie'}
        </Text>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      {robots.length > 0 ? (
        <View style={styles.list} accessibilityRole="list">
          {robots.map((r) => (
            <A11yPressable
              key={r.id}
              exploreId={`robot-${r.id}`}
              onPress={() => {
                announce(`Łączę z robotem ${r.name}`);
                onPick(r);
              }}
              style={styles.robot}
              accessibilityRole="button"
              accessibilityLabel={`Połącz z robotem ${r.name}, adres ${r.host}`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.robotName}>{r.name}</Text>
                <Text style={styles.robotHost}>
                  {r.host}:{r.wsPort || PROTOCOL.wsPort}
                </Text>
              </View>
              <Text style={styles.cta}>Połącz</Text>
            </A11yPressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Adres IP</Text>
      <View style={ui.btnRow}>
        <TextInput
          value={host}
          onChangeText={setHost}
          placeholder={PROTOCOL.defaultPiHost}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Pole adresu IP robota"
        />
        <A11yPressable
          exploreId="connect-ok"
          onPress={() => {
            announce(`Łączę z adresem ${host}`);
            onManual(host);
          }}
          style={styles.go}
          accessibilityRole="button"
          accessibilityLabel="Połącz z wpisanym adresem"
        >
          <Text style={ui.btnPrimaryText}>OK</Text>
        </A11yPressable>
      </View>

      <A11yPressable
        exploreId="connect-retry"
        onPress={() => {
          announce('Szukam robota ponownie');
          onRetry();
        }}
        style={ui.btnPrimary}
        accessibilityRole="button"
        accessibilityLabel="Szukaj robota ponownie"
      >
        <Text style={ui.btnPrimaryText}>Szukaj ponownie</Text>
      </A11yPressable>
    </ScrollView>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1 },
        wrap: {
          flexGrow: 1,
          padding: space.xl,
          gap: space.md,
        },
        actions: {
          flexDirection: 'row',
          gap: control.gap,
        },
        actionHalf: {
          flex: 1,
        },
        title: {
          color: colors.ink,
          fontSize: a11yFont(20, textScale),
          fontWeight: '700',
          marginTop: space.sm,
        },
        body: {
          color: colors.muted,
          fontSize: a11yFont(14, textScale),
          lineHeight: Math.round(20 * textScale),
        },
        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: 24,
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
        list: { gap: space.sm },
        robot: {
          backgroundColor: colors.button,
          borderRadius: radii.md,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: control.height,
          gap: 12,
        },
        robotName: {
          color: colors.ink,
          fontWeight: '700',
          fontSize: a11yFont(15, textScale),
        },
        robotHost: {
          color: colors.muted,
          fontSize: a11yFont(12, textScale),
          marginTop: 2,
        },
        cta: {
          color: colors.cyan,
          fontWeight: '700',
          fontSize: a11yFont(13, textScale),
        },
        label: {
          color: colors.muted,
          fontSize: a11yFont(12, textScale),
          fontWeight: '600',
          marginTop: space.xs,
        },
        input: {
          flex: 1,
          minHeight: control.height,
          backgroundColor: colors.bgRaised,
          color: colors.ink,
          borderRadius: control.radius,
          borderWidth: 1,
          borderColor: colors.line,
          paddingHorizontal: 12,
          fontSize: a11yFont(15, textScale),
        },
        go: {
          minWidth: 72,
          minHeight: control.height,
          backgroundColor: colors.tabBar,
          borderRadius: control.radiusLg,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors, textScale],
  );
}
