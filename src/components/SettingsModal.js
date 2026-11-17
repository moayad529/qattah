import React, { useMemo } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from './Card';
import Chip from './Chip';
import Button from './Button';
import CurrencyPicker from './CurrencyPicker';
import { useSettings } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import { useOnboarding } from '../context/OnboardingContext';
import { PRIVACY_URL, WEBSITE_URL } from '../config';

export default function SettingsModal() {
  const { settingsVisible, closeSettings, settings, setTheme, setDefaultCurrency, colors } = useSettings();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { showOnboarding } = useOnboarding();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };
  const version = Constants.expoConfig?.version || '';

  const open = (url) => Linking.openURL(url).catch(() => {});

  return (
    <Modal visible={settingsVisible} animationType="slide" onRequestClose={closeSettings} presentationStyle="pageSheet">
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={[styles.header, rowDir]}>
          <Text style={styles.title}>⚙︎ {t('settings.title')}</Text>
          <TouchableOpacity onPress={closeSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.close}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Card title={t('settings.languageTitle')} icon="🌐">
            <View style={[styles.row, rowDir]}>
              <Chip label="العربية" selected={language === 'ar'} onPress={() => setLanguage('ar')} />
              <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
            </View>
          </Card>

          <Card title={t('settings.appearanceTitle')} icon="🌓">
            <View style={[styles.row, rowDir]}>
              <Chip label={t('settings.appearanceSystem')} selected={settings.theme === 'system'} onPress={() => setTheme('system')} />
              <Chip label={`☀️ ${t('settings.appearanceLight')}`} selected={settings.theme === 'light'} onPress={() => setTheme('light')} />
              <Chip label={`🌙 ${t('settings.appearanceDark')}`} selected={settings.theme === 'dark'} onPress={() => setTheme('dark')} />
            </View>
          </Card>

          <Card title={t('settings.currencyTitle')} icon="💱">
            <Text style={[styles.hint, textAlign]}>{t('settings.currencyHint')}</Text>
            <CurrencyPicker value={settings.defaultCurrency} onChange={setDefaultCurrency} />
          </Card>

          <Card title={t('settings.aboutTitle')} icon="ℹ️">
            <Text style={[styles.hint, textAlign]}>{t('settings.privacyNote')}</Text>
            <Button
              title={t('settings.replayTour')}
              variant="outline"
              onPress={() => {
                closeSettings();
                setTimeout(showOnboarding, 350);
              }}
              style={styles.gap}
            />
            {PRIVACY_URL ? (
              <Button title={t('settings.privacy')} variant="outline" onPress={() => open(PRIVACY_URL)} style={styles.gap} />
            ) : null}
            <Button title={t('settings.website')} variant="outline" onPress={() => open(WEBSITE_URL)} style={styles.gap} />
            {version ? <Text style={styles.version}>{t('settings.version', version)}</Text> : null}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    header: { justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
    title: { fontSize: 20, fontWeight: '800', color: colors.text },
    close: { color: colors.primary, fontWeight: '700', fontSize: 16 },
    content: { padding: 16, paddingBottom: 40 },
    row: { flexWrap: 'wrap', gap: 8 },
    hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 12 },
    gap: { marginTop: 8 },
    version: { color: colors.textLight, textAlign: 'center', marginTop: 14, fontSize: 12 },
  });
