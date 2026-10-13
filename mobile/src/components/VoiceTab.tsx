import { useEffect, useRef , useMemo} from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont} from '../accessibility';
import { useLayout } from '../layout';
import { usePhoneSpeech } from '../net/usePhoneSpeech';
import { colors, radii } from '../theme';

export function VoiceTab() {
  const styles = useStyles();
  const speech = usePhoneSpeech();
  const scrollRef = useRef<ScrollView>(null);
  const layout = useLayout();

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [speech.lines, speech.interim]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.termSlot, { flex: layout.camFlex }]}>
        <View style={[styles.termHead, layout.phone && { paddingVertical: 6, paddingHorizontal: 10 }]}>
          <Text style={styles.termTitle}>mikrofon · telefon</Text>
          <Text style={[styles.termState, (speech.listening || speech.busy) && styles.termLive]}>
            {speech.listening ? 'REC' : speech.busy ? 'WAIT' : 'IDLE'}
          </Text>
        </View>
        {speech.listening ? (
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${Math.round(Math.max(0.04, speech.level) * 100)}%` }]} />
          </View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          style={styles.termBody}
          contentContainerStyle={[styles.termContent, layout.phone && { padding: 10 }]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {speech.lines.length === 0 && !speech.interim ? (
            <Text style={styles.placeholder}>
              {speech.mode === 'none'
                ? 'Zbuduj APK — Expo Go nie ma pełnego mikrofonu.'
                : speech.mode === 'web'
                  ? 'Przeglądarka: naciśnij, powiedz komendę, zatrzymaj (Whisper na PC tylko do testów).'
                  : speech.mode === 'hybrid' || speech.mode === 'native' || speech.mode === 'os'
                    ? 'Naciśnij → powiedz np. „idź” → zatrzymaj. Działa też na krótkich komendach.'
                    : 'Naciśnij, mów, zatrzymaj.'}
            </Text>
          ) : null}
          {speech.lines.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 12)}`} style={styles.line}>
              <Text style={styles.prompt}>{'> '}</Text>
              {line}
            </Text>
          ))}
          {speech.interim ? (
            <Text style={styles.interim}>
              <Text style={styles.prompt}>{'> '}</Text>
              {speech.interim}
            </Text>
          ) : null}
        </ScrollView>
        {speech.error ? <Text style={styles.error}>{speech.error}</Text> : null}
      </View>

      <View
        style={[
          styles.bottom,
          {
            flex: layout.joyFlex,
            paddingHorizontal: layout.phone ? 10 : 16,
          },
        ]}
      >
        <A11yPressable
          onPress={() => speech.toggle()}
          disabled={speech.mode === 'none' || (speech.busy && !speech.listening)}
          style={[
            styles.rec,
            layout.phone && { paddingVertical: 12 },
            (speech.listening || speech.busy) && styles.recOn,
          ]}
        >
          <Text style={styles.recText}>
            {speech.mode === 'none'
              ? 'Potrzebny APK'
              : speech.busy
                ? 'Rozpoznawanie…'
                : speech.listening
                  ? 'Zatrzymaj'
                  : 'Nagrywaj i rozpoznawaj'}
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
        wrap: {
          flex: 1,
          minHeight: 0,
        },
        termSlot: {
          minHeight: 0,
          backgroundColor: hc ? '#000' : '#121212',
        },
        termHead: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: hc ? colors.line : '#2a2a2a',
        },
        termTitle: {
          color: hc ? colors.muted : '#8a8a8a',
          fontFamily: 'monospace',
          fontSize: a11yFont(12, textScale),
          letterSpacing: 0.4,
        },
        termState: {
          color: hc ? colors.muted : '#8a8a8a',
          fontFamily: 'monospace',
          fontSize: a11yFont(11, textScale),
          fontWeight: '800',
        },
        termLive: {
          color: colors.danger,
        },
        meterTrack: {
          height: 3,
          backgroundColor: hc ? '#333' : '#2a2a2a',
        },
        meterFill: {
          height: 3,
          backgroundColor: colors.ok,
        },
        termBody: {
          flex: 1,
        },
        termContent: {
          padding: 12,
          gap: 8,
          flexGrow: 1,
        },
        placeholder: {
          color: hc ? colors.muted : '#6e6e6e',
          fontFamily: 'monospace',
          fontSize: a11yFont(13, textScale),
          lineHeight: Math.round(20 * textScale),
        },
        line: {
          color: hc ? colors.ink : '#d8d8d8',
          fontFamily: 'monospace',
          fontSize: a11yFont(14, textScale),
          lineHeight: Math.round(21 * textScale),
        },
        prompt: {
          color: colors.ok,
          fontFamily: 'monospace',
          fontWeight: '700',
        },
        interim: {
          color: hc ? colors.muted : '#8a8a8a',
          fontFamily: 'monospace',
          fontSize: a11yFont(14, textScale),
          lineHeight: Math.round(21 * textScale),
          fontStyle: 'italic',
        },
        error: {
          color: colors.danger,
          fontFamily: 'monospace',
          fontSize: a11yFont(12, textScale),
          paddingHorizontal: 12,
          paddingBottom: 8,
        },
        bottom: {
          minHeight: 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        },
        rec: {
          width: '100%',
          backgroundColor: colors.tabBar,
          borderRadius: radii.md,
          paddingVertical: 16,
          alignItems: 'center',
        },
        recOn: {
          backgroundColor: colors.danger,
        },
        recText: {
          color: hc ? '#000' : '#fff',
          fontWeight: '800',
          fontSize: a11yFont(15, textScale),
          letterSpacing: 0.3,
        },
      }),
    [colors, textScale, hc],
  );
}

