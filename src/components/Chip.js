import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/SettingsContext';

// Selectable pill used for categories, payers, currencies, roles ...
// tone: 'primary' (orange) | 'success' (green, used for "split among" people)
export default function Chip({ label, selected, onPress, tone = 'primary', disabled }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toneColor = tone === 'success' ? colors.success : colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.chip,
        tone === 'success' && { borderColor: colors.success, backgroundColor: colors.successBg },
        selected && { backgroundColor: toneColor, borderColor: toneColor },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.text,
          tone === 'success' && { color: colors.success },
          selected && { color: '#fff' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    chip: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
      backgroundColor: colors.cardBg,
    },
    text: { color: colors.text, fontWeight: '600', fontSize: 13 },
  });
