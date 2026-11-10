/**
 * Systemowy Intent RECOGNIZE_SPEECH — na HyperOS wymaga silnika Google
 * („Speech Recognition & Synthesis” / Google).
 */
import { Platform } from 'react-native';
import { ResultCode } from 'expo-intent-launcher';

export function osSpeechAvailable(): boolean {
  return Platform.OS === 'android';
}

export type OsSpeechHandle = {
  stop: () => Promise<void>;
};

function pickTranscript(extra: Record<string, unknown> | null | undefined): string {
  if (!extra) return '';
  for (const k of [
    'android.speech.extra.RESULTS',
    'android.speech.extras.RESULTS',
    'results',
    'query',
  ]) {
    const v = extra[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  }
  return '';
}

export async function startOsSpeech(opts: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): Promise<OsSpeechHandle> {
  if (!osSpeechAvailable()) {
    throw new Error('Intent mowy tylko na Android / HyperOS.');
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    opts.onEnd();
  };

  void (async () => {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      const result = await IntentLauncher.startActivityAsync(
        'android.speech.action.RECOGNIZE_SPEECH',
        {
          extra: {
            'android.speech.extra.LANGUAGE_MODEL': 'free_form',
            'android.speech.extra.LANGUAGE': 'pl-PL',
            'android.speech.extra.PROMPT': 'Powiedz komendę (np. stop, jedź, lewo)',
            'android.speech.extra.MAX_RESULTS': 3,
            'android.speech.extra.PREFER_OFFLINE': true,
          },
        },
      );
      if (finished) return;
      const text = pickTranscript(result.extra as Record<string, unknown> | undefined);
      if (text) {
        opts.onPartial(text);
        opts.onFinal(text);
      } else if (result.resultCode === ResultCode.Canceled) {
        opts.onError('Anulowano.');
      } else {
        opts.onError(
          'Brak wyniku. Zainstaluj „Speech Recognition & Synthesis” (Google) i ustaw jako domyślny asystent głosowy.',
        );
      }
    } catch (err) {
      if (!finished) {
        opts.onError(
          err instanceof Error
            ? `${err.message} — zainstaluj Google Speech Recognition & Synthesis.`
            : 'Brak silnika mowy Google na tablecie.',
        );
      }
    } finally {
      finish();
    }
  })();

  return {
    async stop() {
      finish();
    },
  };
}
