import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../i18n/translations';
import { currencyLabel } from '../logic/currencies';

const LANGUAGE_KEY = '@tripkitty/language';

const LanguageContext = createContext(null);

function resolve(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (saved === 'ar' || saved === 'en') setLanguageState(saved);
      } catch (e) {
        // ignore, default to ar
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (lang) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    } catch (e) {
      // ignore persistence failure — language still applies for this session
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  }, [language, setLanguage]);

  // t('costs.addButton') -> string
  // t('trips.deleteConfirm', name) -> calls the function value with the given args
  const t = useCallback(
    (key, ...args) => {
      const value = resolve(translations[language], key);
      if (typeof value === 'function') return value(...args);
      if (value === undefined) return key;
      return value;
    },
    [language]
  );

  const isRTL = language === 'ar';

  // cur('SAR') -> 'ريال' (Arabic) / 'SAR' (English); custom symbols pass through
  const cur = useCallback((code) => currencyLabel(code, language), [language]);

  const value = { language, isRTL, ready, setLanguage, toggleLanguage, t, cur };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}
