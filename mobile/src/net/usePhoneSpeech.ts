import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { isExpoGo } from './runtime';
import { startVoskSpeech, voskAvailable, type VoskHandle } from './mic/voskSpeech';
import { parseVoiceCommand, type VoiceAction } from './voiceCommands';

/** Sesja ciągła — Vosk timeout → auto-restart dopóki użytkownik słucha. */
const SESSION_MS = 90_000;

type Mode = 'vosk' | 'none';

type Options = {
  /** Wywołane przy każdej rozpoznanej komendzie (ciągłe słuchanie). */
  onAction?: (action: VoiceAction, raw: string) => void;
};

/**
 * HyperOS bez Google Services — Intent „wyszukiwanie głosowe niedostępne”.
 * Jedyna pewna ścieżka: Vosk offline w APK (model PL).
 */
function detectMode(): Mode {
  if (isExpoGo() || Platform.OS === 'web') return 'none';
  if (voskAvailable()) return 'vosk';
  return 'none';
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Mikrofon RPilot',
        message: 'RPilot potrzebuje mikrofonu do rozpoznawania komend offline (Vosk).',
        buttonPositive: 'OK',
        buttonNegative: 'Anuluj',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function usePhoneSpeech(opts: Options = {}) {
  const [mode] = useState(detectMode);
  const voskRef = useRef<VoskHandle | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<VoiceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const liveRef = useRef(false);
  const wantListenRef = useRef(false);
  const lastRawRef = useRef('');
  const lastAtRef = useRef(0);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onActionRef = useRef(opts.onAction);
  onActionRef.current = opts.onAction;
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== 'vosk') return;
    let cancelled = false;
    void (async () => {
      try {
        const vosk = await import('react-native-vosk');
        await vosk.loadModel('model-pl-pl');
        if (!cancelled) setModelReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Model Vosk: ${err.message}`
              : 'Nie załadowano modelu mowy (Vosk). Przebuduj APK.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const clearMeter = () => {
    if (meterRef.current) {
      clearInterval(meterRef.current);
      meterRef.current = null;
    }
    setLevel(0);
  };

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const resetUi = () => {
    liveRef.current = false;
    clearMeter();
    setListening(false);
    setBusy(false);
    setInterim('');
  };

  const stopVosk = async () => {
    const h = voskRef.current;
    voskRef.current = null;
    if (h) await h.stop().catch(() => undefined);
  };

  const handleUtterance = useCallback((text: string) => {
    const raw = text.trim();
    if (!raw) return;
    const now = Date.now();
    // Vosk czasem emituje ten sam final z onResult + onFinalResult.
    if (raw === lastRawRef.current && now - lastAtRef.current < 800) return;
    lastRawRef.current = raw;
    lastAtRef.current = now;

    const action = parseVoiceCommand(raw);
    setLines((prev) => {
      const tag =
        action.kind === 'unknown' ? raw : `${raw} → ${action.label}`;
      return [...prev.slice(-40), tag];
    });
    setInterim('');
    setError(null);
    if (action.kind !== 'unknown') {
      setLastAction(action);
      onActionRef.current?.(action, raw);
    }
  }, []);

  const beginSession = useCallback(async () => {
    if (!wantListenRef.current) return;
    if (voskRef.current) return;

    liveRef.current = true;
    setListening(true);
    setBusy(false);
    setInterim(modelReady ? 'słucham…' : 'ładuję model…');
    setError(null);

    let t = 0;
    clearMeter();
    meterRef.current = setInterval(() => {
      t += 1;
      setLevel(0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 3)));
    }, 120);

    try {
      voskRef.current = await startVoskSpeech({
        timeoutMs: SESSION_MS,
        onPartial: (text) => setInterim(text),
        onFinal: (text) => handleUtterance(text),
        onError: (message) => {
          setError(
            `${message} (HyperOS: sprawdź uprawnienie mikrofonu dla RPilot; Google Speech nie jest wymagane.)`,
          );
        },
        onEnd: () => {
          voskRef.current = null;
          clearMeter();
          if (!wantListenRef.current) {
            resetUi();
            return;
          }
          // Timeout sesji — restart bez przerywania trybu ciągłego.
          setInterim('słucham…');
          setListening(true);
          clearRestart();
          restartTimer.current = setTimeout(() => {
            restartTimer.current = null;
            void beginSession();
          }, 250);
        },
      });
      setModelReady(true);
      setInterim('słucham…');
    } catch (err) {
      wantListenRef.current = false;
      resetUi();
      setError(
        err instanceof Error
          ? err.message
          : 'Vosk nie wystartował. Odinstaluj starą RPilot i wgraj najnowsze APK.',
      );
    }
  }, [handleUtterance, modelReady]);

  const start = useCallback(async () => {
    setError(null);
    if (wantListenRef.current || busy) return;
    if (mode === 'none') {
      setError('Mikrofon offline działa tylko w zainstalowanym APK (Vosk), nie w Expo Go.');
      return;
    }

    const ok = await ensureMicPermission();
    if (!ok) {
      setError('Brak zgody na mikrofon — włącz w ustawieniach aplikacji RPilot.');
      return;
    }

    wantListenRef.current = true;
    await beginSession();
  }, [beginSession, busy, mode]);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    clearRestart();
    if (!liveRef.current && !voskRef.current) {
      resetUi();
      return;
    }
    setBusy(true);
    setInterim('zatrzymuję…');
    void stopVosk().then(() => resetUi());
  }, []);

  useEffect(
    () => () => {
      wantListenRef.current = false;
      clearRestart();
      liveRef.current = false;
      clearMeter();
      void stopVosk();
    },
    [],
  );

  return {
    supported: mode !== 'none',
    mode,
    huaweiHint: false,
    modelReady,
    listening,
    busy,
    interim,
    lines,
    lastAction,
    error,
    level,
    start,
    stop,
    openGoogleSpeechStore: () => undefined,
    toggle() {
      if (busy && !listening) return;
      if (listening || wantListenRef.current) stop();
      else void start();
    },
  };
}
