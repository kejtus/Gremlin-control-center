import { createElement, useEffect, useRef } from 'react';
import type { LidarPoint } from '../lidar';

type Props = {
  points: LidarPoint[];
  rangeM?: number;
  size?: number;
};

/** Widok z góry (XY) — canvas na web. */
export function LidarRadar({ points, rangeM = 8 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 320;
    const h = parent?.clientHeight || 320;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scale = (Math.min(w, h) * 0.46) / rangeM;

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let r = 2; r <= rangeM; r += 2) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx, h - 8);
    ctx.moveTo(8, cy);
    ctx.lineTo(w - 8, cy);
    ctx.stroke();

    // Przód = -Y w typowym układzie LiDAR → rysujemy w górę ekranu.
    for (const p of points) {
      const px = cx + p.x * scale;
      const py = cy - p.y * scale;
      ctx.fillStyle = p.color || '#5dffb0';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }

    ctx.fillStyle = '#7eb6d4';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx - 7, cy + 8);
    ctx.lineTo(cx + 7, cy + 8);
    ctx.closePath();
    ctx.fill();
  }, [points, rangeM]);

  return createElement('canvas', {
    ref: canvasRef,
    style: { width: '100%', height: '100%', display: 'block', background: '#0d1117' },
  });
}
