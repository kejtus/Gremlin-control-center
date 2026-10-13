import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { colors as baseColors, applyThemeMode, HIGH_CONTRAST_COLORS, BASE_COLORS } from './theme';

const STORAGE_KEY = 'rpilot.a11y.prefs';

export type AccessibilityPrefs = {
  /** Większe napisy w całej aplikacji. */
  largeText: boolean;
  /** Maks. kontrast: żółty na czarnym. */
  highContrast: boolean;
  /** Tekst pod ikonami zakładek. */
  tabLabels: boolean;
  /** Mniej animacji. */
  reduceMotion: boolean;
  /** Czytnik / TTS ogłasza zmiany. */
  announceChanges: boolean;
  /** Większe obszary dotyku. */
  largeTouchTargets: boolean;
  /**
   * Jak VoiceOver: 1. tap = odczyt etykiety (+ napis na dole),
   * 2. tap w to samo = prawdziwe kliknięcie.
   */
  exploreTap: boolean;
};

export const DEFAULT_A11Y: AccessibilityPrefs = {
  largeText: false,
  highContrast: false,
  tabLabels: false,
  reduceMotion: false,
  announceChanges: true,
  largeTouchTargets: false,
  exploreTap: false,
};

type Ctx = {
  prefs: AccessibilityPrefs;
  setPref: <K extends keyof AccessibilityPrefs>(key: K, value: AccessibilityPrefs[K]) => void;
  resetPrefs: () => void;
  colors: typeof baseColors;
  textScale: number;
  touchScale: number;
  /** Skala ikon / joysticków przy „większe przyciski”. */
  iconScale: number;
  /** Extra padding / minHeight dla przycisków w zakładkach. */
  btnBoost: { minHeight: number; paddingVertical: number; paddingHorizontal: number } | null;
  announce: (message: string) => void;
  speak: (message: string) => void;
  explorePress: (id: string, label: string, activate: () => void) => boolean;
  caption: string | null;
  clearCaption: () => void;
};

const AccessibilityContext = createContext<Ctx | null>(null);

