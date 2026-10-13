import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { bytesToDataUri, isCompleteJpeg } from '../net/jpegFrames';

export type JpegSwapHandle = {
  push: (bytes: Uint8Array) => void;
};

type Props = {
  height?: number;
  rotated?: boolean;
};

/**
 * Dwie warstwy — nowa klatka ładuje się z tyłu, potem wchodzi na wierzch.
 * Widoczna warstwa nigdy nie dostaje pustego source (to było czarne mryganie).
 */
export const JpegSwap = forwardRef<JpegSwapHandle, Props>(function JpegSwap({ height, rotated }, ref) {
  const [uris, setUris] = useState<[string | null, string | null]>([null, null]);
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const pending = useRef<Uint8Array | null>(null);
  const busy = useRef(false);
  const loading = useRef<number | null>(null);

  const loadHidden = (bytes: Uint8Array) => {
    if (!isCompleteJpeg(bytes)) {
      busy.current = false;
      const next = pending.current;
      pending.current = null;
      if (next) loadHidden(next);
      return;
    }
    busy.current = true;
    const hidden = 1 - frontRef.current;
    loading.current = hidden;
    const uri = bytesToDataUri(bytes);
    setUris((prev) => {
      const next: [string | null, string | null] = [prev[0], prev[1]];
      next[hidden] = uri;
      return next;
    });
  };

  const onReady = (index: number) => {
    if (loading.current !== index) return;
    loading.current = null;
    frontRef.current = index;
    setFront(index);
    busy.current = false;
    const next = pending.current;
    pending.current = null;
    if (next) loadHidden(next);
  };

  useImperativeHandle(ref, () => ({
    push(bytes: Uint8Array) {
      pending.current = bytes;
      if (!busy.current) {
        const next = pending.current;
        pending.current = null;
        if (next) loadHidden(next);
      }
    },
  }));

  const box = height ? { width: '100%' as const, height, backgroundColor: '#000' } : stylesFill;

  return (
    <View style={box}>
      {uris.map((uri, i) =>
        uri ? (
          <Image
            key={i}
            fadeDuration={0}
            source={{ uri }}
            resizeMode="contain"
            onLoad={() => onReady(i)}
            onError={() => {
              if (loading.current === i) {
                loading.current = null;
                busy.current = false;
                pending.current = null;
              }
            }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: i === front ? 2 : 1,
              transform: rotated ? [{ rotate: '180deg' }] : undefined,
            }}
          />
        ) : null,
      )}
    </View>
  );
});

const stylesFill = {
  width: '100%' as const,
  flex: 1,
  minHeight: 0,
  backgroundColor: '#000',
};
