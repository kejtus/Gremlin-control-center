import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Arena } from './src/components/Arena';
import { ConnectPanel } from './src/components/ConnectPanel';
import { Joystick } from './src/components/Joystick';
import { TopBar } from './src/components/TopBar';
import { useRobot } from './src/net/useRobot';
import { siteUrl } from './src/protocol';
import { colors, radii } from './src/theme';

const POWERS = [0.25, 0.45, 0.7, 1];

export default function App() {
  const robot = useRobot();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const online = robot.phase === 'online';

  useEffect(() => {
    void activateKeepAwakeAsync('rpilot');
    return () => deactivateKeepAwake('rpilot');
  }, []);

  return (
    <View style={styles.safe}>
      <StatusBar style="light" />
      <TopBar
        phase={robot.phase}
        active={robot.active}
        status={robot.status}
        transport={robot.transport}
        onDisconnect={robot.disconnect}
      />

      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        {!online ? (
          <ConnectPanel
            phase={robot.phase}
            robots={robot.robots}
            error={robot.error}
            udpAvailable={robot.udpAvailable}
            onRetry={robot.retry}
            onPick={(info) => void robot.connect(info)}
            onManual={(host) => void robot.connectManual(host)}
          />
        ) : (
          <View style={[styles.workspace, wide && styles.workspaceWide]}>
            <View style={styles.driveCol}>
              <Text style={styles.section}>Mecanum · WS :8765</Text>
              <Text style={styles.hint}>
                Góra/dół — jazda, lewo/prawo — ślizg. Przyciski obracają w miejscu.
                Pakiety type/motor/channel/pwm jak w panelu Gremlina.
              </Text>
              <View style={styles.joyWrap}>
                <Joystick onChange={(x, y) => robot.drive(x, y, 0)} disabled={!online} />
              </View>
              <View style={styles.yawRow}>
                <Pressable
                  onPressIn={() => robot.setOmega(-1)}
                  onPressOut={() => robot.setOmega(0)}
                  style={styles.yaw}
                >
                  <Text style={styles.cmdText}>Obrót L</Text>
                </Pressable>
                <Pressable
                  onPressIn={() => robot.setOmega(1)}
                  onPressOut={() => robot.setOmega(0)}
                  style={styles.yaw}
                >
                  <Text style={styles.cmdText}>Obrót P</Text>
                </Pressable>
              </View>
              <Text style={styles.powerLabel}>Moc {Math.round(robot.power * 100)}%</Text>
              <View style={styles.cmds}>
                {POWERS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => robot.setPower(p)}
                    style={[styles.cmd, robot.power === p && styles.cmdOn]}
                  >
                    <Text style={styles.cmdText}>{Math.round(p * 100)}%</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={robot.stop} style={styles.estop}>
                <Text style={styles.estopText}>STOP</Text>
              </Pressable>
              <View style={styles.cmds}>
                <Pressable onPress={() => void robot.command('beep')} style={styles.cmd}>
                  <Text style={styles.cmdText}>Sygnał</Text>
                </Pressable>
                <Pressable onPress={() => void robot.command('follow')} style={styles.cmd}>
                  <Text style={styles.cmdText}>Śledź taśmę</Text>
                </Pressable>
                <Pressable onPress={() => void robot.command('manual')} style={styles.cmd}>
                  <Text style={styles.cmdText}>Ręczny</Text>
                </Pressable>
                {robot.active ? (
                  <Pressable
                    onPress={() => void Linking.openURL(siteUrl(robot.active!))}
                    style={styles.cmd}
                  >
                    <Text style={styles.cmdText}>Panel Gremlin</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.telemCol}>
              <Text style={styles.section}>Arena i telemetria</Text>
              <Arena status={robot.status} compact={!wide} />
              <View style={styles.metrics}>
                <Metric label="FL" value={wheel(robot.status, 'FL')} />
                <Metric label="FR" value={wheel(robot.status, 'FR')} />
                <Metric label="RL" value={wheel(robot.status, 'RL')} />
                <Metric label="RR" value={wheel(robot.status, 'RR')} />
              </View>
              <Text style={styles.mode}>
                Gremlin · {robot.status?.programOn === false ? 'program OFF' : 'program ON'}
                {robot.status?.followBand ? ' · taśma' : ''}
              </Text>
              <Text style={styles.section}>Endpointy robota</Text>
              {robot.endpoints.length === 0 ? (
                <Text style={styles.hint}>Brak listy endpointów.</Text>
              ) : (
                robot.endpoints.map((e) => (
                  <View key={`${e.method}${e.path}`} style={styles.ep}>
                    <Text style={styles.epMethod}>{e.method}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.epPath}>{e.path}</Text>
                      <Text style={styles.epSum}>{e.summary}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricVal}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function wheel(status: { wheels?: Record<string, number>; channels?: Record<number, number> } | null, role: string): string {
  const mapped: Record<string, [number, number]> = { FL: [0, 1], FR: [3, 2], RL: [4, 5], RR: [7, 6] };
  const fromWheels = status?.wheels?.[role];
  if (fromWheels != null) return `${Math.round((fromWheels / 4095) * 100)}%`;
  const pair = mapped[role];
  if (!pair || !status?.channels) return '—';
  const peak = Math.max(status.channels[pair[0]] ?? 0, status.channels[pair[1]] ?? 0);
  return `${Math.round((peak / 4095) * 100)}%`;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 18,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  workspace: {
    gap: 22,
  },
  workspaceWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 28,
  },
  driveCol: {
    flex: 1.1,
    minWidth: 280,
  },
  telemCol: {
    flex: 1,
    minWidth: 260,
    gap: 10,
  },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  joyWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  yawRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  yaw: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  powerLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  estop: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  estopText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 3,
    fontSize: 18,
  },
  cmds: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  cmd: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cmdText: {
    color: colors.text,
    fontWeight: '600',
  },
  cmdOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  metricVal: {
    color: colors.cyan,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  mode: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  ep: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  epMethod: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    width: 48,
    marginTop: 2,
  },
  epPath: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  epSum: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
