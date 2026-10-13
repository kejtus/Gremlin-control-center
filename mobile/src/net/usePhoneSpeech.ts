import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { startMic, type MicSession } from './mic/capture';
import { startNativeRecord, nativeRecordAvailable, type NativeMicSession } from './mic/nativeRecord';
import {
  osSpeechAvailable,
  startOsSpeech,
  transcribeAudioUri,
  type OsSpeechHandle,
} from './mic/osSpeech';
import { sttUrl, transcribeClip } from './mic/stt';

const MAX_MS = 20_000;

function canLocalMic(): boolean {
  const nav = globalThis as { navigator?: Navigator };
  return !!nav.navigator?.mediaDevices?.getUserMedia;
}

type Mode = 'hybrid' | 'os' | 'native' | 'web' | 'none';

/**
 * Samodzielne APK: rozpoznawanie NA telefonie (OS).
 * Hybrid = OS (podgląd) + nagranie → OS file STT / opcjonalny Whisper (dev/Pi).
 * Whisper na PC to tylko pomoc przy Expo — docelowo nie jest wymagany.
 */
function detectMode(): Mode {
  if (Platform.OS === 'web' && canLocalMic()) return 'web';
  if (osSpeechAvailable() && nativeRecordAvailable()) return 'hybrid';
  if (osSpeechAvailable()) return 'os';
  if (nativeRecordAvailable()) return 'native';
  if (canLocalMic()) return 'web';
  return 'none';
}

