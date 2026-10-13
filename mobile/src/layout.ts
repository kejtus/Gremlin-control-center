import { Platform, StatusBar, useWindowDimensions } from 'react-native';
import { useAccessibility } from './accessibility';

/**
 * Skala UI pod telefon / tablet.
 * Góra: zapas pod status bar. Dół: wyraźna stopka z logami. Drążki — kompaktowe.
 */
export function useLayout() {
  const { touchScale, prefs } = useAccessibility();
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height);
  const phone = shortest < 520;
  const short = height < 720;
  const compact = phone || short;

  // Wyraźnie poniżej status bara / notcha.
  const statusH =
    Platform.OS === 'android'
      ? Math.max(StatusBar.currentHeight ?? 0, 28)
      : 48;
  const padTop =
    statusH + (phone ? 18 : compact ? 14 : 10) + (prefs.largeTouchTargets || prefs.tabLabels ? 10 : 0);

  const cardMx = phone ? 4 : compact ? 6 : 10;
  const cardBorder = phone ? 2 : compact ? 3 : 4;
  const contentW = Math.max(280, width - cardMx * 2 - cardBorder * 2);

  const stopSlot = phone ? 44 : 0;
  const joyGap = phone ? 4 : 14;
  const stickBudget = contentW - stopSlot - joyGap * 2 - 8;
  // Telefon: większe pady = dłuższy skok palca → mniej czułe sterowanie.
  const stick = phone
    ? Math.max(118, Math.min(148, Math.floor(stickBudget / 2)))
    : compact
      ? Math.max(112, Math.min(136, Math.floor(contentW / 2.4)))
      : Math.max(128, Math.min(160, Math.round(width * 0.28)));
  const stickScaled = Math.round(stick * (prefs.largeTouchTargets ? 1.22 : 1));
  // Etykiety / duże cele: wyższy pasek + zapas u góry (ikony nie mogą się przycinać)
  const tabBoost =
    (prefs.tabLabels ? 1.1 : 1) * (prefs.largeTouchTargets ? Math.min(touchScale, 1.3) : 1);

  return {
    width,
    height,
    phone,
    short,
    compact,
    padTop,
    headerPadX: phone ? 10 : compact ? 12 : 18,
    headerPadY: phone ? 6 : 8,
    brandSize: phone ? 18 : compact ? 22 : 28,
    showPreviewTag: !phone,
    tabH: Math.round((phone ? 62 : compact ? 70 : 88) * tabBoost) + (prefs.largeTouchTargets ? 10 : 0),
    tabW: 0,
    tabIdleH: Math.round((phone ? 54 : compact ? 58 : 66) * tabBoost),
    tabOnH: Math.round((phone ? 60 : compact ? 66 : 78) * tabBoost),
    tabOverlap: 0,
    tabPadTop: prefs.largeTouchTargets
      ? phone
        ? 16
        : 18
      : prefs.tabLabels
        ? phone
          ? 10
          : 12
        : phone
          ? 6
          : compact
            ? 8
            : 10,
    showTabLabels: prefs.tabLabels,
    tabLabelSize: phone ? 8 : 9,
    tabShortLabels: true,
    cardMx,
    cardMt: 0, // zakładki łączą się z kartą
    cardMb: phone ? 4 : compact ? 6 : 6,
    cardBorder,
    cardRadius: phone ? 14 : compact ? 18 : 28,
    footerPy: phone ? 8 : compact ? 10 : 10,
    footerLogoH: phone ? 36 : compact ? 44 : 56,
    footerRoboH: phone ? 24 : compact ? 28 : 30,
    footerRoboW: phone ? 140 : compact ? 160 : 180,
    footerGestW: phone ? 72 : compact ? 90 : 108,
    footerGap: phone ? 14 : compact ? 24 : 45,
    hideFooterLogos: false,
    camFlex: phone ? 10 : compact ? 11 : 11,
    joyFlex: phone ? 10 : compact ? 9 : 9,
    stick: stickScaled,
    joyLabelSize: phone ? 10 : 11,
    showJoyLabels: true,
    stopBetween: phone,
  };
}
