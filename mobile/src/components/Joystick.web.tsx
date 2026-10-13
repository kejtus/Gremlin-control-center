import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useAccessibility } from '../accessibility';
import { softenStickXY } from '../stickCurve';

type StickValue = { x: number; y: number };

type Props = {
  size?: number;
  disabled?: boolean;
  value?: StickValue | null;
  lockAxis?: 'x' | 'y';
  onChange: (x: number, y: number) => void;
  onActive?: (active: boolean) => void;
};

type PointerEv = {
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  nativeEvent?: { pointerId?: number; clientX?: number; clientY?: number };
  currentTarget: {
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
    getBoundingClientRect?: () => DOMRect;
  };
};

function point(ev: PointerEv) {
  const ne = ev.nativeEvent;
  return {
    id: ev.pointerId ?? ne?.pointerId ?? 0,
    x: ev.clientX ?? ne?.clientX ?? 0,
    y: ev.clientY ?? ne?.clientY ?? 0,
  };
}

export function Joystick({ size = 196, disabled, value, lockAxis, onChange, onActive }: Props) {
  const { colors, prefs } = useAccessibility();
  const radius = size / 2;
  const knob = Math.round(size * 0.3);
  const max = radius - knob / 2 - 4;
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const wrapRef = useRef<View>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const active = useRef<number | null>(null);

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
    if (active.current != null || !value) return;
    setNorm(value.x, value.y, false);
  }, [value, max, lockAxis]);

  const applyClient = (
    clientX: number,
    clientY: number,
    target?: { getBoundingClientRect?: () => DOMRect },
  ) => {
    const node =
      target?.getBoundingClientRect != null
        ? target
        : (wrapRef.current as unknown as { getBoundingClientRect?: () => DOMRect } | null);
    const rect = node?.getBoundingClientRect?.();
    if (!rect) return;
    let x = (clientX - (rect.left + rect.width / 2)) / max;
    let y = -((clientY - (rect.top + rect.height / 2)) / max);
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    setNorm(x, y, true);
  };

  const end = () => {
    active.current = null;
    setNorm(0, 0, true);
    onActiveRef.current?.(false);
  };

  const pointerProps = {
    onPointerDown: (ev: PointerEv) => {
      if (disabled) return;
      const p = point(ev);
      active.current = p.id;
      onActiveRef.current?.(true);
      ev.currentTarget.setPointerCapture?.(p.id);
      applyClient(p.x, p.y, ev.currentTarget);
    },
    onPointerMove: (ev: PointerEv) => {
      const p = point(ev);
      if (disabled || active.current !== p.id) return;
      applyClient(p.x, p.y, ev.currentTarget);
    },
    onPointerUp: (ev: PointerEv) => {
      const p = point(ev);
      ev.currentTarget.releasePointerCapture?.(p.id);
      end();
    },
    onPointerCancel: () => end(),
  };

  const baseBg = prefs.highContrast ? '#111' : '#ececec';
  const baseBorder = prefs.highContrast ? colors.ink : '#c8c8c8';
  const cross = prefs.highContrast ? 'rgba(255,204,0,0.35)' : 'rgba(61, 76, 92, 0.22)';
  const ring = prefs.highContrast ? 'rgba(255,204,0,0.45)' : 'rgba(61, 76, 92, 0.28)';

  return (
    <View
      ref={wrapRef}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: baseBg,
          borderColor: baseBorder,
          // @ts-expect-error web-only
          touchAction: 'none',
        },
      ]}
      {...(pointerProps as object)}
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
    userSelect: 'none' as const,
    cursor: 'pointer' as const,
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
  },
});
