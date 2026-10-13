import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export function osSpeechAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return requireOptionalNativeModule('ExpoSpeechRecognition') != null;
  } catch {
    return false;
  }
}

export type OsSpeechHandle = {
  stop: () => Promise<void>;
};

type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

function androidApi(): number {
  if (Platform.OS !== 'android') return 99;
  const v = Platform.Version;
  return typeof v === 'number' ? v : parseInt(String(v), 10) || 0;
}

/** continuous + własny AudioRecord działa od API 33 — tam da się też niezawodnie stopnąć. */
function canContinuous(): boolean {
  return Platform.OS !== 'android' || androidApi() >= 33;
}

async function ensureMicPermission(mod: SpeechModule): Promise<void> {
  let mic = await mod.getMicrophonePermissionsAsync();
  if (!mic.granted && mic.canAskAgain) {
    mic = await mod.requestMicrophonePermissionsAsync();
  }
  if (!mic.granted) {
    throw new Error('Brak zgody na mikrofon. Włącz ją w ustawieniach aplikacji.');
  }
  try {
    await mod.requestSpeechRecognizerPermissionsAsync();
  } catch {
    /* Android nie ma osobnej zgody */
  }
}

function buildStartOpts(engine?: string) {
  return {
    lang: 'pl-PL',
    interimResults: true,
    continuous: canContinuous(),
    addsPunctuation: false,
    requiresOnDeviceRecognition: false,
    volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
    ...(engine ? { androidRecognitionServicePackage: engine } : {}),
  };
}

/**
 * Rozpoznawanie mowy silnikiem systemu (w APK).
 * Nie wymuszamy Huawei — na HarmonyOS zepsuty silnik wieszał REC i blokował stop.
 */
export async function startOsSpeech(opts: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
  onVolume?: (level: number) => void;
}): Promise<OsSpeechHandle> {
  if (!osSpeechAvailable()) {
    throw new Error('Mikrofon jest w zainstalowanym APK, nie w Expo Go.');
  }

  const { ExpoSpeechRecognitionModule: mod } = await import('expo-speech-recognition');

  await ensureMicPermission(mod);

  if (!mod.isRecognitionAvailable()) {
    throw new Error(
      'Brak usługi rozpoznawania mowy na telefonie. Zainstaluj „Speech Recognition & Synthesis” (Google) albo włącz asystenta głosowego producenta.',
    );
  }

  let finished = false;
  let started = false;
  let engineRetryDone = false;

  const cleanupSubs = (subs: { remove: () => void }[]) => {
    for (const sub of subs) {
      try {
        sub.remove();
      } catch {
        /* ignore */
      }
    }
  };

  let subs: { remove: () => void }[] = [];

  const finish = () => {
    if (finished) return;
    finished = true;
    cleanupSubs(subs);
    subs = [];
    opts.onEnd();
  };

  const attach = (engine?: string) => {
    cleanupSubs(subs);
    subs = [
      mod.addListener('start', () => {
        started = true;
      }),
      mod.addListener('result', (ev) => {
        const text = ev.results[0]?.transcript?.trim() ?? '';
        if (!text) return;
        if (ev.isFinal) opts.onFinal(text);
        else opts.onPartial(text);
      }),
      mod.addListener('volumechange', (ev) => {
        opts.onVolume?.(ev.value);
      }),
      mod.addListener('error', (ev) => {
        if (ev.error === 'aborted' || ev.error === 'no-speech' || ev.error === 'speech-timeout') {
          finish();
          return;
        }
        // Jeden retry bez wymuszonego pakietu (często ratuje Harmony / Xiaomi).
        if (
          !engineRetryDone &&
          engine &&
          (ev.error === 'service-not-allowed' ||
            ev.error === 'language-not-supported' ||
            ev.error === 'network' ||
            ev.error === 'client' ||
            ev.error === 'busy')
        ) {
          engineRetryDone = true;
          try {
            mod.start(buildStartOpts());
            return;
          } catch {
            /* spadnie niżej */
          }
        }
        opts.onError(ev.message || `Rozpoznawanie: ${ev.error || 'błąd'}`);
        finish();
      }),
      mod.addListener('end', () => finish()),
    ];
    mod.start(buildStartOpts(engine));
  };

  // Domyślny silnik systemu — NIE preferujemy Huawei na siłę (wieszał sesję).
  const def = mod.getDefaultRecognitionService?.()?.packageName;
  attach(def || undefined);

  // Jeśli native start się zawiesił bez eventu — szybko fail, hook przejdzie na nagrywanie.
  await new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (finished) {
        reject(new Error('Rozpoznawanie nie wystartowało.'));
        return;
      }
      if (started) {
        resolve();
        return;
      }
      if (Date.now() - t0 > 4000) {
        try {
          mod.abort();
        } catch {
          /* ignore */
        }
        cleanupSubs(subs);
        reject(
          new Error(
            'Usługa mowy nie odpowiada. Sprawdź asystenta głosowego / Google TTS, albo przebuduj APK.',
          ),
        );
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });

  return {
    async stop() {
      // stop() oddaje finalny wynik; abort() go kasuje. UI i tak zdejmiemy po timeoutcie.
      try {
        mod.stop();
      } catch {
        try {
          mod.abort();
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve) => {
        const deadline = Date.now() + 1600;
        const wait = () => {
          if (finished || Date.now() >= deadline) {
            try {
              mod.abort();
            } catch {
              /* ignore */
            }
            finish();
            resolve();
            return;
          }
          setTimeout(wait, 60);
        };
        wait();
      });
    },
  };
}

/** Transkrypcja pliku nagrania (Android 13+ / iOS) — fallback po native record. */
export async function transcribeAudioUri(
  uri: string,
  opts: { onPartial?: (t: string) => void } = {},
): Promise<string> {
  if (!osSpeechAvailable()) {
    throw new Error('Brak modułu rozpoznawania mowy.');
  }
  const { ExpoSpeechRecognitionModule: mod, AudioEncodingAndroid } = await import(
    'expo-speech-recognition'
  );
  await ensureMicPermission(mod);

  return new Promise((resolve, reject) => {
    let text = '';
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      for (const s of subs) {
        try {
          s.remove();
        } catch {
          /* ignore */
        }
      }
      if (err) reject(err);
      else resolve(text.trim());
    };
    const subs = [
      mod.addListener('result', (ev) => {
        const t = ev.results[0]?.transcript?.trim() ?? '';
        if (!t) return;
        if (ev.isFinal) text = text ? `${text} ${t}` : t;
        else opts.onPartial?.(t);
      }),
      mod.addListener('error', (ev) => {
        if (ev.error === 'aborted' || ev.error === 'no-speech' || ev.error === 'speech-timeout') {
          finish();
          return;
        }
        finish(new Error(ev.message || ev.error || 'Transkrypcja nieudana'));
      }),
      mod.addListener('end', () => finish()),
    ];
    try {
      const lower = uri.toLowerCase();
      const isWav = lower.endsWith('.wav');
      mod.start({
        lang: 'pl-PL',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        audioSource: {
          uri,
          audioChannels: 1,
          sampleRate: 16000,
          ...(isWav
            ? { audioEncoding: AudioEncodingAndroid.ENCODING_PCM_16BIT }
            : {}),
        },
      });
    } catch (err) {
      finish(err instanceof Error ? err : new Error('Transkrypcja nieudana'));
    }
    setTimeout(() => finish(text ? undefined : new Error('Timeout transkrypcji')), 25_000);
  });
}
