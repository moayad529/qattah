import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';

// type: 'error' | 'success' | 'warning'
export default function Banner({ type, message }) {
  const { colors, isDark } = useTheme();
  const { isRTL } = useLanguage();
  if (!message) return null;
  const palette =
    type === 'error'
      ? { backgroundColor: colors.errorBg, color: colors.errorText, borderColor: isDark ? '#7a3036' : '#f5c6cb' }
      : type === 'warning'
      ? { backgroundColor: colors.warningBg, color: colors.warningText, borderColor: isDark ? '#6b5a1f' : '#ffe08a' }
      : { backgroundColor: colors.successBg, color: colors.successText, borderColor: isDark ? '#2f5a3b' : '#c3e6cb' };
  return <Text style={[styles.base, { textAlign: isRTL ? 'right' : 'left' }, palette]}>{message}</Text>;
}

const styles = StyleSheet.create({
  base: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 14, fontSize: 14, overflow: 'hidden' },
});
