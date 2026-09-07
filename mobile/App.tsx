import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import {
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
import { colors, radii } from './src/theme';

const COMMANDS = [
  { id: 'beep', label: 'Sygnał' },
  { id: 'lights', label: 'Światła' },
  { id: 'dock', label: 'Dokuj' },
  { id: 'center', label: 'Na środek' },
];

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
              <Text style={styles.section}>Sterowanie UDP</Text>
              <Text style={styles.hint}>
                Lewo/prawo skręca, góra/dół jedzie. Puszczenie drążka albo 350 ms ciszy zatrzymuje robot.
              </Text>
              <View style={styles.joyWrap}>
                <Joystick onChange={robot.drive} disabled={!online} />
              </View>
              <Pressable onPress={robot.stop} style={styles.estop}>
                <Text style={styles.estopText}>STOP</Text>
              </Pressable>
              <View style={styles.cmds}>
                {COMMANDS.map((c) => (
                  <Pressable key={c.id} onPress={() => void robot.command(c.id)} style={styles.cmd}>
                    <Text style={styles.cmdText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.telemCol}>
              <Text style={styles.section}>Arena i telemetria</Text>
              <Arena status={robot.status} compact={!wide} />
              <View style={styles.metrics}>
                <Metric
                  label="lewy"
                  value={fmt(robot.status?.motors.left)}
                />
                <Metric
                  label="prawy"
                  value={fmt(robot.status?.motors.right)}
                />
                <Metric
                  label="x"
                  value={robot.status ? robot.status.pose.x.toFixed(2) : '—'}
                />
                <Metric
                  label="y"
                  value={robot.status ? robot.status.pose.y.toFixed(2) : '—'}
                />
              </View>
              <Text style={styles.mode}>
                {robot.status?.mode === 'gpio' ? 'Napęd GPIO' : 'Symulacja fizyki'}
                {robot.status?.estop ? ' · E-STOP' : ''}
                {robot.status?.lights ? ' · światła' : ''}
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

function fmt(n?: number): string {
  if (n == null) return '—';
  const v = Math.round(n * 100);
  return `${v}%`;
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
