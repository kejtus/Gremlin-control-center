import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccessibility, a11yFont } from '../accessibility';
import {
  cccLegacyTilt,
  ESP_CAM_DEFAULT,
  ESP_TILT_LEVEL,
  getLidarViewPrefsSync,
  loadLidarViewPrefs,
  saveLidarViewPrefs,
  type LidarViewPrefs,
} from '../lidarViewPrefs';
import { openEspLidarWs, type EspLidarWsLink } from '../net/espLidarWs';
import { PROTOCOL } from '../protocol';
import { radii } from '../theme';
import { control, makeUi, space } from '../ui';
import { LidarCloud3D, type LidarCloudHandle } from './LidarCloud3D';

type Props = {
  /** Host Pi (IP) — WS esp_lidar. */
  host: string | null;
  online: boolean;
  preview?: boolean;
};

export function LidarTab({ host, online, preview }: Props) {
  const styles = useStyles();
  const { colors, prefs } = useAccessibility();
  const ui = useMemo(() => makeUi(colors, prefs.highContrast), [colors, prefs.highContrast]);
  const cloudRef = useRef<LidarCloudHandle>(null);
  const linkRef = useRef<EspLidarWsLink | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const boot = getLidarViewPrefsSync();
  const [view, setView] = useState<LidarViewPrefs>(boot);
  const [flat, setFlat] = useState<Float32Array | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [status, setStatus] = useState('Rozłączono');
  const [fps, setFps] = useState<number | null>(null);
  const [clearToken, setClearToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadLidarViewPrefs().then((v) => {
      if (cancelled) return;
      setView(v);
      cloudRef.current?.setTilt(v.tilt.x, v.tilt.y, v.tilt.z);
      cloudRef.current?.setCamera(v.cam.yaw, v.cam.pitch, v.cam.dist);
    });
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const persist = useCallback((next: LidarViewPrefs) => {
    setView(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveLidarViewPrefs(next);
    }, 200);
  }, []);

  const applyTilt = useCallback(
    (tilt: { x: number; y: number; z: number }) => {
      const next = { ...view, tilt: { ...tilt } };
      persist(next);
      cloudRef.current?.setTilt(tilt.x, tilt.y, tilt.z);
    },
    [persist, view],
  );

  const onViewChange = useCallback(
    (next: LidarViewPrefs) => {
      persist(next);
    },
    [persist],
  );

  useEffect(() => {
    if (!online || preview || !host) {
      linkRef.current?.close();
      linkRef.current = null;
      setStatus(preview ? 'Podgląd UI (brak WS)' : 'Brak hosta Pi');
      setFlat(null);
      setPointCount(0);
      return;
    }

    const link = openEspLidarWs(host, {
      onScan: (frame) => {
        if (frame.pointCount === 0) {
          setFlat(new Float32Array(0));
          setPointCount(0);
          return;
        }
        setFlat(frame.flat);
        setPointCount(frame.pointCount);
      },
      onStatus: (s, detail) => {
        if (s === 'connecting') setStatus(`Łączenie… ${detail || ''}`);
        else if (s === 'open') setStatus(`WS :${PROTOCOL.espLidarWsPort}`);
        else if (s === 'closed') setStatus('Rozłączono — ponawiam…');
        else if (s === 'error') setStatus(detail || 'Błąd WS');
      },
      onMetrics: (m) => {
        if (typeof m.fps === 'number') setFps(m.fps);
      },
    });
    linkRef.current = link;
    return () => {
      link.close();
      linkRef.current = null;
    };
  }, [host, online, preview]);

  const nudge = (axis: 'x' | 'y' | 'z', delta: number) => {
    applyTilt({
      ...view.tilt,
      [axis]: Math.round((view.tilt[axis] + delta) * 10) / 10,
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>ESP LiDAR</Text>
          <Text style={styles.hint} numberOfLines={2}>
            {status}
            {host ? ` · ${host}` : ''}
            {fps != null ? ` · ${fps.toFixed(0)} fps` : ''}
          </Text>
        </View>
        <Text style={styles.meta}>
          {pointCount > 0 ? `${pointCount.toLocaleString('pl-PL')} pkt` : '—'}
        </Text>
      </View>

      <View style={styles.viewWrap}>
        <LidarCloud3D
          ref={cloudRef}
          flat={flat}
          clearToken={clearToken}
          initialView={view}
          onViewChange={onViewChange}
        />
      </View>

      <Text style={styles.section}>Korekta montażu (°) — zapamiętywana</Text>
      <View style={styles.tiltRow}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <View key={axis} style={styles.tiltCol}>
            <Text style={styles.tiltLabel}>{axis.toUpperCase()}</Text>
            <View style={styles.tiltBtns}>
              <Pressable onPress={() => nudge(axis, -5)} style={[ui.chip, styles.tiltBtn]}>
                <Text style={ui.chipText}>−5</Text>
              </Pressable>
              <Text style={styles.tiltVal}>{view.tilt[axis]}</Text>
              <Pressable onPress={() => nudge(axis, 5)} style={[ui.chip, styles.tiltBtn]}>
                <Text style={ui.chipText}>+5</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.tools}>
        <Pressable
          onPress={() => {
            const next = {
              tilt: { ...ESP_TILT_LEVEL },
              cam: { ...ESP_CAM_DEFAULT },
            };
            persist(next);
            cloudRef.current?.setTilt(next.tilt.x, next.tilt.y, next.tilt.z);
            cloudRef.current?.setCamera(next.cam.yaw, next.cam.pitch, next.cam.dist);
          }}
          style={[ui.chip, styles.tool]}
        >
          <Text style={ui.chipText}>Poziom</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const tilt = cccLegacyTilt();
            applyTilt(tilt);
          }}
          style={[ui.chip, styles.tool]}
        >
          <Text style={ui.chipText}>CCC −122</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const cam = { ...ESP_CAM_DEFAULT };
            const next = { ...view, cam };
            persist(next);
            cloudRef.current?.setCamera(cam.yaw, cam.pitch, cam.dist);
          }}
          style={[ui.chip, styles.tool]}
        >
          <Text style={ui.chipText}>Kamera</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setClearToken((t) => t + 1);
            setFlat(null);
            setPointCount(0);
          }}
          style={[ui.chip, styles.tool]}
        >
          <Text style={ui.chipText}>Wyczyść</Text>
        </Pressable>
      </View>
    </View>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          minHeight: 0,
          padding: space.md,
          gap: space.sm,
        },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          minHeight: control.heightSm,
        },
        title: {
          color: colors.ink,
          fontSize: a11yFont(18, textScale),
          fontWeight: '700',
        },
        hint: {
          color: colors.muted,
          fontSize: a11yFont(11, textScale),
          marginTop: 2,
        },
        meta: {
          color: colors.muted,
          fontSize: a11yFont(12, textScale),
          fontWeight: '600',
        },
        viewWrap: {
          flex: 1,
          minHeight: 0,
          borderRadius: radii.md,
          overflow: 'hidden',
          backgroundColor: '#0a0c10',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
        },
        section: {
          color: colors.muted,
          fontSize: a11yFont(12, textScale),
          fontWeight: '600',
        },
        tiltRow: {
          flexDirection: 'row',
          gap: 6,
        },
        tiltCol: {
          flex: 1,
          gap: 4,
        },
        tiltLabel: {
          color: colors.ink,
          fontSize: a11yFont(11, textScale),
          fontWeight: '700',
          textAlign: 'center',
        },
        tiltBtns: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        tiltBtn: {
          flex: 1,
          minHeight: 36,
        },
        tiltVal: {
          width: 36,
          textAlign: 'center',
          color: colors.ink,
          fontSize: a11yFont(11, textScale),
          fontWeight: '700',
        },
        tools: {
          flexDirection: 'row',
          gap: 6,
        },
        tool: {
          flex: 1,
          minHeight: 40,
        },
      }),
    [colors, textScale],
  );
}
