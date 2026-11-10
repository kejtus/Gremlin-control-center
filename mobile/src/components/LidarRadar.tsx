import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LidarPoint } from '../lidar';

type Props = {
  points: LidarPoint[];
  rangeM?: number;
  size: number;
};

const MAX_DOTS = 520;

/** Widok z góry (XY po tilt CCC) — kropki View, kolor = intensywność. */
export function LidarRadar({ points, rangeM = 8, size }: Props) {
  const scale = (size * 0.46) / Math.max(0.5, rangeM);
  const cx = size / 2;
  const cy = size / 2;

  const dots = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / MAX_DOTS));
    const out: { key: string; left: number; top: number; color: string }[] = [];
    for (let i = 0; i < points.length; i += step) {
      const p = points[i]!;
      // Układ jak CCC top-down: X w prawo, Y (tilted) w górę ekranu.
      const left = cx + p.x * scale - 1.5;
      const top = cy - p.y * scale - 1.5;
      if (left < -4 || top < -4 || left > size || top > size) continue;
      out.push({ key: `${i}`, left, top, color: p.color || '#5dffb0' });
    }
    return out;
  }, [points, scale, cx, cy, size]);

  const ringStep = rangeM <= 4 ? 1 : 2;
  const rings: number[] = [];
  for (let r = ringStep; r <= rangeM + 0.01; r += ringStep) rings.push(r);

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
    width: 3,
    height: 3,
    borderRadius: 1.5,
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
