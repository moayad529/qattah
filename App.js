import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { LanguageProvider, useLanguage } from './src/context/LanguageContext';
import { OnboardingProvider } from './src/context/OnboardingContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import OnboardingModal from './src/components/OnboardingModal';
import SettingsModal from './src/components/SettingsModal';
import RootNavigator from './src/navigation/RootNavigator';
import './src/data/receipts'; // registers receipt-photo cleanup when expenses are removed

function Gate() {
  const { ready: appReady } = useApp();
  const { ready: langReady } = useLanguage();
  const { ready: settingsReady, colors } = useSettings();
  if (!appReady || !langReady || !settingsReady) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.screenBg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <>
      <RootNavigator />
      <SettingsModal />
      <OnboardingModal />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <LanguageProvider>
            <AppProvider>
              <OnboardingProvider>
                <StatusBar style="light" />
                <Gate />
              </OnboardingProvider>
            </AppProvider>
          </LanguageProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
