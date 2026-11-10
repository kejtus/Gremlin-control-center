import { useEffect, useState , useMemo} from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont} from '../accessibility';
import {
  CONTROLLABLE_DEVICES,
  SYSTEM_STATUS_DEVICES,
  classifySystemStatus,
  inferDevicePowerFromStatus,
  type AdsValues,
  type AudioFilterConfig,
  type ControllableDevice,
  type DevicePowerMap,
  type NoiseProfileStatus,
  type RobotStatus,
  type SystemStatusKind,
} from '../protocol';
import { colors, radii } from '../theme';

function kindColor(kind: SystemStatusKind, c: typeof colors): string {
  switch (kind) {
    case 'success':
      return c.ok;
    case 'dummy':
      return c.cyan;
    case 'fallback':
      return c.warn;
    case 'error':
      return c.danger;
    default:
      return c.muted;
  }
}

function kindBg(kind: SystemStatusKind, c: typeof colors): string {
  switch (kind) {
    case 'success':
      return c.accentSoft;
    case 'dummy':
      return c.accentSoft;
    case 'fallback':
      return c.accentSoft;
    case 'error':
      return c.dangerSoft;
    default:
      return c.bgRaised;
  }
}

const LABELS: Record<string, string> = {
  'OAK-D': 'Kamera OAK-D',
  LIDAR: 'Lidar',
  MIC: 'Mikrofon',
  SPEAKER: 'Głośnik',
  ADS1115: 'ADS1115 (akumulator)',
  I2C: 'I2C PWM',
  'SD-CARD': 'Karta SD',
};

function isControllable(device: string): device is ControllableDevice {
  return (CONTROLLABLE_DEVICES as readonly string[]).includes(device);
}

type Props = {
  online: boolean;
  robotStatus: RobotStatus | null;
  componentStatus: Record<string, string>;
  devicePower: DevicePowerMap;
  adsValues: AdsValues | null;
  noiseProfile: NoiseProfileStatus | null;
  audioFilter: AudioFilterConfig | null;
  encoderTicks: Record<string, number> | null;
  onPoll: () => void;
  onSetDevicePower: (device: ControllableDevice, enabled: boolean) => boolean;
};

function badge(text: string, kind: SystemStatusKind) {
  const { colors } = useAccessibility();
  const styles = useStyles();
  return (
    <View style={[styles.badge, { backgroundColor: kindBg(kind, colors) }]}>
      <Text style={[styles.badgeText, { color: kindColor(kind, colors) }]}>{text}</Text>
    </View>
  );
}

