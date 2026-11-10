/**
 * Wspólne wymiary / style przycisków — żeby ekrany nie „pływały” osobno.
 */
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import type { AppColors } from './theme';
import { radii } from './theme';

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const control = {
  height: 48,
  heightSm: 40,
  radius: radii.sm,
  radiusLg: radii.md,
  padX: 14,
  gap: 8,
} as const;

export function makeUi(colors: AppColors, hc: boolean) {
  const onDark = hc ? '#000000' : '#ffffff';
  return StyleSheet.create({
    screenPad: {
      padding: space.lg,
      gap: space.md,
    } satisfies ViewStyle,
    sectionTitle: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    } satisfies TextStyle,
    sectionHint: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: -4,
    } satisfies TextStyle,
    btnPrimary: {
      minHeight: control.height,
      borderRadius: control.radiusLg,
      backgroundColor: colors.tabBar,
      paddingHorizontal: control.padX,
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies ViewStyle,
    btnPrimaryText: {
      color: onDark,
      fontWeight: '700',
      fontSize: 15,
    } satisfies TextStyle,
    btnDanger: {
      minHeight: control.height,
      borderRadius: control.radiusLg,
      backgroundColor: colors.danger,
      paddingHorizontal: control.padX,
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies ViewStyle,
    btnGhost: {
      minHeight: control.heightSm,
      borderRadius: control.radius,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.button,
      paddingHorizontal: control.padX,
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies ViewStyle,
    btnGhostText: {
      color: colors.ink,
      fontWeight: '700',
      fontSize: 13,
    } satisfies TextStyle,
    btnRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: control.gap,
    } satisfies ViewStyle,
    chip: {
      flex: 1,
      minHeight: control.heightSm,
      borderRadius: control.radius,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    } satisfies ViewStyle,
    chipOn: {
      borderColor: colors.accent,
      backgroundColor: colors.buttonOn,
    } satisfies ViewStyle,
    chipText: {
      color: colors.ink,
      fontWeight: '700',
      fontSize: 12,
    } satisfies TextStyle,
    panel: {
      backgroundColor: colors.bgRaised,
      borderRadius: control.radiusLg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      padding: space.md,
      gap: space.sm,
    } satisfies ViewStyle,
  });
}