export function usePhoneSpeech() {
  const [mode] = useState(detectMode);
  const micRef = useRef<MicSession | null>(null);
  const nativeRef = useRef<NativeMicSession | null>(null);
  const osRef = useRef<OsSpeechHandle | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const liveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef<'hybrid' | 'os' | 'native' | 'web' | null>(null);
  const interimRef = useRef('');
  const gotFinalRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetUi = () => {
    liveRef.current = false;
    pathRef.current = null;
    clearTimer();
    setListening(false);
    setBusy(false);
    setInterim('');
    interimRef.current = '';
    setLevel(0);
  };

  const stopOs = async () => {
    const handle = osRef.current;
    osRef.current = null;
    if (handle) await handle.stop().catch(() => undefined);
  };

  /** Nagranie → najpierw OS na telefonie, potem opcjonalnie Whisper. */
  const transcribeRecording = async (clip: { uri: string; audio: string; name: string }) => {
    let text = '';
    if (osSpeechAvailable()) {
      try {
        text = await transcribeAudioUri(clip.uri, {
          onPartial: (t) => {
            setInterim(t);
            interimRef.current = t;
          },
        });
      } catch {
        /* dalej Whisper */
      }
    }
    if (!text && sttUrl()) {
      text = await transcribeClip(clip.audio, clip.name);
    }
    return text.trim();
  };

  const finishHybridOrNative = useCallback(async () => {
    if (!liveRef.current && !nativeRef.current) return;
    liveRef.current = false;
    clearTimer();
    setListening(false);

    const pendingOs = interimRef.current.trim();
    const hadFinal = gotFinalRef.current;

    await stopOs();

    const session = nativeRef.current;
    nativeRef.current = null;

    // Jeśli OS już oddał final / interim — nie czekaj na Whisper.
    if (hadFinal) {
      resetUi();
      return;
    }
    if (pendingOs) {
      setLines((prev) => [...prev, pendingOs]);
      resetUi();
      return;
    }

    if (!session) {
      setError('Nic nie rozpoznałem — powtórz bliżej mikrofonu.');
      resetUi();
      return;
    }

    setBusy(true);
    setInterim('rozpoznawanie…');
    try {
      const clip = await session.stop();
      const text = await transcribeRecording(clip);
      if (text) {
        setLines((prev) => [...prev, text]);
        setError(null);
      } else {
        setError(
          sttUrl()
            ? 'Nic nie rozpoznałem (telefon + Whisper). Powtórz wyraźniej.'
            : 'Nic nie rozpoznałem. Sprawdź asystenta głosowego / Google Speech na telefonie (APK działa offline względem PC).',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się rozpoznać mowy.');
    } finally {
      setInterim('');
      interimRef.current = '';
      setBusy(false);
      setLevel(0);
      pathRef.current = null;
    }
  }, []);

  const finishWeb = useCallback(async () => {
    if (!liveRef.current) return;
    liveRef.current = false;
    clearTimer();
    setListening(false);
    const session = micRef.current;
    micRef.current = null;
    if (!session) return;
    setBusy(true);
    setInterim('rozpoznawanie…');
    try {
      const clip = await session.stop();
      if (!sttUrl()) {
        throw new Error('W przeglądarce potrzebny Whisper (./start.sh) albo użyj APK na telefonie.');
      }
      const text = await transcribeClip(clip.audio, clip.name);
      if (text) {
        setLines((prev) => [...prev, text]);
        setError(null);
      } else {
        setError('Nic nie rozpoznałem — powtórz bliżej mikrofonu.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się rozpoznać mowy.');
    } finally {
      setInterim('');
      setBusy(false);
      setLevel(0);
      pathRef.current = null;
    }
  }, []);

  const startNativeOnly = useCallback(async () => {
    pathRef.current = 'native';
    liveRef.current = true;
    gotFinalRef.current = false;
    interimRef.current = '';
    setListening(true);
    setError(null);
    nativeRef.current = await startNativeRecord((db) => {
      setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
    });
    timerRef.current = setTimeout(() => {
      void finishHybridOrNative();
    }, MAX_MS);
  }, [finishHybridOrNative]);

  const startHybrid = useCallback(async () => {
    pathRef.current = 'hybrid';
    liveRef.current = true;
    gotFinalRef.current = false;
    interimRef.current = '';
    setListening(true);
    setError(null);

    // 1) Nagranie zawsze — backup gdy OS nie odda słów.
    nativeRef.current = await startNativeRecord((db) => {
      setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
    });

    // 2) OS live — podgląd interim (może nie działać na Harmony / bez Google).
    try {
      osRef.current = await startOsSpeech({
        onPartial: (text) => {
          setInterim(text);
          interimRef.current = text;
        },
        onFinal: (text) => {
          gotFinalRef.current = true;
          setInterim('');
          interimRef.current = '';
          setLines((prev) => [...prev, text]);
        },
        onError: () => {
          /* backup nagrania i tak zadziała */
        },
        onVolume: () => {
          /* poziom z nagrania */
        },
        onEnd: () => {
          osRef.current = null;
        },
      });
    } catch {
      osRef.current = null;
    }

    timerRef.current = setTimeout(() => {
      void finishHybridOrNative();
    }, MAX_MS);
  }, [finishHybridOrNative]);

  const start = useCallback(async () => {
    setError(null);
    if (liveRef.current || busy) return;
    if (mode === 'none') {
      setError('Mikrofon działa w APK. Expo Go bez natywnego mikrofonu — zbuduj APK.');
      return;
    }

    try {
      if (mode === 'hybrid') {
        await startHybrid();
        return;
      }
      if (mode === 'os') {
        liveRef.current = true;
        pathRef.current = 'os';
        gotFinalRef.current = false;
        setListening(true);
        osRef.current = await startOsSpeech({
          onPartial: (t) => {
            setInterim(t);
            interimRef.current = t;
          },
          onFinal: (t) => {
            gotFinalRef.current = true;
            setInterim('');
            interimRef.current = '';
            setLines((prev) => [...prev, t]);
          },
          onError: (m) => setError(m),
          onVolume: (v) => setLevel(Math.max(0, Math.min(1, (v + 2) / 12))),
          onEnd: () => {
            osRef.current = null;
            const pending = interimRef.current.trim();
            if (!gotFinalRef.current && pending) setLines((prev) => [...prev, pending]);
            else if (!gotFinalRef.current) {
              setError((e) => e || 'Silnik systemowy nic nie rozpoznał.');
            }
            resetUi();
          },
        });
        timerRef.current = setTimeout(() => {
          void stopOs();
        }, MAX_MS);
        return;
      }
      if (mode === 'native') {
        await startNativeOnly();
        return;
      }
      pathRef.current = 'web';
      micRef.current = await startMic({ onLevel: setLevel });
      liveRef.current = true;
      setListening(true);
      timerRef.current = setTimeout(() => {
        void finishWeb();
      }, MAX_MS);
    } catch (err) {
      resetUi();
      setError(err instanceof Error ? err.message : 'Nie udało się włączyć mikrofonu.');
    }
  }, [busy, finishWeb, mode, startHybrid, startNativeOnly]);

  const stop = useCallback(() => {
    const path = pathRef.current;
    if (path === 'hybrid' || path === 'native') {
      void finishHybridOrNative();
      return;
    }
    if (path === 'os') {
      void stopOs();
      setTimeout(() => {
        if (pathRef.current === 'os' || liveRef.current) {
          const pending = interimRef.current.trim();
          if (!gotFinalRef.current && pending) setLines((prev) => [...prev, pending]);
          resetUi();
        }
      }, 2000);
      return;
    }
    if (path === 'web' || mode === 'web') {
      void finishWeb();
    }
  }, [finishHybridOrNative, finishWeb, mode]);

  useEffect(
    () => () => {
      liveRef.current = false;
      clearTimer();
      void stopOs();
      void nativeRef.current?.stop().catch(() => undefined);
      nativeRef.current = null;
      void micRef.current?.stop().catch(() => undefined);
      micRef.current = null;
    },
    [],
  );

  return {
    supported: mode !== 'none',
    mode,
    listening,
    busy,
    interim,
    lines,
    error,
    level,
    start,
    stop,
    toggle() {
      if (busy && !listening) return;
      if (listening || liveRef.current) stop();
      else void start();
    },
  };
}
