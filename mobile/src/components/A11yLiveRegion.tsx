import { View } from 'react-native';

/** Native: ogłoszenia idą przez AccessibilityInfo. */
export function A11yLiveRegion() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}
