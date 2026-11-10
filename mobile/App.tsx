import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AccessibilityProvider, A11yCaptionBar, A11yPressable, a11yFont, useAccessibility } from './src/accessibility';
import { A11yLiveRegion } from './src/components/A11yLiveRegion';
import { AccessibilityPanel } from './src/components/AccessibilityPanel';
import { ConnectPanel } from './src/components/ConnectPanel';
import { DanceTab } from './src/components/DanceTab';
import { DrivePane } from './src/components/DrivePane';
import { FollowBandTab } from './src/components/FollowBandTab';
import { FooterBar } from './src/components/FooterBar';
import { GamepadTab } from './src/components/GamepadTab';
import { LidarTab } from './src/components/LidarTab';
import { PathTab } from './src/components/PathTab';
import { ScratchTab } from './src/components/ScratchTab';
import { SpeakerTab } from './src/components/SpeakerTab';
import { StatusTab } from './src/components/StatusTab';
import { TabBar, type AppTab } from './src/components/TabBar';
import { VoiceTab } from './src/components/VoiceTab';
import { ErrorBoundary } from './src/ErrorBoundary';
import { buildPadSyncPackets } from './src/gamepadBindings';
import { useLayout } from './src/layout';
import { useRobot } from './src/net/useRobot';
import { loadPadBindings } from './src/storage';
import { colors as defaultColors } from './src/theme';

