import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import { toWesternNumberText } from '../logic/numbers';

const NUMERIC_KEYBOARDS = ['numeric', 'decimal-pad', 'number-pad'];

export default function Input({ label, style, containerStyle, onChangeText, ...props }) {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.group, containerStyle]}>
      {label ? <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text> : null}
      <TextInput
        style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }, style]}
        placeholderTextColor={colors.placeholder}
        writingDirection={isRTL ? 'rtl' : 'ltr'}
        // numeric fields accept Arabic digits too and turn them into English digits as you type
        onChangeText={
          onChangeText && NUMERIC_KEYBOARDS.includes(props.keyboardType)
            ? (txt) => onChangeText(toWesternNumberText(txt))
            : onChangeText
        }
        {...props}
      />
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    group: { marginBottom: 16 },
    label: { marginBottom: 8, color: colors.text, fontWeight: '600', fontSize: 14 },
    input: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.inputBg,
    },
  });
