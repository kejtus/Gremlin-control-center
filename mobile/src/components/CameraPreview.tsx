import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isUiPreview } from '../demo';
import { getLanIp, getVideoSinkHost } from '../net/lanIp';
import { usesPcRelay } from '../net/runtime';
import { createFramePump } from '../net/jpegFrames';
import { openVideoIngress, type VideoLink } from '../net/udpVideo';
import { PROTOCOL, type RobotInfo } from '../protocol';
import { DemoCameraScene } from './DemoCameraScene';
import { JpegSwap, type JpegSwapHandle } from './JpegSwap';

type Props = {
  info: RobotInfo;
  height?: number;
  rotated?: boolean;
  onStream: (enabled: boolean) => void;
  onRegisterSink: (udpPort: number, sinkHost?: string | null) => void;
};

export function CameraPreview({ info, height, rotated, onStream, onRegisterSink }: Props) {
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<VideoLink | null>(null);
  const swapRef = useRef<JpegSwapHandle | null>(null);
  const liveRef = useRef(false);
  const demo = isUiPreview(info);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    let noFrameTimer: ReturnType<typeof setTimeout> | null = null;
    let sinkPulse: ReturnType<typeof setInterval> | null = null;
    const port = PROTOCOL.videoUdpPort;
    const pump = createFramePump((jpeg) => {
      swapRef.current?.push(jpeg);
    });

    let started = false;
    let sinkHost: string | null = null;
    const startSink = async () => {
      if (cancelled) return;
      sinkHost = usesPcRelay() ? await getVideoSinkHost() : await getLanIp();
      if (cancelled) return;
      onRegisterSink(port, sinkHost);
      onStream(true);
      if (!started) {
        started = true;
        // Expo Go / proxy: Pi czasem gubi sink — odświeżaj co kilka s (tylko LAN).
        if (usesPcRelay()) {
          sinkPulse = setInterval(() => {
            if (cancelled || !sinkHost) return;
            onRegisterSink(port, sinkHost);
            onStream(true);
          }, 4000);
        }
      }
      if (!noFrameTimer) {
        noFrameTimer = setTimeout(() => {
          if (cancelled || liveRef.current) return;
          const hint = usesPcRelay()
            ? `Mostek OK, brak klatek UDP na PC:${port}. Pi (${info.host}) i PC w tej samej Wi‑Fi. Sink: ${sinkHost || '?'}.`
            : `Brak klatek UDP na telefon:${port}. Sprawdź, czy Pi wysyła stream (OAK-D włączone).`;
          setError(hint);
        }, 4500);
      }
    };

    const link = openVideoIngress(
      port,
      (jpeg) => {
        if (cancelled) return;
        pump.push(jpeg);
        if (!liveRef.current) {
          liveRef.current = true;
          setLive(true);
          setError(null);
          if (noFrameTimer) {
            clearTimeout(noFrameTimer);
            noFrameTimer = null;
          }
        }
      },
      (ev) => {
        if (cancelled) return;
        if (ev.type === 'open') {
          setError(null);
          void startSink();
        }
        if (ev.type === 'error') setError(ev.message ?? 'Kamera niedostępna');
        if (ev.type === 'close') {
          liveRef.current = false;
          setLive(false);
        }
      },
    );
    if (link) {
      linkRef.current = link;
      if (link.mode === 'udp') void startSink();
      setTimeout(() => {
        void startSink();
      }, 800);
    }

    return () => {
      cancelled = true;
      if (noFrameTimer) clearTimeout(noFrameTimer);
      if (sinkPulse) clearInterval(sinkPulse);
      onStream(false);
      pump.close();
      linkRef.current?.close();
      linkRef.current = null;
    };
  }, [demo, info.host, onRegisterSink, onStream]);

  const frameStyle = height ? [styles.frame, { height }] : [styles.frame, styles.fill];

  if (demo) {
    return (
      <View style={[frameStyle, rotated && { transform: [{ rotate: '180deg' }] }]}>
        <DemoCameraScene height={height ?? 240} />
      </View>
    );
  }

  return (
    <View style={frameStyle}>
      <JpegSwap ref={swapRef} height={height} rotated={rotated} />
      {!live ? (
        <Text style={styles.placeholder}>{error ?? 'Oczekiwanie na kamerę…'}</Text>
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
