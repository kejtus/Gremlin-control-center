import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useAccessibility } from '../accessibility';
import { softenStickXY } from '../stickCurve';

export type StickValue = { x: number; y: number };

type Props = {
  size?: number;
  disabled?: boolean;
  /** Zewnętrzna pozycja (-1…1, y w górę) — pad na Pi. */
  value?: StickValue | null;
  /** 'x' = tylko lewo/prawo (obrót). */
  lockAxis?: 'x' | 'y';
  onChange: (x: number, y: number) => void;
  onActive?: (active: boolean) => void;
};

/** Drążek: cały pad, pozycja od środka. `value` rusza gałką gdy nie trzymasz palca. */
export function Joystick({ size = 196, disabled, value, lockAxis, onChange, onActive }: Props) {
  const { colors, prefs } = useAccessibility();
  const radius = size / 2;
  const knob = Math.round(size * 0.3);
  const max = radius - knob / 2 - 4;
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const grabbing = useRef(false);

  const setNorm = (nx: number, ny: number, emit: boolean) => {
    let x = Math.max(-1, Math.min(1, nx));
    let y = Math.max(-1, Math.min(1, ny));
    if (lockAxis === 'x') y = 0;
    if (lockAxis === 'y') x = 0;
    pos.setValue({ x: x * max, y: -y * max });
    if (emit) {
      const soft = softenStickXY(x, y);
      onChangeRef.current(soft.x, soft.y);
    }
  };

  useEffect(() => {
    if (grabbing.current || !value) return;
    setNorm(value.x, value.y, false);
  }, [value, max, lockAxis]);

  const applyLocal = (lx: number, ly: number) => {
    let x = (lx - radius) / max;
    let y = -((ly - radius) / max);
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    setNorm(x, y, true);
  };

  const begin = () => {
    grabbing.current = true;
    onActiveRef.current?.(true);
  };

  const end = () => {
    grabbing.current = false;
    setNorm(0, 0, true);
    onActiveRef.current?.(false);
  };

  const baseBg = prefs.highContrast ? '#111' : '#ececec';
  const baseBorder = prefs.highContrast ? colors.ink : '#c8c8c8';
  const cross = prefs.highContrast ? 'rgba(255,204,0,0.35)' : 'rgba(61, 76, 92, 0.22)';
  const ring = prefs.highContrast ? 'rgba(255,204,0,0.45)' : 'rgba(61, 76, 92, 0.28)';

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: baseBg,
          borderColor: baseBorder,
        },
      ]}
      pointerEvents={disabled ? 'none' : 'auto'}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onStartShouldSetResponderCapture={() => !disabled}
      onResponderGrant={(e) => {
        begin();
        applyLocal(e.nativeEvent.locationX, e.nativeEvent.locationY);
      }}
      onResponderMove={(e) => applyLocal(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onResponderRelease={end}
      onResponderTerminate={end}
    >
      <View pointerEvents="none" style={[styles.crossV, { height: size - 28, backgroundColor: cross }]} />
      <View pointerEvents="none" style={[styles.crossH, { width: size - 28, backgroundColor: cross }]} />
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          { width: size - 18, height: size - 18, borderRadius: (size - 18) / 2, borderColor: ring },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.knob,
          {
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            backgroundColor: colors.tabBar,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  crossV: {
    position: 'absolute',
    width: 1,
  },
  crossH: {
    position: 'absolute',
    height: 1,
  },
  knob: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
