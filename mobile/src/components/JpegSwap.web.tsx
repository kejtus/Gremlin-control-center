import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { isCompleteJpeg } from '../net/jpegFrames';

export type JpegSwapHandle = {
  push: (bytes: Uint8Array) => void;
};

type Props = {
  height?: number;
  rotated?: boolean;
};

/**
 * Canvas + createImageBitmap: nowa klatka maluje się na poprzedniej.
 * Żadnego img.src / opacity — to dawało czarne mryganie.
 */
export const JpegSwap = forwardRef<JpegSwapHandle, Props>(function JpegSwap({ height, rotated }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pending = useRef<Uint8Array | null>(null);
  const busy = useRef(false);
  const closed = useRef(false);

  const draw = async () => {
    if (busy.current || closed.current) return;
    const bytes = pending.current;
    pending.current = null;
    if (!bytes) return;
    if (!isCompleteJpeg(bytes)) {
      if (pending.current) void draw();
      return;
    }
    busy.current = true;
    try {
      const blob = new Blob([bytes.slice()], { type: 'image/jpeg' });
      if (typeof createImageBitmap !== 'function') return;
      const bmp = await createImageBitmap(blob);
      if (closed.current) {
        bmp.close();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        bmp.close();
        return;
      }
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
      }
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) ctx.drawImage(bmp, 0, 0);
      bmp.close();
    } catch {
      /* zostaw ostatnią dobrą klatkę */
    } finally {
      busy.current = false;
      if (pending.current && !closed.current) void draw();
    }
  };

  useImperativeHandle(ref, () => ({
    push(bytes: Uint8Array) {
      pending.current = bytes;
      void draw();
    },
  }));

  useEffect(
    () => () => {
      closed.current = true;
    },
    [],
  );

  return createElement(
    'div',
    {
      style: {
        width: '100%',
        height: height ?? '100%',
        flex: height ? undefined : 1,
        minHeight: 0,
        position: 'relative',
        backgroundColor: '#000',
        overflow: 'hidden',
      },
    },
    createElement('canvas', {
      ref: canvasRef,
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        transform: rotated ? 'rotate(180deg)' : 'none',
      },
    }),
  );
});
