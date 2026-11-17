import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, gradient, gradientDark } from '../theme/colors';
import { DEFAULT_CURRENCY } from '../logic/currencies';

const SETTINGS_KEY = '@qatta/settings';
const DEFAULTS = { theme: 'system', defaultCurrency: DEFAULT_CURRENCY };

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false); // settings screen (modal) open?

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch (e) {
        // fall back to defaults
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;
  const headerGradient = isDark ? gradientDark : gradient;

  const value = useMemo(
    () => ({
      settings,
      ready,
      isDark,
      colors,
      headerGradient,
      setTheme: (theme) => update({ theme }),
      setDefaultCurrency: (defaultCurrency) => update({ defaultCurrency }),
      settingsVisible: visible,
      openSettings: () => setVisible(true),
      closeSettings: () => setVisible(false),
    }),
    [settings, ready, isDark, colors, headerGradient, update, visible]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

// Convenience: the active palette. Use with useMemo to build styles:
//   const { colors } = useTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
export function useTheme() {
  const { colors, isDark, headerGradient } = useSettings();
  return { colors, isDark, headerGradient };
}
