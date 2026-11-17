import React, { useRef, useState, useMemo } from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import { useOnboarding } from '../context/OnboardingContext';

const { width: SCREEN_W } = Dimensions.get('window');

export default function OnboardingModal() {
  const { colors, headerGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { visible, closeOnboarding } = useOnboarding();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const slides = t('onboarding.slides');
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  if (!visible) return null;

  const isLast = index === slides.length - 1;

  const goToIndex = (i) => {
    scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
    setIndex(i);
  };

  const handleNext = () => {
    if (isLast) {
      closeOnboarding();
      setIndex(0);
      return;
    }
    goToIndex(index + 1);
  };

  const handleSkip = () => {
    closeOnboarding();
    setIndex(0);
  };

  const handleMomentumEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setIndex(i);
  };

  // react-native-safe-area-context can under-report (or report 0) for content
  // rendered inside a native <Modal>, which pushed the Skip button right up
  // against the status bar/notch on some devices. Enforce a generous minimum
  // regardless of what the insets hook reports, instead of trusting it alone.
  const topOffset = Math.max(insets.top, 44) + 12;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleSkip} statusBarTranslucent>
      <LinearGradient colors={headerGradient} style={styles.flex} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <View style={[styles.topRow, { paddingTop: topOffset }]}>
            <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleMomentumEnd}
            // Slides are always laid out left-to-right by index, regardless of
            // language, so paging math above stays simple and correct.
            style={styles.flex}
          >
            {slides.map((slide, i) => (
              <View key={i} style={[styles.slide, { width: SCREEN_W }]}>
                <Text style={styles.icon}>{slide.icon}</Text>
                <Text style={[styles.title, { textAlign: 'center' }]}>{slide.title}</Text>
                <Text style={[styles.text, { textAlign: 'center' }]}>{slide.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dotsRow}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <View style={[styles.bottomRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {index > 0 ? (
              <TouchableOpacity onPress={() => goToIndex(index - 1)} style={styles.backBtn}>
                <Text style={styles.backText}>{t('onboarding.back')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backBtn} />
            )}
            <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
              <Text style={styles.nextText}>{isLast ? t('onboarding.done') : t('onboarding.next')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  skipText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  icon: {
    fontSize: 84,
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 14,
  },
  text: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 22,
  },
  bottomRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backBtn: {
    minWidth: 70,
    paddingVertical: 12,
  },
  backText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 26,
  },
  nextText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
});
