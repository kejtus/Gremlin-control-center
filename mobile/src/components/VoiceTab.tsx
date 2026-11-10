import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont } from '../accessibility';
import { useLayout } from '../layout';
import { usePhoneSpeech } from '../net/usePhoneSpeech';
import type { VoiceAction } from '../net/voiceCommands';
import { soundControlPath } from '../protocol';
import { makeUi, space } from '../ui';

type Props = {
  online: boolean;
  onDrive: (x: number, y: number, omega?: number) => void;
  onStop: () => void;
  onPlaySound: (file: string, volume?: number) => void;
  onFollowBands: (enabled: boolean) => void;
};

export function VoiceTab({ online, onDrive, onStop, onPlaySound, onFollowBands }: Props) {
  const styles = useStyles();
  const { colors, prefs } = useAccessibility();
  const ui = useMemo(() => makeUi(colors, prefs.highContrast), [colors, prefs.highContrast]);
  const layout = useLayout();
  const scrollRef = useRef<ScrollView>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const drivingRef = useRef(false);

  const runAction = useCallback(
    (action: VoiceAction) => {
      if (!online) return;
      switch (action.kind) {
        case 'stop':
          drivingRef.current = false;
          onStop();
          setActiveLabel('STOP');
          break;
        case 'drive':
          drivingRef.current = true;
          onDrive(action.vx, action.vy, action.omega);
          setActiveLabel(action.label);
          break;
        case 'bark':
          onPlaySound(soundControlPath('bark.mp3'), 1);
          setActiveLabel('szczekaj');
          break;
        case 'follow':
          if (action.enabled) {
            drivingRef.current = false;
            onStop();
          }
          onFollowBands(action.enabled);
          setActiveLabel(action.label);
          break;
        default:
          break;
      }
    },
    [online, onDrive, onStop, onPlaySound, onFollowBands],
  );

  const speech = usePhoneSpeech({ onAction: runAction });

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [speech.lines, speech.interim]);

  useEffect(() => {
    if (speech.listening) return;
    if (drivingRef.current) {
      drivingRef.current = false;
      onStop();
      setActiveLabel((prev) => (prev && prev !== 'STOP' ? 'STOP' : prev));
    }
  }, [speech.listening, onStop]);

  useEffect(
    () => () => {
      if (drivingRef.current) {
        drivingRef.current = false;
        onStop();
      }
    },
    [onStop],
  );

  const stateLabel = speech.listening
    ? 'Słucham'
    : speech.busy
      ? 'Chwila…'
      : speech.modelReady
        ? 'Gotowy'
        : 'Ładowanie';

  return (
    <View style={styles.wrap}>
      <View style={[styles.panel, { flex: layout.camFlex }]}>
        <View style={styles.head}>
          <View>
            <Text style={styles.title}>Sterowanie głosem</Text>
            <Text style={styles.sub}>Vosk offline · bez Google</Text>
          </View>
          <View style={[styles.badge, (speech.listening || speech.busy) && styles.badgeLive]}>
            <Text style={[styles.badgeText, (speech.listening || speech.busy) && styles.badgeTextLive]}>
              {stateLabel}
            </Text>
          </View>
        </View>

        {activeLabel ? (
          <View style={styles.activeBar}>
            <Text style={styles.activeText}>{online ? activeLabel : `${activeLabel} · offline`}</Text>
          </View>
        ) : null}

        {speech.listening ? (
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${Math.round(Math.max(0.04, speech.level) * 100)}%` }]} />
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.log}
          contentContainerStyle={styles.logContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {speech.lines.length === 0 && !speech.interim ? (
            <Text style={styles.placeholder}>
              {speech.mode === 'none'
                ? 'Zainstaluj APK — mikrofon offline nie działa w Expo Go.'
                : !online
                  ? 'Połącz z robotem, potem naciśnij Słuchaj. Komendy: do przodu, do tyłu, w lewo, w prawo, stop, daj głos, podążaj za mną.'
                  : 'Słuchaj ciągle. Jazda trwa do „stop”. „Daj głos” = szczek. „Podążaj za mną” = opaski.'}
            </Text>
          ) : null}
          {speech.lines.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 12)}`} style={styles.line}>
              {line}
            </Text>
          ))}
          {speech.interim ? <Text style={styles.interim}>{speech.interim}</Text> : null}
        </ScrollView>
        {speech.error ? <Text style={styles.error}>{speech.error}</Text> : null}
      </View>

      <View style={[styles.bottom, { flex: layout.joyFlex }]}>
        <A11yPressable
          onPress={() => speech.toggle()}
          disabled={speech.mode === 'none' || (speech.busy && !speech.listening)}
          style={[
            speech.listening || speech.busy ? ui.btnDanger : ui.btnPrimary,
            styles.mainBtn,
          ]}
        >
          <Text style={ui.btnPrimaryText}>
            {speech.mode === 'none'
              ? 'Potrzebny APK'
              : speech.busy
                ? 'Zatrzymuję…'
                : speech.listening
                  ? 'Zatrzymaj'
                  : 'Słuchaj i steruj'}
          </Text>
        </A11yPressable>
      </View>
    </View>
  );
}

function useStyles() {
  const { colors, textScale, prefs } = useAccessibility();
  const hc = prefs.highContrast;
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { flex: 1, minHeight: 0 },
        panel: {
          minHeight: 0,
          margin: space.md,
          marginBottom: 0,
          backgroundColor: hc ? '#000' : colors.bgRaised,
          borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
          overflow: 'hidden',
        },
        head: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: space.md,
          paddingVertical: space.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
          gap: space.sm,
        },
        title: {
          color: colors.ink,
          fontSize: a11yFont(16, textScale),
          fontWeight: '700',
        },
        sub: {
          color: colors.muted,
          fontSize: a11yFont(12, textScale),
          marginTop: 2,
        },
        badge: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: colors.button,
          borderWidth: 1,
          borderColor: colors.line,
        },
        badgeLive: {
          backgroundColor: colors.dangerSoft,
          borderColor: colors.danger,
        },
        badgeText: {
          color: colors.muted,
          fontSize: a11yFont(11, textScale),
          fontWeight: '700',
        },
        badgeTextLive: { color: colors.danger },
        activeBar: {
          paddingHorizontal: space.md,
          paddingVertical: 8,
          backgroundColor: hc ? colors.ok : 'rgba(31, 122, 46, 0.12)',
        },
        activeText: {
          color: hc ? '#000' : colors.ok,
          fontSize: a11yFont(13, textScale),
          fontWeight: '700',
        },
        meterTrack: { height: 3, backgroundColor: colors.line },
        meterFill: { height: 3, backgroundColor: colors.ok },
        log: { flex: 1 },
        logContent: { padding: space.md, gap: 6, flexGrow: 1 },
        placeholder: {
          color: colors.muted,
          fontSize: a11yFont(13, textScale),
          lineHeight: Math.round(19 * textScale),
        },
        line: {
          color: colors.ink,
          fontSize: a11yFont(14, textScale),
          lineHeight: Math.round(20 * textScale),
        },
        interim: {
          color: colors.muted,
          fontSize: a11yFont(14, textScale),
          fontStyle: 'italic',
        },
        error: {
          color: colors.danger,
          fontSize: a11yFont(12, textScale),
          paddingHorizontal: space.md,
          paddingBottom: space.sm,
        },
        bottom: {
          minHeight: 0,
          justifyContent: 'center',
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
        },
        mainBtn: { width: '100%' },
      }),
    [colors, textScale, hc],
  );
}
