import { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  size?: number;
  disabled?: boolean;
  onChange: (x: number, y: number) => void;
};

export function Joystick({ size = 196, disabled, onChange }: Props) {
  const radius = size / 2;
  const knob = Math.round(size * 0.34);
  const max = radius - knob / 2 - 6;
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_, g) => {
          const x = Math.max(-max, Math.min(max, g.dx));
          const y = Math.max(-max, Math.min(max, g.dy));
          pos.setValue({ x, y });
          onChange(x / max, -y / max);
        },
        onPanResponderRelease: () => {
          Animated.spring(pos, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            bounciness: 8,
            speed: 18,
          }).start();
          onChange(0, 0);
        },
        onPanResponderTerminate: () => {
          pos.setValue({ x: 0, y: 0 });
          onChange(0, 0);
        },
      }),
    [disabled, max, onChange, pos],
  );

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: radius }]}>
      <View style={[styles.crossV, { height: size - 28 }]} />
      <View style={[styles.crossH, { width: size - 28 }]} />
      <View style={[styles.ring, { width: size - 18, height: size - 18, borderRadius: (size - 18) / 2 }]} />
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.knob,
          {
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            opacity: disabled ? 0.35 : 1,
            transform: pos.getTranslateTransform(),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#0c1016',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.18)',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(139, 150, 168, 0.28)',
  },
  crossH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(139, 150, 168, 0.28)',
  },
  knob: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
