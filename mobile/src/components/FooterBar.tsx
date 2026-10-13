import { Image, StyleSheet, Text, View } from 'react-native';
import { A11yPressable, a11yFont, useAccessibility } from '../accessibility';
import { useLayout } from '../layout';

const logoGest = require('../../assets/logo-gest.png');
const logoRobolab = require('../../assets/logo-robolab.png');

type Props = {
  percent: number | null;
  onOpenA11y?: () => void;
};

export function FooterBar({ percent, onOpenA11y }: Props) {
  const layout = useLayout();
  const { colors, textScale, prefs } = useAccessibility();
  const pct = percent == null || Number.isNaN(percent) ? null : Math.max(0, Math.min(100, Math.round(percent)));
  const filled = pct == null ? 0 : pct > 75 ? 4 : pct > 50 ? 3 : pct > 25 ? 2 : pct > 5 ? 1 : 0;
  const battLabel =
    pct == null ? 'Poziom baterii nieznany' : `Bateria ${pct} procent, ${filled} z 4 segmentów`;
  const battBorder = prefs.highContrast ? colors.ink : '#333';
  const cellEmpty = prefs.highContrast ? '#333' : '#c8c8c8';

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingVertical: layout.footerPy,
          paddingHorizontal: layout.phone ? 6 : layout.compact ? 8 : 12,
          gap: layout.phone ? 6 : 10,
          backgroundColor: colors.bg,
        },
      ]}
    >
      {layout.hideFooterLogos ? (
        <View style={styles.logos} />
      ) : (
        <View
          style={[
            styles.logos,
            {
              gap: layout.footerGap,
              paddingLeft: layout.phone ? 2 : layout.compact ? 4 : 20,
            },
          ]}
        >
          <Image
            source={logoGest}
            style={{ height: layout.footerLogoH, width: layout.footerGestW, flexShrink: 1 }}
            resizeMode="contain"
            accessibilityLabel="GEST"
          />
          <Image
            source={logoRobolab}
            style={{ height: layout.footerRoboH, width: layout.footerRoboW, flexShrink: 1 }}
            resizeMode="contain"
            accessibilityLabel="RoboLAB"
          />
        </View>
      )}

      {onOpenA11y ? (
        <A11yPressable
          exploreId="footer-a11y"
          onPress={onOpenA11y}
          style={[
            styles.a11yChip,
            {
              backgroundColor: colors.accent,
              borderColor: colors.ink,
              minHeight: prefs.largeTouchTargets ? 48 : 36,
              minWidth: prefs.largeTouchTargets ? 52 : 40,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Ustawienia dostępności"
          hitSlop={8}
        >
          <Text
            style={[
              styles.a11yChipText,
              {
                color: prefs.highContrast ? '#000' : '#fff',
                fontSize: a11yFont(12, textScale),
              },
            ]}
          >
            Aa
          </Text>
        </A11yPressable>
      ) : null}

      <View
        style={[styles.batt, layout.phone && { gap: 6 }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={battLabel}
      >
        <Text
          style={[
            styles.pct,
            { color: colors.ink, fontSize: a11yFont(layout.phone ? 15 : 18, textScale) },
          ]}
        >
          {pct == null ? '—' : `${pct}%`}
        </Text>
        <View
          style={[
            styles.battBody,
            { borderColor: battBorder },
            layout.phone && { paddingVertical: 3, paddingHorizontal: 3 },
          ]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View
            style={[
              styles.battTip,
              { backgroundColor: battBorder, borderColor: battBorder },
              layout.phone && { height: 10, right: -5 },
            ]}
          />
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.cell,
                { backgroundColor: cellEmpty },
                layout.phone && { width: 5, height: 12 },
                i < filled && { backgroundColor: colors.battery },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logos: {
    flex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  a11yChip: {
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  a11yChipText: {
    fontWeight: '800',
  },
  batt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  pct: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  battBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 4,
    position: 'relative',
  },
  battTip: {
    position: 'absolute',
    right: -6,
    width: 4,
    height: 10,
    backgroundColor: '#333',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  cell: {
    width: 5,
    height: 12,
    backgroundColor: '#c8c8c8',
    borderRadius: 1,
  },
});
