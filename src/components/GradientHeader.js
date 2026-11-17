import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useSettings } from '../context/SettingsContext';

export default function GradientHeader({ title, subtitle }) {
  const { language, toggleLanguage } = useLanguage();
  const { showOnboarding } = useOnboarding();
  const { openSettings, headerGradient } = useSettings();
  const hit = { top: 8, bottom: 8, left: 8, right: 8 };

  return (
    <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <SafeAreaView edges={['top']}>
        {/* Fixed physical positions regardless of language: help + settings on the left,
            language toggle on the right — matching the app's fixed tab order. */}
        <View style={styles.topRow}>
          <View style={styles.leftGroup}>
            <TouchableOpacity onPress={showOnboarding} style={styles.roundButton} hitSlop={hit}>
              <Text style={styles.helpButtonText}>؟</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openSettings} style={styles.roundButton} hitSlop={hit}>
              <Text style={styles.gearText}>⚙︎</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={toggleLanguage} style={styles.langButton} hitSlop={hit}>
            <Text style={styles.langButtonText}>{language === 'ar' ? 'EN' : 'AR'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  leftGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  roundButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  gearText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: -1 },
  langButton: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  langButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginTop: 4, marginBottom: 16 },
});
