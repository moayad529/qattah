import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/SettingsContext';

export default function Button({
  title,
  onPress,
  variant = 'primary',
  small = false,
  loading = false,
  disabled = false,
  style,
  icon,
}) {
  const { colors } = useTheme();
  const variants = {
    primary: { bg: colors.primary, text: '#fff' },
    secondary: { bg: colors.secondary, text: '#fff' },
    danger: { bg: colors.danger, text: '#fff' },
    outline: { bg: 'transparent', text: colors.primary, border: colors.primary },
  };
  const v = variants[variant] || variants.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 2, borderColor: v.border } : null,
        small ? styles.small : null,
        disabled || loading ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <Text style={[styles.text, { color: v.text }, small ? styles.smallText : null]}>
          {icon ? `${icon} ` : ''}
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  small: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  text: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  smallText: { fontSize: 13 },
  disabled: { opacity: 0.5 },
});