function AppShell() {
  const robot = useRobot();
  const online = robot.phase === 'online';
  const live = online && !robot.preview;
  const [tab, setTab] = useState<AppTab>('drive');
  const [a11yOpen, setA11yOpen] = useState(false);
  const layout = useLayout();
  const { colors, textScale, announce, prefs } = useAccessibility();

  const pickTab = (next: AppTab) => {
    setTab(next);
    const labels: Record<AppTab, string> = {
      drive: 'Sterowanie',
      follow: 'Opaska',
      lidar: 'Lidar',
      dances: 'Tańce',
      path: 'Trasa',
      code: 'Scratch',
      pad: 'Pad',
      sounds: 'Dźwięki',
      voice: 'Głos',
      status: 'Status',
    };
    announce(`Zakładka ${labels[next]}`);
  };

  useEffect(() => {
    void activateKeepAwakeAsync('rpilot').catch(() => {});
    return () => {
      try {
        deactivateKeepAwake('rpilot');
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Połączenie / rozłączenie — ogłoszenie dla TTS i czytników ekranu.
  useEffect(() => {
    if (robot.phase === 'online') {
      announce(
        robot.preview
          ? 'Tryb podglądu interfejsu. Robot nie jest podłączony.'
          : `Połączono z robotem ${robot.active?.name || 'Gremlin'}. Program sterowania włączony.`,
      );
    } else if (robot.phase === 'offline' && robot.error) {
      announce(robot.error);
    }
  }, [robot.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- tylko zmiana fazy

  // Po połączeniu z Pi — pad_config + keymap.json.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const bindings = await loadPadBindings();
        if (cancelled) return;
        robot.sendPackets(buildPadSyncPackets(bindings));
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [live, robot.sendPackets]);

  return (
    <View style={[styles.shell, { paddingTop: layout.padTop, backgroundColor: colors.bg }]}>
      <A11yLiveRegion />
      <StatusBar style={prefs.highContrast ? 'light' : 'dark'} />
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: layout.headerPadX,
            paddingTop: layout.headerPadY,
            paddingBottom: layout.phone ? 8 : layout.compact ? 8 : 10,
          },
        ]}
      >
        <Text
          style={[
            styles.brand,
            { fontSize: a11yFont(layout.brandSize, textScale), color: colors.ink },
          ]}
          accessibilityRole="header"
        >
          GREMLIN
        </Text>
        <View style={styles.previewRow}>
          {robot.preview && layout.showPreviewTag ? (
            <Text style={[styles.previewTag, { color: colors.muted, fontSize: a11yFont(11, textScale) }]}>
              podgląd UI
            </Text>
          ) : null}
          <A11yPressable
            exploreId="header-a11y"
            onPress={() => setA11yOpen(true)}
            style={[
              styles.a11yBtn,
              {
                backgroundColor: colors.accent,
                borderColor: colors.ink,
                minHeight: layout.phone ? 40 : 44,
                paddingHorizontal: layout.phone ? 10 : 12,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Ustawienia dostępności"
            accessibilityHint="Duży tekst, kontrast, odczyt dwuklik"
            hitSlop={10}
          >
            <Text
              style={[
                styles.a11yBtnText,
                {
                  color: colors.bg === '#000000' ? '#000' : '#fff',
                  fontSize: a11yFont(layout.phone ? 12 : 13, textScale),
                },
              ]}
            >
              {layout.phone ? 'Aa' : 'Dostępność'}
            </Text>
          </A11yPressable>
          {robot.preview ? (
            <A11yPressable
              exploreId="header-connect"
              onPress={() => void robot.retry()}
              style={[
                styles.connectBtn,
                { backgroundColor: colors.tabBar },
                layout.phone && { paddingHorizontal: 8, paddingVertical: 4 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Połącz z robotem"
            >
              <Text
                style={[
                  styles.connectText,
                  {
                    color: prefs.highContrast ? '#000' : '#fff',
                    fontSize: a11yFont(layout.phone ? 11 : 12, textScale),
                  },
                ]}
              >
                Połącz
              </Text>
            </A11yPressable>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.frame,
          {
            marginHorizontal: layout.cardMx,
            marginBottom: layout.cardMb,
            borderWidth: layout.cardBorder,
            borderRadius: layout.cardRadius,
            borderColor: colors.cardBorder,
            backgroundColor: colors.card,
          },
        ]}
      >
        {online ? (
          <TabBar value={tab} onChange={pickTab} embedded />
        ) : (
          <View
            style={[
              styles.tabStub,
              {
                height: layout.tabH,
                backgroundColor: colors.tabBar,
              },
            ]}
          />
        )}

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
          },
        ]}
      >
        {!online ? (
          <ConnectPanel
            phase={robot.phase}
            robots={robot.robots}
            error={robot.error}
            udpAvailable={robot.udpAvailable}
            onRetry={robot.retry}
            onPreview={robot.enterUiPreview}
            onOpenA11y={() => setA11yOpen(true)}
            onPick={(info) => void robot.connect(info)}
            onManual={(host) => void robot.connectManual(host)}
          />
        ) : tab === 'drive' && robot.active ? (
          <DrivePane
            info={robot.active}
            online={online}
            onStream={robot.setStream}
            onRegisterSink={robot.registerVideoSink}
            onDrive={robot.drive}
            remoteDrive={robot.drivePose}
            onStop={robot.stop}
          />
        ) : tab === 'follow' && robot.active ? (
          <FollowBandTab
            info={robot.active}
            online={live}
            followBand={robot.status?.followBand}
            onStream={robot.setStream}
            onRegisterSink={robot.registerVideoSink}
            onFollowBands={(enabled) => {
              void robot.command(enabled ? 'follow' : 'manual');
              if (!enabled) robot.stop();
            }}
          />
        ) : tab === 'lidar' ? (
          <LidarTab
            host={robot.active?.host ?? null}
            online={online && !robot.preview}
            preview={robot.preview}
          />
        ) : tab === 'dances' ? (
          <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
            <DanceTab onSendChannels={robot.sendChannels} onStop={robot.stop} />
          </ScrollView>
        ) : tab === 'path' ? (
          <PathTab online={live} onDrive={robot.drive} onStop={robot.stop} />
        ) : tab === 'code' ? (
          <ScratchTab
            online={live}
            onDrive={robot.drive}
            onStop={robot.stop}
            onPlaySound={robot.playSound}
            onStopSound={robot.stopSound}
            devicePower={robot.devicePower}
            batteryPct={robot.status?.batteryPct ?? 100}
            onSetDevicePower={robot.setDevicePowerEnabled}
          />
        ) : tab === 'pad' ? (
          <GamepadTab
            online={live}
            onSendPackets={robot.sendPackets}
          />
        ) : tab === 'sounds' ? (
          <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
            <SpeakerTab
              onPlay={robot.playSound}
              onPlayUpload={robot.playUploadedSound}
              onStop={robot.stopSound}
            />
          </ScrollView>
        ) : tab === 'voice' ? (
          <VoiceTab
            online={live}
            onDrive={robot.drive}
            onStop={robot.stop}
            onPlaySound={robot.playSound}
            onFollowBands={(enabled) => void robot.command(enabled ? 'follow' : 'manual')}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
            <StatusTab
              online={live}
              robotStatus={robot.status}
              componentStatus={robot.componentStatus}
              devicePower={robot.devicePower}
              adsValues={robot.adsValues}
              noiseProfile={robot.noiseProfile}
              audioFilter={robot.audioFilter}
              encoderTicks={robot.encoderTicks}
              onPoll={robot.requestSystemStatus}
              onSetDevicePower={robot.setDevicePowerEnabled}
            />
          </ScrollView>
        )}
      </View>
      </View>

      <FooterBar percent={robot.status?.batteryPct ?? null} onOpenA11y={() => setA11yOpen(true)} />
      <A11yCaptionBar />
      <AccessibilityPanel visible={a11yOpen} onClose={() => setA11yOpen(false)} />
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AccessibilityProvider>
        <AppShell />
      </AccessibilityProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: defaultColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  brand: {
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  previewTag: {
    fontWeight: '700',
  },
  a11yBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    zIndex: 20,
  },
  a11yBtnText: {
    fontWeight: '700',
  },
  connectBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  frame: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  tabStub: {},
  card: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 16,
  },
});
