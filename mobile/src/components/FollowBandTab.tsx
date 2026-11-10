import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { A11yPressable, a11yFont, useAccessibility } from '../accessibility';
import { useLayout } from '../layout';
import { getLanIp, getVideoSinkHost } from '../net/lanIp';
import { usesPcRelay } from '../net/runtime';
import { PROTOCOL, type RobotInfo } from '../protocol';
import { radii } from '../theme';
import { CameraPreview } from './CameraPreview';

type Props = {
  info: RobotInfo;
  online: boolean;
  /** Stan z telemetrii Pi (jeśli dostępny). */
  followBand?: boolean;
  onStream: (enabled: boolean) => void;
  onRegisterSink: (udpPort?: number, sinkHost?: string | null) => void;
  /** Włącza / wyłącza `set_follow_band_mode` (jak checkbox w CCC). */
  onFollowBands: (enabled: boolean) => void;
};

/**
 * Zakładka jak w Gremlin Control Center (OpenCV Kolor → „Podążaj za opaską”):
 * duży podgląd kamery + przełącznik trybu wizyjnego podążania za opaską / nogą.
 */
export function FollowBandTab({
  info,
  online,
  followBand,
  onStream,
  onRegisterSink,
  onFollowBands,
}: Props) {
  const styles = useStyles();
  const { announce, colors, prefs } = useAccessibility();
  const layout = useLayout();
  const [rotated, setRotated] = useState(false);
  const [following, setFollowing] = useState(Boolean(followBand));

  useEffect(() => {
    if (typeof followBand === 'boolean') setFollowing(followBand);
  }, [followBand]);

  const restartCam = () => {
    void (async () => {
      const host = usesPcRelay() ? await getVideoSinkHost() : await getLanIp();
      onRegisterSink(PROTOCOL.videoUdpPort, host);
      onStream(true);
      announce('Uruchamiam kamerę robota');
    })();
  };

  const setFollow = (enabled: boolean) => {
    if (!online) {
      announce('Najpierw połącz z robotem');
      return;
    }
    setFollowing(enabled);
    onFollowBands(enabled);
    announce(enabled ? 'Podążanie za opaską włączone' : 'Podążanie za opaską wyłączone');
  };

  return (
    <View
      style={styles.wrap}
      accessibilityLabel="Podążanie za opaską"
      accessibilityHint="Kamera na żywo i przełącznik chodzenia za nogą z opaską"
    >
      <View style={styles.preview}>
        <CameraPreview
          info={info}
          rotated={rotated}
          onStream={onStream}
          onRegisterSink={onRegisterSink}
        />
      </View>

      <View style={[styles.controls, layout.compact && { paddingVertical: 8, gap: 8 }]}>
        <View
          style={[
            styles.followRow,
            {
              borderColor: colors.line,
              backgroundColor: prefs.highContrast ? '#111' : colors.bg,
            },
          ]}
          accessible
          accessibilityRole="switch"
          accessibilityState={{ checked: following, disabled: !online }}
          accessibilityLabel="Podążaj za opaską"
          accessibilityHint="Robot jedzie za zielonym znacznikiem na nodze. Odznacz, żeby zatrzymać."
        >
          <View style={styles.followText}>
            <Text style={[styles.followTitle, { color: colors.ink }]}>Podążaj za opaską</Text>
            <Text style={[styles.followHint, { color: colors.muted }]}>
              Jak w Control Center — wizja kamery śledzi opaskę na nodze. Odznacz = stop.
            </Text>
          </View>
          <Switch
            value={following}
            onValueChange={setFollow}
            disabled={!online}
            accessibilityLabel="Podążaj za opaską"
            trackColor={{ false: colors.line, true: colors.ok }}
            thumbColor={following ? colors.accent : '#ccc'}
          />
        </View>

        <View style={styles.row}>
          <A11yPressable
            exploreId="follow-cam-start"
            accessibilityLabel="Start kamery"
            onPress={restartCam}
            style={styles.btn}
          >
            <Text style={styles.btnText}>Kamera</Text>
          </A11yPressable>
          <A11yPressable
            exploreId="follow-cam-rotate"
            accessibilityLabel={rotated ? 'Obrót obrazu wyłączony' : 'Obróć obraz o 180 stopni'}
            onPress={() => {
              setRotated((v) => {
                const next = !v;
                announce(next ? 'Obraz obrócony' : 'Obraz w normalnej orientacji');
                return next;
              });
            }}
            style={styles.btn}
          >
            <Text style={styles.btnText}>Obróć</Text>
          </A11yPressable>
          <A11yPressable
            exploreId="follow-stop"
            accessibilityLabel="Wyłącz podążanie i zatrzymaj"
            onPress={() => setFollow(false)}
            style={[styles.btn, styles.btnStop]}
          >
            <Text style={[styles.btnText, styles.btnStopText]}>Stop</Text>
          </A11yPressable>
        </View>
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
          flex: 1,
          minHeight: 0,
        },
        preview: {
          flex: 1,
          minHeight: 0,
        },
        controls: {
          paddingHorizontal: 12,
          paddingBottom: 10,
          paddingTop: 8,
          gap: 10,
        },
        followRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderWidth: 2,
          borderRadius: radii.md,
        },
        followText: {
          flex: 1,
          gap: 2,
        },
        followTitle: {
          fontWeight: '800',
          fontSize: a11yFont(16, textScale),
        },
        followHint: {
          fontSize: a11yFont(12, textScale),
          lineHeight: Math.round(16 * textScale),
        },
        row: {
          flexDirection: 'row',
          gap: 10,
        },
        btn: {
          flex: 1,
          backgroundColor: colors.button,
          borderRadius: radii.md,
          paddingVertical: 12,
          alignItems: 'center',
          minHeight: 48,
          justifyContent: 'center',
        },
        btnStop: {
          backgroundColor: colors.danger,
        },
        btnText: {
          color: colors.ink,
          fontWeight: '700',
          fontSize: a11yFont(14, textScale),
        },
        btnStopText: {
          color: '#fff',
        },
      }),
    [colors, textScale],
  );
}
