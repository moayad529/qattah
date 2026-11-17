import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY = '@tripkitty/onboardingSeen';

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (!seen) setVisible(true);
      } catch (e) {
        // if storage fails, just don't force the tour open
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const showOnboarding = useCallback(() => setVisible(true), []);

  const closeOnboarding = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY, 'true').catch(() => {});
  }, []);

  const value = { visible, ready, showOnboarding, closeOnboarding };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  return ctx;
}
