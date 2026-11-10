/**
 * Offline STT na urządzeniu (Vosk) — bez internetu, bez Whisper, bez Google.
 * Działa w APK; Expo Go nie ma natywnego modułu.
 */
import { Platform } from 'react-native';
import { isExpoGo } from '../runtime';

export type VoskHandle = {
  stop: () => Promise<void>;
};

import { VOICE_GRAMMAR } from '../voiceCommands';

/** Komendy / frazy robota — grammar Vosk. */
export const ROBOT_GRAMMAR = VOICE_GRAMMAR;

export function voskAvailable(): boolean {
  if (Platform.OS === 'web' || isExpoGo()) return false;
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

let modelLoaded = false;
let loadPromise: Promise<void> | null = null;

async function ensureModel() {
  const vosk = await import('react-native-vosk');
  if (!modelLoaded) {
    if (!loadPromise) {
      loadPromise = vosk.loadModel('model-pl-pl').then(() => {
        modelLoaded = true;
      }).catch((err) => {
        loadPromise = null;
        throw err;
      });
    }
    await loadPromise;
  }
  return vosk;
}

export async function startVoskSpeech(opts: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
  timeoutMs?: number;
}): Promise<VoskHandle> {
  let stopped = false;
  const subs: { remove: () => void }[] = [];

  const cleanup = () => {
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        /* ignore */
      }
    }
    subs.length = 0;
  };

  const vosk = await ensureModel();

  subs.push(
    vosk.onPartialResult((text: string) => {
      const t = String(text || '').trim();
      if (t) opts.onPartial(t);
    }),
    vosk.onResult((text: string) => {
      const t = String(text || '').trim();
      if (t && t !== '[unk]') opts.onFinal(t);
    }),
    vosk.onFinalResult((text: string) => {
      const t = String(text || '').trim();
      if (t && t !== '[unk]') opts.onFinal(t);
    }),
    vosk.onError((err: unknown) => {
      opts.onError(typeof err === 'string' ? err : 'Błąd rozpoznawania Vosk');
    }),
    vosk.onTimeout(() => {
      if (!stopped) {
        stopped = true;
        try {
          vosk.stop();
        } catch {
          /* ignore */
        }
        cleanup();
        opts.onEnd();
      }
    }),
  );

  const timeout = opts.timeoutMs ?? 20_000;
  try {
    // Grammar komend — lepsza trafność; fallback bez grammar (HyperOS).
    await vosk.start({ grammar: ROBOT_GRAMMAR, timeout });
  } catch {
    try {
      await vosk.start({ timeout });
    } catch (err) {
      cleanup();
      throw err instanceof Error
        ? err
        : new Error('Nie udało się uruchomić Vosk (model PL w APK).');
    }
  }

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        vosk.stop();
      } catch {
        /* ignore */
      }
      cleanup();
      opts.onEnd();
    },
  };
}
