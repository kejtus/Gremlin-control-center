import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createElement } from 'react';
import { LIDAR_GL_HTML } from '../lidarGlHtml';
import type { LidarViewPrefs } from '../lidarViewPrefs';
import type { LidarCloudHandle } from './LidarCloud3D';

type Props = {
  flat: Float32Array | number[] | null;
  clearToken?: number;
  initialView?: LidarViewPrefs | null;
  onViewChange?: (view: LidarViewPrefs) => void;
};

export const LidarCloud3D = forwardRef<LidarCloudHandle, Props>(function LidarCloud3D(
  { flat, clearToken = 0, initialView = null, onViewChange },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const lastClear = useRef(clearToken);
  const initialViewRef = useRef(initialView);
  initialViewRef.current = initialView;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  const post = (payload: object) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), '*');
  };

  const applyInitialView = () => {
    const v = initialViewRef.current;
    if (!v) return;
    post({ type: 'tilt', x: v.tilt.x, y: v.tilt.y, z: v.tilt.z });
    post({ type: 'cam', yaw: v.cam.yaw, pitch: v.cam.pitch, dist: v.cam.dist });
  };

  useImperativeHandle(ref, () => ({
    setTilt: (x, y, z) => post({ type: 'tilt', x, y, z }),
    setCamera: (yaw, pitch, dist) => post({ type: 'cam', yaw, pitch, dist }),
    resetTilt: () => post({ type: 'resetTilt' }),
    resetCamera: () => post({ type: 'resetCam' }),
    clear: () => post({ type: 'clear' }),
  }));

  useEffect(() => {
    const onWin = (ev: MessageEvent) => {
      try {
        const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (!msg || msg.type !== 'view') return;
        if (
          ![msg.yaw, msg.pitch, msg.dist, msg.tiltX, msg.tiltY, msg.tiltZ].every((n: unknown) =>
            typeof n === 'number' && Number.isFinite(n),
          )
        ) {
          return;
        }
        onViewChangeRef.current?.({
          tilt: { x: msg.tiltX, y: msg.tiltY, z: msg.tiltZ },
          cam: { yaw: msg.yaw, pitch: msg.pitch, dist: msg.dist },
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('message', onWin);
    return () => window.removeEventListener('message', onWin);
  }, []);

  useEffect(() => {
    if (clearToken === lastClear.current) return;
    lastClear.current = clearToken;
    if (readyRef.current) post({ type: 'clear' });
  }, [clearToken]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (!flat || flat.length === 0) {
      post({ type: 'clear' });
      return;
    }
    const arr = flat instanceof Float32Array ? Array.from(flat) : flat;
    post({ type: 'points', data: arr });
  }, [flat]);

  return createElement('iframe', {
    ref: iframeRef,
    title: 'esp-lidar-3d',
    srcDoc: LIDAR_GL_HTML,
    onLoad: () => {
      readyRef.current = true;
      applyInitialView();
      if (flat && flat.length) {
        const arr = flat instanceof Float32Array ? Array.from(flat) : flat;
        post({ type: 'points', data: arr });
      }
    },
    style: {
      width: '100%',
      height: '100%',
      border: 'none',
      background: '#0a0c10',
      display: 'block',
    },
  });
});
