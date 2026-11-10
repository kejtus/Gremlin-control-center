import { StyleSheet, Text, View } from 'react-native';
import { A11yPressable, a11yFont, useAccessibility } from '../accessibility';
import { useLayout } from '../layout';

export type AppTab =
  | 'drive'
  | 'follow'
  | 'lidar'
  | 'dances'
  | 'path'
  | 'code'
  | 'pad'
  | 'sounds'
  | 'voice'
  | 'status';

type Props = {
  value: AppTab;
  onChange: (tab: AppTab) => void;
  /** Gdy pasek jest wewnątrz obramowanej karty — bez własnego marginesu / bocznych obwódek. */
  embedded?: boolean;
};

const TAB_META: Record<AppTab, { label: string; short: string; hint: string }> = {
  drive: { label: 'Sterowanie', short: 'Ster', hint: 'Joystick, kamera i stop' },
  follow: { label: 'Opaska', short: 'Opaska', hint: 'Kamera i podążanie za opaską na nodze' },
  lidar: { label: 'Lidar', short: 'Lidar', hint: 'Mapa otoczenia robota' },
  dances: { label: 'Tańce', short: 'Taniec', hint: 'Gotowe sekwencje ruchu' },
  path: { label: 'Trasa', short: 'Trasa', hint: 'Planowanie ścieżki na polu' },
  code: { label: 'Scratch', short: 'Kod', hint: 'Programowanie blokami' },
  pad: { label: 'Pad', short: 'Pad', hint: 'Mapowanie pada Bluetooth' },
  sounds: { label: 'Dźwięki', short: 'Dźwięk', hint: 'Odtwarzanie plików audio' },
  voice: { label: 'Głos', short: 'Głos', hint: 'Sterowanie komendami głosowymi' },
  status: { label: 'Status', short: 'Info', hint: 'Bateria, czujniki i urządzenia' },
};

const TABS: { id: AppTab; Icon: typeof DriveIcon }[] = [
  { id: 'drive', Icon: DriveIcon },
  { id: 'follow', Icon: FollowIcon },
  { id: 'lidar', Icon: LidarIcon },
  { id: 'dances', Icon: DanceIcon },
  { id: 'path', Icon: PathIcon },
  { id: 'code', Icon: CodeIcon },
  { id: 'pad', Icon: PadIcon },
  { id: 'sounds', Icon: SpeakerIcon },
  { id: 'voice', Icon: MicIcon },
  { id: 'status', Icon: StatusIcon },
];

export function TabBar({ value, onChange, embedded = false }: Props) {
  const layout = useLayout();
  const { colors, textScale, prefs, iconScale } = useAccessibility();
  const showLabels = layout.showTabLabels;
  const labelSize = Math.max(8, Math.min(12, a11yFont(layout.tabLabelSize, textScale)));
  // Skala ikon bez transform (transform + overflow przycina górę)
  const iconMul = Math.min(1.22, (showLabels ? (layout.phone ? 0.88 : 0.95) : 1) * iconScale);
  const n = TABS.length;
  const r = layout.cardRadius;
  const bw = layout.cardBorder;
  const borderCol = colors.cardBorder;

  return (
    <View
      style={[
        styles.bar,
        {
          height: layout.tabH,
          paddingTop: layout.tabPadTop,
          marginHorizontal: embedded ? 0 : layout.cardMx,
          paddingHorizontal: 0,
          backgroundColor: colors.tabBar,
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderLeftWidth: embedded ? 0 : bw,
          borderRightWidth: embedded ? 0 : bw,
          borderTopWidth: embedded ? 0 : bw,
          borderColor: borderCol,
          overflow: 'visible',
        },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map(({ id, Icon }, index) => {
        const on = value === id;
        const meta = TAB_META[id];
        const shown = meta.short;
        const isFirst = index === 0;
        const isLast = index === n - 1;
        const iconFg = prefs.highContrast && on ? '#000000' : '#ffffff';
        return (
          <A11yPressable
            key={id}
            exploreId={`tab-${id}`}
            boost={false}
            onPress={() => onChange(id)}
            style={[
              styles.tab,
              {
                flex: 1,
                minWidth: 0,
                height: on ? layout.tabOnH : layout.tabIdleH,
                paddingTop: showLabels ? 2 : 4,
                paddingHorizontal: 0,
                borderTopLeftRadius: isFirst ? Math.max(0, r - bw) : 0,
                borderTopRightRadius: isLast ? Math.max(0, r - bw) : 0,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                backgroundColor: on ? colors.tabActive : colors.tabIdle,
                borderWidth: 0,
                zIndex: on ? 2 : 1,
              },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={meta.label}
            accessibilityHint={meta.hint}
          >
            <View
              style={{
                width: Math.round(36 * iconMul),
                height: Math.round(28 * iconMul),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon fg={iconFg} hole={on ? colors.tabActive : colors.tabIdle} scale={iconMul} />
            </View>
            {showLabels ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={[
                  styles.tabLabel,
                  {
                    color: prefs.highContrast && on ? '#000' : '#fff',
                    fontSize: labelSize,
                    fontWeight: on ? '800' : '700',
                  },
                ]}
              >
                {shown}
              </Text>
            ) : null}
          </A11yPressable>
        );
      })}
    </View>
  );
}

type IconProps = { fg: string; hole: string; scale: number };

function DriveIcon({ fg, hole, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s }}>
      <View
        style={{
          position: 'absolute',
          left: 1 * s,
          right: 1 * s,
          top: 6 * s,
          height: 16 * s,
          borderRadius: 8 * s,
          backgroundColor: fg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 6 * s,
          top: 11 * s,
          width: 8 * s,
          height: 8 * s,
          borderRadius: 4 * s,
          backgroundColor: hole,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 6 * s,
          top: 11 * s,
          width: 8 * s,
          height: 8 * s,
          borderRadius: 4 * s,
          backgroundColor: hole,
        }}
      />
    </View>
  );
}

/** Osoba + „ogon” śledzenia — zakładka Opaska. */
function FollowIcon({ fg, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s }}>
      <View
        style={{
          position: 'absolute',
          left: 14 * s,
          top: 2 * s,
          width: 8 * s,
          height: 8 * s,
          borderRadius: 4 * s,
          backgroundColor: fg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 12 * s,
          top: 11 * s,
          width: 12 * s,
          height: 10 * s,
          borderRadius: 3 * s,
          backgroundColor: fg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 3 * s,
          top: 20 * s,
          width: 10 * s,
          height: 3 * s,
          borderRadius: 1.5 * s,
          backgroundColor: fg,
          opacity: 0.85,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 24 * s,
          top: 20 * s,
          width: 8 * s,
          height: 3 * s,
          borderRadius: 1.5 * s,
          backgroundColor: fg,
          opacity: 0.55,
        }}
      />
    </View>
  );
}

