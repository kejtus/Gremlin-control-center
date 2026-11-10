import { Buffer } from 'buffer';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LIDAR_GL_HTML } from '../lidarGlHtml';
import type { LidarViewPrefs } from '../lidarViewPrefs';

export type LidarCloudHandle = {
  setTilt: (x: number, y: number, z: number) => void;
  setCamera: (yaw: number, pitch: number, dist: number) => void;
  resetTilt: () => void;
  resetCamera: () => void;
  clear: () => void;
};

type Props = {
  /** Surowa ramka ESP: Float32Array [x,y,z,intensity,...] albo number[]. */
  flat: Float32Array | number[] | null;
  /** Gdy true / zmiana tokena — wyczyść. */
  clearToken?: number;
  /** Przywrócony tilt + kamera (po zmianie zakładki). */
  initialView?: LidarViewPrefs | null;
  /** Orbit / tilt zmienione w WebGL — zapisz poza zakładką. */
  onViewChange?: (view: LidarViewPrefs) => void;
};

const MAX_POINTS = 16000;

function packBase64(flat: Float32Array | number[]): string {
  let src: Float32Array;
  if (flat instanceof Float32Array) {
    const n = Math.min(flat.length, MAX_POINTS * 4);
    src = flat.length === n ? flat : flat.subarray(0, n);
  } else {
    const n = Math.min(flat.length, MAX_POINTS * 4);
    src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = flat[i]!;
  }
  const usable = src.length - (src.length % 4);
  const view = usable === src.length ? src : src.subarray(0, usable);
  const ab = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  return Buffer.from(ab as ArrayBuffer).toString('base64');
}

export const LidarCloud3D = forwardRef<LidarCloudHandle, Props>(function LidarCloud3D(
  { flat, clearToken = 0, initialView = null, onViewChange },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const lastClear = useRef(clearToken);
  const lastPushAt = useRef(0);
  const latestB64 = useRef<string | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialViewRef = useRef(initialView);
  initialViewRef.current = initialView;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const html = useMemo(() => LIDAR_GL_HTML, []);

  const run = (js: string) => {
    webRef.current?.injectJavaScript(`try{${js}}catch(e){}true;`);
  };

  const applyInitialView = () => {
    const v = initialViewRef.current;
    if (!v) return;
    run(`window.setTilt(${v.tilt.x},${v.tilt.y},${v.tilt.z});window.setCamera(${v.cam.yaw},${v.cam.pitch},${v.cam.dist})`);
  };

  useImperativeHandle(ref, () => ({
    setTilt: (x, y, z) => run(`window.setTilt(${x},${y},${z})`),
    setCamera: (yaw, pitch, dist) => run(`window.setCamera(${yaw},${pitch},${dist})`),
    resetTilt: () => run('window.resetTilt()'),
    resetCamera: () => run('window.resetCamera()'),
    clear: () => run('window.clearCloud()'),
  }));

  const injectB64 = (b64: string) => run(`window.setCloudB64(${JSON.stringify(b64)})`);

  const schedulePush = (b64: string) => {
    latestB64.current = b64;
    if (!readyRef.current) {
      pendingRef.current = b64;
      return;
    }
    const wait = Math.max(0, 50 - (Date.now() - lastPushAt.current));
    if (throttleTimer.current) clearTimeout(throttleTimer.current);
    throttleTimer.current = setTimeout(() => {
      throttleTimer.current = null;
      const payload = latestB64.current;
      if (!payload) return;
      lastPushAt.current = Date.now();
      injectB64(payload);
    }, wait);
  };

  useEffect(() => {
    if (clearToken === lastClear.current) return;
    lastClear.current = clearToken;
    if (readyRef.current) run('window.clearCloud()');
  }, [clearToken]);

  useEffect(() => {
    if (!flat || (flat instanceof Float32Array ? flat.length === 0 : flat.length === 0)) {
      if (readyRef.current) run('window.clearCloud()');
      return;
    }
    schedulePush(packBase64(flat));
  }, [flat]);

  useEffect(
    () => () => {
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
    },
    [],
  );

  const onMessage = (ev: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data) as {
        type?: string;
        yaw?: number;
        pitch?: number;
        dist?: number;
        tiltX?: number;
        tiltY?: number;
        tiltZ?: number;
      };
      if (msg.type !== 'view') return;
      if (
        ![msg.yaw, msg.pitch, msg.dist, msg.tiltX, msg.tiltY, msg.tiltZ].every((n) =>
          Number.isFinite(n),
        )
      ) {
        return;
      }
      onViewChangeRef.current?.({
        tilt: { x: msg.tiltX!, y: msg.tiltY!, z: msg.tiltZ! },
        cam: { yaw: msg.yaw!, pitch: msg.pitch!, dist: msg.dist! },
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        onLoadEnd={() => {
          readyRef.current = true;
          applyInitialView();
          if (pendingRef.current) {
            injectB64(pendingRef.current);
            pendingRef.current = null;
            lastPushAt.current = Date.now();
          }
        }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, backgroundColor: '#0a0c10', overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#0a0c10' },
});