export function StatusTab({
  online,
  robotStatus,
  componentStatus,
  devicePower,
  adsValues,
  noiseProfile,
  audioFilter,
  encoderTicks,
  onPoll,
  onSetDevicePower,
}: Props) {
  const styles = useStyles();
  const [sendHint, setSendHint] = useState('');

  useEffect(() => {
    onPoll();
    const id = setInterval(onPoll, 2000);
    return () => clearInterval(id);
  }, [onPoll]);

  const toggleDevice = (device: ControllableDevice, enabled: boolean) => {
    const ok = onSetDevicePower(device, enabled);
    setSendHint(
      ok
        ? `Wysłano → ${device} ${enabled ? 'ON' : 'OFF'}`
        : 'Brak otwartego WS — najpierw połącz z Pi',
    );
  };

  const programOn = robotStatus?.programOn === true;
  const extra: { name: string; text: string; kind: SystemStatusKind }[] = [
    {
      name: 'Program',
      text: programOn ? 'ON' : 'OFF',
      kind: programOn ? 'success' : 'error',
    },
    {
      name: 'Akumulator',
      text:
        adsValues?.a0 != null
          ? `${adsValues.a0.toFixed(2)} V · ${Math.round(robotStatus?.batteryPct ?? 0)}%`
          : robotStatus
            ? `${Math.round(robotStatus.batteryPct)}%`
            : 'BRAK DANYCH',
      kind: adsValues?.a0 != null || robotStatus ? 'success' : 'unknown',
    },
    {
      name: 'Mikrofon · profil szumu',
      text: noiseProfile
        ? noiseProfile.is_calibrating
          ? 'KALIBRACJA'
          : noiseProfile.has_profile
            ? 'PROFIL OK'
            : 'BRAK PROFILU'
        : 'BRAK DANYCH',
      kind: noiseProfile?.is_calibrating
        ? 'fallback'
        : noiseProfile?.has_profile
          ? 'success'
          : noiseProfile
            ? 'dummy'
            : 'unknown',
    },
    {
      name: 'Mikrofon · filtry',
      text: audioFilter
        ? `lidar ${audioFilter.lidar_enabled ? 'ON' : 'OFF'} · silniki ${audioFilter.motor_enabled ? 'ON' : 'OFF'}`
        : 'BRAK DANYCH',
      kind: audioFilter ? 'success' : 'unknown',
    },
    {
      name: 'Enkodery',
      text: encoderTicks
        ? Object.entries(encoderTicks)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ') || '0'
        : 'BRAK DANYCH',
      kind: encoderTicks ? 'success' : 'unknown',
    },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Sterowanie komponentami</Text>
      <Text style={styles.hint}>
        Włącz / wyłącz kamerę, lidar, mikrofon i głośnik. App → Pi:{' '}
        <Text style={styles.mono}>
          {`{ type: "device_power_status", devices: { "OAK-D", "LIDAR", "MIC", "SPEAKER" } }`}
        </Text>
      </Text>
      {sendHint ? <Text style={styles.sendHint}>{sendHint}</Text> : null}

      <View style={styles.grid}>
        {SYSTEM_STATUS_DEVICES.map((device) => {
          const raw = componentStatus[device];
          const kind = raw ? classifySystemStatus(raw) : 'unknown';
          const controllable = isControllable(device);
          const inferred = inferDevicePowerFromStatus(raw);
          const on =
            controllable && devicePower[device] != null
              ? Boolean(devicePower[device])
              : inferred != null
                ? inferred
                : true;

          return (
            <View key={device} style={[styles.card, controllable && styles.cardCtrl]}>
              <View style={styles.cardTop}>
                <View style={styles.cardText}>
                  <Text style={styles.name}>{LABELS[device] || device}</Text>
                  <Text style={styles.code}>{device}</Text>
                </View>
                {controllable ? (
                  <Switch
                    value={on}
                    disabled={!online}
                    onValueChange={(v) => toggleDevice(device, v)}
                    trackColor={{ false: '#c8c8c8', true: 'rgba(60,180,75,0.55)' }}
                    thumbColor={on ? colors.ok : '#f4f4f4'}
                  />
                ) : null}
              </View>
              {badge(raw || 'BRAK DANYCH', kind)}
              {controllable ? (
                <A11yPressable
                  disabled={!online}
                  onPress={() => toggleDevice(device, !on)}
                  style={[styles.powerBtn, on ? styles.powerOn : styles.powerOff, !online && styles.powerDisabled]}
                >
                  <Text style={styles.powerBtnText}>{on ? 'Włączone' : 'Wyłączone'}</Text>
                </A11yPressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text style={styles.section}>Telemetria na żywo</Text>
      <View style={styles.grid}>
        {extra.map((item) => (
          <View key={item.name} style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            {badge(item.text, item.kind)}
          </View>
        ))}
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
    gap: 10,
    padding: 16,
  },
  section: {
    color: colors.ink,
    fontSize: a11yFont(16, textScale),
    fontWeight: '800',
    marginTop: 4,
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
  sendHint: {
    color: colors.cyan,
    fontFamily: 'monospace',
    fontSize: a11yFont(12, textScale),
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
    minWidth: 140,
  },
  cardCtrl: {
    borderColor: colors.cardBorder,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: a11yFont(14, textScale),
  },
  code: {
    color: colors.muted,
    fontSize: a11yFont(11, textScale),
    fontFamily: 'monospace',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: a11yFont(11, textScale),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  powerBtn: {
    alignSelf: 'stretch',
    borderRadius: radii.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  powerOn: {
    backgroundColor: 'rgba(60,180,75,0.18)',
  },
  powerOff: {
    backgroundColor: colors.dangerSoft,
  },
  powerDisabled: {
    opacity: 0.45,
  },
  powerBtnText: {
    fontWeight: '800',
    fontSize: a11yFont(12, textScale),
    color: colors.ink,
  },

      }),
    [colors, textScale],
  );
}