function LidarIcon({ fg, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 22 * s,
          height: 22 * s,
          borderRadius: 11 * s,
          borderWidth: 2 * s,
          borderColor: fg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: 12 * s,
            height: 12 * s,
            borderRadius: 6 * s,
            borderWidth: 1.5 * s,
            borderColor: fg,
            opacity: 0.7,
          }}
        />
        <View
          style={{
            width: 5 * s,
            height: 5 * s,
            borderRadius: 3 * s,
            backgroundColor: fg,
          }}
        />
      </View>
    </View>
  );
}

function DanceIcon({ fg, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s }}>
      <View
        style={{
          position: 'absolute',
          left: 12 * s,
          top: 2 * s,
          width: 2.5 * s,
          height: 16 * s,
          backgroundColor: fg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 14 * s,
          width: 10 * s,
          height: 7 * s,
          borderRadius: 5 * s,
          backgroundColor: fg,
          transform: [{ rotate: '-20deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 18 * s,
          top: 10 * s,
          width: 10 * s,
          height: 7 * s,
          borderRadius: 5 * s,
          backgroundColor: fg,
          transform: [{ rotate: '-20deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 26 * s,
          top: 2 * s,
          width: 2.5 * s,
          height: 12 * s,
          backgroundColor: fg,
        }}
      />
    </View>
  );
}

function PathIcon({ fg, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s }}>
      <View
        style={{
          position: 'absolute',
          left: 6 * s,
          top: 16 * s,
          width: 20 * s,
          height: 2.5 * s,
          backgroundColor: fg,
          borderRadius: 2 * s,
          transform: [{ rotate: '-28deg' }],
        }}
      />
      {[
        [4, 18],
        [14, 8],
        [24, 14],
      ].map(([l, t], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: l * s,
            top: t * s,
            width: 6 * s,
            height: 6 * s,
            borderRadius: 3 * s,
            backgroundColor: fg,
          }}
        />
      ))}
    </View>
  );
}

function CodeIcon({ fg, scale: s }: IconProps) {
  const rows = [
    { top: 4, left: 7, width: 18 },
    { top: 11, left: 5, width: 22 },
    { top: 18, left: 9, width: 14 },
  ];
  return (
    <View style={{ width: 36 * s, height: 28 * s }}>
      {rows.map((row, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: row.left * s,
            top: row.top * s,
            width: row.width * s,
            height: 5 * s,
            borderRadius: 2 * s,
            backgroundColor: fg,
          }}
        />
      ))}
    </View>
  );
}

function PadIcon({ fg, hole, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 28 * s,
          height: 18 * s,
          borderRadius: 8 * s,
          backgroundColor: fg,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 4 * s,
            top: 8 * s,
            width: 7 * s,
            height: 7 * s,
            borderRadius: 4 * s,
            backgroundColor: hole,
          }}
        />
        <View
          style={{
            position: 'absolute',
            right: 5 * s,
            top: 5 * s,
            width: 6 * s,
            height: 6 * s,
            borderRadius: 3 * s,
            backgroundColor: hole,
          }}
        />
        <View
          style={{
            position: 'absolute',
            right: 12 * s,
            top: 11 * s,
            width: 5 * s,
            height: 5 * s,
            borderRadius: 3 * s,
            backgroundColor: hole,
          }}
        />
      </View>
    </View>
  );
}

function SpeakerIcon({ fg, hole, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 20 * s,
          height: 20 * s,
          borderRadius: 5 * s,
          backgroundColor: fg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 12 * s,
            height: 12 * s,
            borderRadius: 6 * s,
            backgroundColor: hole,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 4 * s,
              height: 4 * s,
              borderRadius: 2 * s,
              backgroundColor: fg,
            }}
          />
        </View>
      </View>
    </View>
  );
}

function MicIcon({ fg, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s, alignItems: 'center' }}>
      <View
        style={{
          width: 13 * s,
          height: 18 * s,
          borderRadius: 7 * s,
          backgroundColor: fg,
        }}
      />
      <View style={{ width: 3 * s, height: 6 * s, backgroundColor: fg }} />
      <View
        style={{
          width: 16 * s,
          height: 3 * s,
          borderRadius: 1 * s,
          backgroundColor: fg,
        }}
      />
    </View>
  );
}

function StatusIcon({ fg, scale: s }: IconProps) {
  return (
    <View style={{ width: 36 * s, height: 28 * s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 13 * s,
          height: 22 * s,
          borderBottomWidth: 4 * s,
          borderRightWidth: 4 * s,
          borderColor: fg,
          transform: [{ rotate: '40deg' }, { translateY: -2 * s }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    marginTop: 0,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 0,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 4,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
