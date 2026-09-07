import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RobotInfo } from '../protocol';
import { colors, radii } from '../theme';
import type { Phase } from '../net/useRobot';

type Props = {
  phase: Phase;
  robots: RobotInfo[];
  error: string | null;
  udpAvailable: boolean;
  onRetry: () => void;
  onPick: (info: RobotInfo) => void;
  onManual: (host: string) => void;
};

export function ConnectPanel({
  phase,
  robots,
  error,
  udpAvailable,
  onRetry,
  onPick,
  onManual,
}: Props) {
  const [host, setHost] = useState('');
  const searching = phase === 'searching' || phase === 'booting' || phase === 'connecting';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {searching ? 'Szukam robota w sieci…' : 'Nie znaleziono robota'}
      </Text>
      <Text style={styles.body}>
        {udpAvailable
          ? 'Aplikacja wysyła broadcast UDP. Raspberry Pi odpowiada swoim adresem, po czym łączymy się automatycznie.'
          : 'W przeglądarce nie ma broadcastu UDP — próbuję tego samego hosta i zapisanego adresu. Na telefonie (APK / Expo) discovery działa przez UDP.'}
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
                  {r.host}:{r.httpPort} · {r.via}
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
          placeholder="192.168.1.42 lub http://host:8742"
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
        <Text style={styles.retryText}>Szukaj ponownie</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: 14,
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
    fontSize: 13,
  },
  error: {
    color: colors.warn,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: 8,
    marginTop: 4,
  },
  robot: {
    backgroundColor: colors.bgRaised,
    borderRadius: radii.md,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  robotName: {
    color: colors.text,
    fontWeight: '600',
  },
  robotHost: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  cta: {
    color: colors.accent,
    fontWeight: '700',
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  manual: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  go: {
    backgroundColor: colors.accent,
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
    fontSize: 13,
  },
});
