import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RobotInfo, RobotStatus } from '../protocol';
import { colors } from '../theme';
import type { Phase } from '../net/useRobot';

type Props = {
  phase: Phase;
  active: RobotInfo | null;
  status: RobotStatus | null;
  transport: 'udp' | 'ws' | 'http';
  onDisconnect: () => void;
};

function Dot({ ok }: { ok: boolean }) {
  return <View style={[styles.dot, { backgroundColor: ok ? colors.ok : colors.warn }]} />;
}

export function TopBar({ phase, active, status, transport, onDisconnect }: Props) {
  const online = phase === 'online';
  const title = active?.name ?? 'RPilot';
  const host = active?.host ? active.host.replace(/^https?:\/\//, '') : 'szukanie…';

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>RPILOT</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.row}>
          <Dot ok={online} />
          <Text style={styles.meta} numberOfLines={1}>
            {online ? `${host} · ${transport.toUpperCase()}` : phase === 'searching' ? 'broadcast w sieci lokalnej' : 'brak połączenia'}
          </Text>
        </View>
      </View>
      <View style={styles.side}>
        <Text style={styles.batt}>{status ? `${Math.round(status.batteryPct)}%` : '—'}</Text>
        <Text style={styles.battLabel}>akumulator</Text>
        {online ? (
          <Pressable onPress={onDisconnect} style={styles.linkBtn}>
            <Text style={styles.link}>rozłącz</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    flex: 1,
  },
  side: {
    alignItems: 'flex-end',
  },
  batt: {
    color: colors.cyan,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  battLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  linkBtn: {
    marginTop: 8,
  },
  link: {
    color: colors.muted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
