import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccessibility } from '../accessibility';
import { isUiPreview } from '../demo';
import { publishCameraFrame, subscribeCameraFrames } from '../net/cameraFrames';
import { createFramePump } from '../net/jpegFrames';
import { getLanIp, getVideoSinkHost } from '../net/lanIp';
import { usesPcRelay } from '../net/runtime';
import { openVideoIngress, type VideoLink } from '../net/udpVideo';
import { udpSocketAvailable } from '../net/udpSocket';
import { PROTOCOL, robotHostname, type RobotInfo } from '../protocol';
import { DemoCameraScene } from './DemoCameraScene';
import { JpegSwap, type JpegSwapHandle } from './JpegSwap';

type Props = {
  info: RobotInfo;
  height?: number;
  rotated?: boolean;
  onStream: (enabled: boolean) => void;
  onRegisterSink: (udpPort: number, sinkHost?: string | null) => void;
};

/**
 * APK: Pi → UDP JPEG → tablet :9000 (sink = IP tabletu).
 * Expo Go: mostek PC. Zapas APK bez UDP: panel :3000/video + sink = IP Pi.
 */
export function CameraPreview({ info, height, rotated, onStream, onRegisterSink }: Props) {
  const { announce } = useAccessibility();
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swapRef = useRef<JpegSwapHandle | null>(null);
  const linkRef = useRef<VideoLink | null>(null);
  const liveRef = useRef(false);
  const demo = isUiPreview(info);
  const announceRef = useRef(announce);
  announceRef.current = announce;
  const piHost = robotHostname(info.host);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    let noFrameTimer: ReturnType<typeof setTimeout> | null = null;
    let pulse: ReturnType<typeof setInterval> | null = null;
    let sinkHost: string | null = null;

    const pump = createFramePump((jpeg) => {
      swapRef.current?.push(jpeg);
    });

    const onJpeg = (jpeg: Uint8Array) => {
      if (cancelled) return;
      pump.push(jpeg);
      if (!liveRef.current) {
        liveRef.current = true;
        setLive(true);
        setError(null);
        announceRef.current('Kamera działa — obraz na żywo');
        if (noFrameTimer) {
          clearTimeout(noFrameTimer);
          noFrameTimer = null;
        }
      }
    };

    const unsub = subscribeCameraFrames(onJpeg);

    const link = openVideoIngress(
      PROTOCOL.videoUdpPort,
      (jpeg) => publishCameraFrame(jpeg),
      (ev) => {
        if (cancelled) return;
        if (ev.type === 'open') setError(null);
        if (ev.type === 'error' && ev.message && !liveRef.current) {
          /* czekamy na klatki / drugi tor */
        }
      },
      piHost,
    );
    linkRef.current = link;
    const mode = link?.mode ?? 'bridge';

    const resolveSink = async (): Promise<string | null> => {
      if (usesPcRelay()) return getVideoSinkHost();
      if (mode === 'udp' || udpSocketAvailable()) return getLanIp();
      return piHost;
    };

    const arm = async () => {
      if (cancelled) return;
      sinkHost = await resolveSink();
      if (cancelled) return;
      onStream(true);
      onRegisterSink(PROTOCOL.videoUdpPort, sinkHost);
    };
    void arm();
    setTimeout(() => void arm(), 600);
    pulse = setInterval(() => void arm(), 3000);

    noFrameTimer = setTimeout(() => {
      if (cancelled || liveRef.current) return;
      setError(
        mode === 'udp'
          ? `Brak UDP JPEG na tablecie :${PROTOCOL.videoUdpPort}. Sink: ${sinkHost || '?'}. Pi i tablet w tej samej Wi‑Fi, stream ON.`
          : `Brak klatek (WS/UDP). Pi ${piHost}, panel :3000 albo UDP :9000.`,
      );
    }, 7000);

    return () => {
      cancelled = true;
      unsub();
      if (noFrameTimer) clearTimeout(noFrameTimer);
      if (pulse) clearInterval(pulse);
      onStream(false);
      linkRef.current?.close();
      linkRef.current = null;
      pump.close();
      liveRef.current = false;
    };
  }, [demo, piHost, onRegisterSink, onStream]);

  const frameStyle = height ? [styles.frame, { height }] : [styles.frame, styles.fill];

  if (demo) {
    return (
      <View style={[frameStyle, rotated && { transform: [{ rotate: '180deg' }] }]}>
        <DemoCameraScene height={height ?? 240} />
      </View>
    );
  }

  return (
    <View
      style={frameStyle}
      accessible
      accessibilityLabel={
        live
          ? 'Podgląd kamery — obraz na żywo'
          : error
            ? `Kamera: ${error}`
            : 'Oczekiwanie na obraz z kamery'
      }
      accessibilityLiveRegion="polite"
    >
      <JpegSwap ref={swapRef} height={height} rotated={rotated} />
      {!live ? (
        <Text style={styles.placeholder} accessibilityRole="text">
          {error ?? 'Oczekiwanie na kamerę…'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    flex: 1,
    minHeight: 0,
  },
  placeholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '42%',
    color: '#ddd',
    paddingHorizontal: 16,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
