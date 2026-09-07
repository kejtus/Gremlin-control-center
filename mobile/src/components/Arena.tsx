import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import type { RobotStatus } from '../protocol';

type Props = {
  status: RobotStatus | null;
  compact?: boolean;
};

export function Arena({ status, compact }: Props) {
  const w = compact ? 132 : 220;
  const h = compact ? 132 : 220;
  const arenaW = status?.arena.width ?? 10;
  const arenaH = status?.arena.height ?? 10;
  const x = status?.pose.x ?? arenaW / 2;
  const y = status?.pose.y ?? arenaH / 2;
  const heading = status?.pose.heading ?? 0;
  const left = (x / arenaW) * (w - 18);
  const top = (1 - y / arenaH) * (h - 18);

  return (
    <View style={[styles.box, { width: w, height: h }]}>
      <View style={styles.grid} />
      <View
        style={[
          styles.bot,
          {
            left,
            top,
            transform: [{ rotate: `${-(heading * 180) / Math.PI}deg` }],
          },
        ]}
      >
        <View style={styles.nose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#0b0f14',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.08)',
    margin: 16,
    borderRadius: 8,
  },
  bot: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    backgroundColor: colors.accent,
    borderRadius: 4,
    alignItems: 'center',
  },
  nose: {
    marginTop: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.cyan,
  },
});
