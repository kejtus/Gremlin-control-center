import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LidarPoint } from '../lidar';

type Props = {
  points: LidarPoint[];
  rangeM?: number;
  size: number;
};

/** Widok z góry bez natywnego canvas — kropki jako View (zdecymowane). */
export function LidarRadar({ points, rangeM = 8, size }: Props) {
  const scale = (size * 0.46) / rangeM;
  const cx = size / 2;
  const cy = size / 2;

  const dots = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / 160));
    const out: { key: string; left: number; top: number; color: string }[] = [];
    for (let i = 0; i < points.length; i += step) {
      const p = points[i];
      const left = cx + p.x * scale - 2;
      const top = cy - p.y * scale - 2;
      if (left < -4 || top < -4 || left > size || top > size) continue;
      out.push({ key: `${i}`, left, top, color: p.color || '#5dffb0' });
    }
    return out;
  }, [points, scale, cx, cy, size]);

  const rings = [2, 4, 6, 8].filter((r) => r <= rangeM);

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {rings.map((r) => (
        <View
          key={r}
          style={[
            styles.ring,
            {
              width: r * scale * 2,
              height: r * scale * 2,
              borderRadius: r * scale,
              left: cx - r * scale,
              top: cy - r * scale,
            },
          ]}
        />
      ))}
      <View style={[styles.axisV, { left: cx, height: size }]} />
      <View style={[styles.axisH, { top: cy, width: size }]} />
      {dots.map((d) => (
        <View
          key={d.key}
          style={[styles.dot, { left: d.left, top: d.top, backgroundColor: d.color }]}
        />
      ))}
      <View style={[styles.bot, { left: cx - 6, top: cy - 8 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#0d1117',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  axisV: {
    position: 'absolute',
    width: 1,
    top: 0,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  axisH: {
    position: 'absolute',
    height: 1,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  bot: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#7eb6d4',
  },
});
