import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useTheme } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';

export default function Card({ title, icon, children, style }) {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>
          {icon ? `${icon} ` : ''}
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 18,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
    },
  });