function webPrefersReducedMotion(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Klasyczny HC — wartości w theme.ts (HIGH_CONTRAST_COLORS). */
function highContrastColors(): typeof baseColors {
  return { ...HIGH_CONTRAST_COLORS };
}

function stopSpeech() {
  try {
    void Speech.stop();
  } catch {
    /* ignore */
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

function pickPolishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => /^pl(-|_)/i.test(v.lang)) ||
    voices.find((v) => /polski|polish/i.test(v.name)) ||
    voices.find((v) => /^en(-|_)/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

let speakSeq = 0;
let voicesCache: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>> | null = null;

async function loadVoices() {
  if (voicesCache?.length) return voicesCache;
  try {
    voicesCache = await Speech.getAvailableVoicesAsync();
  } catch {
    voicesCache = [];
  }
  return voicesCache;
}

function androidLangCode(code?: string | null): string {
  if (!code) return 'pl';
  // expo-speech Android: Locale(language) — tylko "pl", nie "pl-PL"
  return code.split(/[-_]/)[0]?.toLowerCase() || 'pl';
}

function pickVoice(
  voices: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>,
  prefer = 'pl',
) {
  const pref = prefer.toLowerCase();
  return (
    voices.find((v) => v.language?.toLowerCase().startsWith(pref)) ||
    voices.find((v) => /polski|polish/i.test(v.name)) ||
    voices.find((v) => v.language?.toLowerCase().startsWith('en')) ||
    voices[0] ||
    null
  );
}

/**
 * TTS — bez uprawnień.
 * 1) czekamy na gotowość silnika (getVoices),
 * 2) nie wołamy expo-audio (zabija focus na Androidzie),
 * 3) language = tylko "pl" na Androidzie (bug Locale w expo-speech).
 */
function speakNow(message: string, lang = 'pl-PL') {
  const text = message.trim();
  if (!text) return;
  const seq = ++speakSeq;

  if (Platform.OS === 'web') {
    speakWebFallback(text, lang, seq);
    return;
  }

  void (async () => {
    const voices = await loadVoices();
    if (seq !== speakSeq) return;

    try {
      if (await Speech.isSpeakingAsync()) await Speech.stop();
    } catch {
      /* ignore */
    }
    if (seq !== speakSeq) return;

    const prefer = androidLangCode(lang);
    const voice = pickVoice(voices, prefer);
    const language =
      Platform.OS === 'android'
        ? androidLangCode(voice?.language || prefer)
        : voice?.language || lang;

    const opts: Speech.SpeechOptions = {
      language,
      pitch: 1,
      rate: 1,
      volume: 1,
      useApplicationAudioSession: false,
      onError: () => {
        if (seq !== speakSeq) return;
        try {
          // Bez language / voice — czysty default systemowy
          Speech.speak(text, {
            pitch: 1,
            rate: 1,
            volume: 1,
            useApplicationAudioSession: false,
          });
        } catch {
          try {
            AccessibilityInfo.announceForAccessibility(text);
          } catch {
            /* ignore */
          }
        }
      },
    };
    if (voice?.identifier) opts.voice = voice.identifier;

    try {
      Speech.speak(text, opts);
    } catch {
      try {
        Speech.speak(text, { volume: 1, rate: 1 });
      } catch {
        try {
          AccessibilityInfo.announceForAccessibility(text);
        } catch {
          /* ignore */
        }
      }
    }
  })();
}

/** Diagnostyka pod „Test głosu”. */
export async function testSpeechAsync(
  message = 'Test głosu. Jeśli to słyszysz, działa.',
): Promise<string> {
  const text = message.trim();
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return 'Brak speechSynthesis w przeglądarce.';
    }
    speakWebFallback(text, 'pl-PL', ++speakSeq);
    const n = window.speechSynthesis.getVoices().length;
    return `Web TTS · głosy: ${n}. Sprawdź głośność karty / systemu.`;
  }

  let voices: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>> = [];
  try {
    voices = await loadVoices();
  } catch (e) {
    return `expo-speech niedostępne: ${e instanceof Error ? e.message : String(e)}. Zrób reload Expo Go.`;
  }

  if (!voices.length) {
    return 'Brak głosów TTS w systemie. Zainstaluj „Silnik syntezy mowy Google”, włącz język PL, głośność multimediów > 0.';
  }

  const voice = pickVoice(voices, 'pl');
  const sample = voices
    .slice(0, 3)
    .map((v) => `${v.name} (${v.language})`)
    .join(', ');

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (msg: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(msg);
    };
    const timer = setTimeout(
      () =>
        finish(
          `TTS wysłany, brak onStart (głosów: ${voices.length}). Sprawdź głośność MULTIMEDIÓW. Przykłady: ${sample}`,
        ),
      3500,
    );

    const opts: Speech.SpeechOptions = {
      language: Platform.OS === 'android' ? androidLangCode(voice?.language || 'pl') : voice?.language || 'pl-PL',
      pitch: 1,
      rate: 1,
      volume: 1,
      useApplicationAudioSession: false,
      onStart: () => finish(`Mówi („${voice?.name || 'default'}”) · głosów: ${voices.length}`),
      onDone: () => finish(`OK · TTS skończył · głosów: ${voices.length}`),
      onError: (err) =>
        finish(
          `Błąd TTS: ${err?.message || String(err)} · głosów: ${voices.length}. Spróbuj: ${sample}`,
        ),
    };
    if (voice?.identifier) opts.voice = voice.identifier;

    try {
      void (async () => {
        try {
          if (await Speech.isSpeakingAsync()) await Speech.stop();
        } catch {
          /* ignore */
        }
        Speech.speak(text, opts);
      })();
    } catch (e) {
      finish(`Wyjątek: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

function speakWebFallback(text: string, lang: string, seq = speakSeq) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
  } catch {
    /* ignore */
  }
  try {
    synth.resume();
  } catch {
    /* ignore */
  }

  const utter = () => {
    if (seq !== speakSeq) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      const voice = pickPolishVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang || lang;
      }
      synth.speak(u);
    } catch {
      /* ignore */
    }
  };

  utter();
  if (!synth.getVoices().length) {
    const once = () => {
      synth.removeEventListener('voiceschanged', once);
      if (seq === speakSeq) utter();
    };
    synth.addEventListener('voiceschanged', once);
  }
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT_A11Y);
  const [screenReader, setScreenReader] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const focusedId = useRef<string | null>(null);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>;
          setPrefs({ ...DEFAULT_A11Y, ...parsed });
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (webPrefersReducedMotion()) {
        setPrefs((p) => (p.reduceMotion ? p : { ...p, reduceMotion: true }));
      }
      try {
        window.speechSynthesis?.getVoices();
        window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
          window.speechSynthesis.getVoices();
        });
      } catch {
        /* ignore */
      }
      return;
    }
    // Rozgrzej silnik TTS (Android init jest lazy)
    void Speech.getAvailableVoicesAsync().catch(() => {});
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  const persist = useCallback(async (next: AccessibilityPrefs) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const setPref = useCallback(
    <K extends keyof AccessibilityPrefs>(key: K, value: AccessibilityPrefs[K]) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        void persist(next);
        return next;
      });
      if (key === 'exploreTap' && !value) {
        focusedId.current = null;
        setCaption(null);
        stopSpeech();
      }
    },
    [persist],
  );

  const resetPrefs = useCallback(() => {
    focusedId.current = null;
    setCaption(null);
    stopSpeech();
    setPrefs(DEFAULT_A11Y);
    void persist(DEFAULT_A11Y);
  }, [persist]);

  const clearCaption = useCallback(() => {
    setCaption(null);
    if (captionTimer.current) {
      clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }
  }, []);

  const showCaption = useCallback((message: string) => {
    setCaption(message);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), 4500);
  }, []);

  const speak = useCallback((message: string) => {
    showCaption(message);
    speakNow(message);
  }, [showCaption]);

  const announce = useCallback(
    (message: string) => {
      if (!prefs.announceChanges && !screenReader && !prefs.exploreTap) return;
      showCaption(message);
      if (Platform.OS === 'web') {
        const el = document.getElementById('rpilot-a11y-live');
        if (el) el.textContent = message;
      }
      speakNow(message);
      try {
        AccessibilityInfo.announceForAccessibility(message);
      } catch {
        /* ignore */
      }
    },
    [prefs.announceChanges, prefs.exploreTap, screenReader, showCaption],
  );

  const explorePress = useCallback(
    (id: string, label: string, activate: () => void) => {
      if (!prefs.exploreTap) {
        activate();
        return false;
      }
      if (focusedId.current === id) {
        focusedId.current = null;
        // Krótki sygnał głosowy, potem akcja — bez długiego „Aktywuję…”
        speakNow('OK');
        setTimeout(() => activate(), 350);
        return false;
      }
      focusedId.current = id;
      speak(label);
      return true;
    },
    [prefs.exploreTap, speak],
  );

  const colors = useMemo(
    () => (prefs.highContrast ? highContrastColors() : ({ ...BASE_COLORS } as typeof baseColors)),
    [prefs.highContrast],
  );
  const textScale = prefs.largeText ? 1.45 : 1;
  const touchScale = prefs.largeTouchTargets ? 1.35 : 1;
  const iconScale = prefs.largeTouchTargets ? 1.28 : 1;
  const btnBoost = prefs.largeTouchTargets
    ? { minHeight: 56, paddingVertical: 14, paddingHorizontal: 16 }
    : null;

  useEffect(() => {
    applyThemeMode(prefs.highContrast);
  }, [prefs.highContrast]);

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      setPref,
      resetPrefs,
      colors,
      textScale,
      touchScale,
      iconScale,
      btnBoost,
      announce,
      speak,
      explorePress,
      caption,
      clearCaption,
    }),
    [
      prefs,
      setPref,
      resetPrefs,
      colors,
      textScale,
      touchScale,
      iconScale,
      btnBoost,
      announce,
      speak,
      explorePress,
      caption,
      clearCaption,
    ],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): Ctx {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility outside provider');
  return ctx;
}

export function a11yFont(base: number, scale: number): number {
  return Math.round(base * scale);
}

type A11yPressableProps = PressableProps & {
  /** Unikalne id w trybie explore (domyślnie = accessibilityLabel). */
  exploreId?: string;
  accessibilityLabel?: string;
  /** Powiększ ten przycisk przy „większe przyciski” (domyślnie tak). */
  boost?: boolean;
};

function childLabel(children: ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    for (const c of children) {
      const t = childLabel(c);
      if (t) return t;
    }
    return null;
  }
  if (children && typeof children === 'object' && 'props' in children) {
    const p = (children as { props?: { children?: ReactNode } }).props;
    if (p?.children != null) return childLabel(p.children);
  }
  return null;
}

/** Pressable z trybem VoiceOver: 1. tap odczyt, 2. tap aktywacja. */
export function A11yPressable({
  exploreId,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
  style,
  boost = true,
  ...rest
}: A11yPressableProps) {
  const { explorePress, prefs, colors, btnBoost } = useAccessibility();
  const label =
    accessibilityLabel ||
    childLabel(typeof children === 'function' ? null : children) ||
    exploreId ||
    'Przycisk';
  const id = exploreId || label;

  return (
    <Pressable
      {...rest}
      accessibilityLabel={label}
      accessibilityHint={
        prefs.exploreTap
          ? `Tryb odczytu: pierwsze kliknięcie czyta, drugie uruchamia. ${accessibilityHint || ''}`
          : accessibilityHint
      }
      hitSlop={rest.hitSlop ?? (prefs.largeTouchTargets ? 12 : undefined)}
      onPress={(e) => {
        explorePress(id, label, () => {
          onPress?.(e);
        });
      }}
      style={(state) => [
        boost ? btnBoost : null,
        typeof style === 'function' ? style(state) : style,
        prefs.exploreTap && state.pressed ? { borderWidth: 3, borderColor: colors.accent } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Skala rozmiaru przycisku / chipa wg „większe przyciski”. */
export function useA11yControl() {
  const { prefs, btnBoost, iconScale, textScale, touchScale } = useAccessibility();
  return {
    big: prefs.largeTouchTargets,
    btnBoost,
    iconScale,
    textScale,
    touchScale,
    font: (n: number) => a11yFont(n, textScale),
  };
}

/** Pasek z odczytanym tekstem (transkrypcja). */
export function A11yCaptionBar() {
  const { caption, clearCaption, colors, textScale, prefs } = useAccessibility();
  if (!caption) return null;
  return (
    <View
      style={[
        styles.caption,
        {
          backgroundColor: prefs.highContrast ? '#000' : '#111',
          borderColor: colors.accent,
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Text
        style={[
          styles.captionText,
          { color: prefs.highContrast ? '#ffcc00' : '#fff', fontSize: a11yFont(15, textScale) },
        ]}
      >
        {caption}
      </Text>
      <Pressable onPress={clearCaption} hitSlop={10} accessibilityLabel="Zamknij napis">
        <Text style={{ color: prefs.highContrast ? '#ffcc00' : '#aaa', fontWeight: '800' }}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 72,
    zIndex: 50,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captionText: {
    flex: 1,
    fontWeight: '700',
    lineHeight: 20,
  },
});
