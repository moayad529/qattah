import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/SettingsContext';

export default function EmptyState({ icon = '📭', text }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: { paddingVertical: 30, alignItems: 'center' },
    icon: { fontSize: 40, marginBottom: 10 },
    text: { color: colors.textLight, fontSize: 15, textAlign: 'center' },
  });
