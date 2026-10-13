import { useState, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { A11yPressable, a11yFont, useAccessibility } from '../accessibility';
import { useLayout } from '../layout';
import { getLanIp, getVideoSinkHost } from '../net/lanIp';
import { usesPcRelay } from '../net/runtime';
import { PROTOCOL, type RobotInfo } from '../protocol';
import { radii } from '../theme';
import { CameraPreview } from './CameraPreview';

type Props = {
  info: RobotInfo;
  onStream: (enabled: boolean) => void;
  onRegisterSink: (udpPort: number, sinkHost?: string | null) => void;
};

export function CameraTab({ info, onStream, onRegisterSink }: Props) {
  const styles = useStyles();
  const [rotated, setRotated] = useState(false);
  const layout = useLayout();

  const restart = () => {
    void (async () => {
      const host = usesPcRelay() ? await getVideoSinkHost() : await getLanIp();
      onRegisterSink(PROTOCOL.videoUdpPort, host);
      onStream(true);
    })();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.preview}>
        <CameraPreview
          info={info}
          rotated={rotated}
          onStream={onStream}
          onRegisterSink={onRegisterSink}
        />
      </View>
      <View style={[styles.row, layout.compact && { padding: 8, gap: 8 }]}>
        <A11yPressable onPress={restart} style={[styles.btn, layout.compact && { paddingVertical: 8 }]}>
          <Text style={styles.btnText}>Start</Text>
        </A11yPressable>
        <A11yPressable onPress={() => onStream(false)} style={styles.btn}>
          <Text style={styles.btnText}>Stop</Text>
        </A11yPressable>
        <A11yPressable onPress={() => setRotated((v) => !v)} style={styles.btn}>
          <Text style={styles.btnText}>Obróć</Text>
        </A11yPressable>
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
        row: {
          flexDirection: 'row',
          gap: 10,
          padding: 12,
        },
        btn: {
          flex: 1,
          backgroundColor: colors.button,
          borderRadius: radii.md,
          paddingVertical: 12,
          alignItems: 'center',
        },
        btnText: {
          color: colors.ink,
          fontWeight: '700',
          fontSize: a11yFont(14, textScale),
        },
      }),
    [colors, textScale],
  );
}
