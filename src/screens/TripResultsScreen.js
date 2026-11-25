import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Banner from '../components/Banner';
import { useTheme } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import * as db from '../data/storage';
import useTripSync from '../hooks/useTripSync';
import { shareLabelText } from '../i18n/translations';
import { computeStats } from '../logic/stats';
import { buildPdfHtml } from '../logic/pdfHtml';
import { roomsEnabled } from '../config';

function buildSummaryText(data, tripName, t, c) {
  if (!data) return '';
  let text = `${t('results.summaryHeader', tripName)}\n`;
  text += '==============================\n\n';
  text += `${t('results.summaryTotal', data.totalExpense.toFixed(2), c)}\n`;
  text += `${t('results.summaryPerUnit', data.averagePerShareUnit.toFixed(2), c)}\n`;
  text += `${t('results.summaryParticipants', data.participants.length)}\n\n`;

  text += `${t('results.summaryParticipantsHeader')}\n`;
  data.participants.forEach((p) => {
    text += `${t('results.summaryPaid', p.name, shareLabelText(p.shareRatio, t), p.totalExpense.toFixed(2), c)}\n`;
  });

  text += `\n${t('results.summaryDebtsHeader')}\n`;
  if (data.settlements.length === 0) {
    text += `${t('results.summaryNoDebts')}\n`;
  } else {
    data.settlements.forEach((s) => {
      text += `${t('results.summaryDebtLine', s.from, s.to, s.amount.toFixed(2), c)}\n`;
    });
  }

  text += `\n==============================\n`;
  text += `${t('results.summaryFooter')}\n`;

  return text;
}

export default function TripResultsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, isRTL, cur } = useLanguage();
  const [trip, setTrip] = useState(null);
  const [data, setData] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const tripName = trip ? trip.name : route.params.tripName;
  const currencyText = cur(trip ? trip.currency : 'SAR');
  const role = trip && trip.room ? trip.room.role : null;

  const load = useCallback(async () => {
    const [tr, d] = await Promise.all([db.getTrip(tripId), db.getSettlements(tripId)]);
    setTrip(tr);
    setData(d);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const { refreshing, onRefresh, offline } = useTripSync(tripId, tripName, load);

  const summaryText = buildSummaryText(data, tripName, t, currencyText);

  const handlePdf = async () => {
    setPdfBusy(true);
    try {
      const expenses = await db.getExpenses(tripId);
      const participants = await db.getParticipants(tripId);
      const stats = computeStats(participants, expenses);
      const html = buildPdfHtml({
        tripName,
        currencyText,
        isRTL,
        createdAt: new Date().toISOString(),
        data,
        expenses,
        byCategory: stats.byCategory,
        t,
        shareLabel: (r) => shareLabelText(r, t),
        categoryLabel: (k) => t(`costs.quick.${k}`),
      });
      const { uri } = await Print.printToFileAsync({ html });
      const safe = tripName.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40) || 'trip';
      const target = `${FileSystem.cacheDirectory}Qatta-${safe}.pdf`;
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.moveAsync({ from: uri, to: target });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('', t('results.pdfError'));
      }
    } catch (e) {
      Alert.alert('', t('results.pdfError'));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleNativeShare = async () => {
    try {
      await Share.share({ message: summaryText });
    } catch (e) {
      // user cancelled or share failed silently
    }
  };

  const openLink = async (url) => {
    const ok = await Linking.canOpenURL(url);
    if (ok) {
      Linking.openURL(url);
    } else {
      Alert.alert(t('results.cantOpenTitle'), t('results.cantOpenMessage'));
    }
  };

  // WhatsApp: use the whatsapp:// scheme (no phone number) so the app opens
  // straight to its own chat/contact picker with the text pre-filled, instead
  // of just opening WhatsApp's home screen via the https://wa.me/ fallback
  // link. Opened directly (not through the canOpenURL-gated helper above)
  // because canOpenURL can under-report custom schemes on Android 11+ unless
  // the app declares a manifest <queries> entry — openURL itself still works
  // fine and simply rejects if WhatsApp really isn't installed.
  const shareWhatsApp = async () => {
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(summaryText)}`);
    } catch (e) {
      Alert.alert(t('results.cantOpenTitle'), t('results.cantOpenMessage'));
    }
  };
  const shareTelegram = () =>
    openLink(`https://t.me/share/url?url=&text=${encodeURIComponent(summaryText)}`);
  const shareEmail = () =>
    openLink(
      `mailto:?subject=${encodeURIComponent(t('results.emailSubject'))}&body=${encodeURIComponent(
        summaryText
      )}`
    );
  const copySummary = async () => {
    await Clipboard.setStringAsync(summaryText);
    Alert.alert(t('results.copiedTitle'), t('results.copiedMessage'));
  };

  const hasData = data && data.participants.length > 0;
  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };
  const accentSide = isRTL ? { borderRightWidth: 4, borderRightColor: colors.primary } : { borderLeftWidth: 4, borderLeftColor: colors.primary };

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('results.headerTitle')} subtitle={tripName} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={role ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {offline ? <Banner type="warning" message={t('share.offlineNote')} /> : null}
        {!hasData ? (
          <Card>
            <EmptyState icon="📭" text={t('results.empty')} />
          </Card>
        ) : (
          <>
            <View style={[styles.statsRow, rowDir]}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t('results.statTotal')}</Text>
                <Text style={styles.statValue}>{data.totalExpense.toFixed(0)}</Text>
                <Text style={styles.statUnit}>{currencyText}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t('results.statPerUnit')}</Text>
                <Text style={styles.statValue}>{data.averagePerShareUnit.toFixed(0)}</Text>
                <Text style={styles.statUnit}>{currencyText}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t('results.statParticipants')}</Text>
                <Text style={styles.statValue}>{data.participants.length}</Text>
                <Text style={styles.statUnit}>{data.participants.length === 1 ? t('common.person') : t('common.people')}</Text>
              </View>
            </View>

            <Card title={t('results.detailsTitle')} icon="👥">
              {data.participants.map((p) => (
                <View key={p.id} style={[styles.personRow, rowDir]}>
                  <View style={styles.personInfo}>
                    <Text style={[styles.personName, textAlign]}>{p.name}</Text>
                    <Text style={[styles.personMeta, textAlign]}>
                      {t('results.paidLine', shareLabelText(p.shareRatio, t), p.totalExpense.toFixed(2), currencyText, p.shouldPay.toFixed(2))}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.personBalance,
                      { color: p.balance >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {p.balance >= 0 ? '+' : ''}
                    {p.balance.toFixed(2)}
                  </Text>
                </View>
              ))}
            </Card>

            <Card title={t('results.whoPaysTitle')} icon="🔄">
              {data.settlements.length === 0 ? (
                <EmptyState icon="🎉" text={t('results.settled')} />
              ) : (
                data.settlements.map((s, idx) => (
                  <View key={idx} style={[styles.settlementItem, rowDir, accentSide]}>
                    <View style={styles.settlementSide}>
                      <Text style={[styles.settlementName, { color: colors.danger }]}>{s.from}</Text>
                      <Text style={styles.settlementLabel}>{t('results.pays')}</Text>
                    </View>
                    <View style={styles.settlementAmountWrap}>
                      <Text style={styles.settlementAmount}>
                        {s.preferred ? '★ ' : ''}
                        {s.amount.toFixed(2)} {currencyText}
                      </Text>
                    </View>
                    <View style={styles.settlementSide}>
                      <Text style={[styles.settlementName, { color: colors.success }]}>{s.to}</Text>
                      <Text style={styles.settlementLabel}>{t('results.receives')}</Text>
                    </View>
                  </View>
                ))
              )}
              {data.settlements.some((s) => s.preferred) ? (
                <Text style={[styles.preferredNote, { textAlign: isRTL ? 'right' : 'left' }]}>{t('results.preferredNote')}</Text>
              ) : null}
            </Card>

            <Card title={t('results.shareTitle')} icon="📤">
              <Button title={t('results.shareButton')} icon="📱" onPress={handleNativeShare} style={{ marginBottom: 10 }} />
              <Button
                title={pdfBusy ? t('results.pdfBusy') : t('results.pdf')}
                icon="📄"
                variant="outline"
                onPress={handlePdf}
                loading={pdfBusy}
                style={{ marginBottom: 10 }}
              />
              <View style={[styles.shareGrid, rowDir]}>
                <TouchableOpacity
                  style={[styles.shareChip, { backgroundColor: colors.whatsapp }]}
                  onPress={shareWhatsApp}
                >
                  <Text style={styles.shareChipText}>{t('results.whatsapp')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareChip, { backgroundColor: colors.telegram }]}
                  onPress={shareTelegram}
                >
                  <Text style={styles.shareChipText}>{t('results.telegram')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareChip, { backgroundColor: colors.danger }]}
                  onPress={shareEmail}
                >
                  <Text style={styles.shareChipText}>{t('results.email')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareChip, { backgroundColor: '#9b59b6' }]}
                  onPress={copySummary}
                >
                  <Text style={styles.shareChipText}>{t('results.copy')}</Text>
                </TouchableOpacity>
              </View>
            </Card>

            <Button
              title={t('results.statsButton')}
              variant="outline"
              onPress={() => navigation.navigate('TripStats', { tripId, tripName })}
              style={{ marginBottom: 10 }}
            />
            {roomsEnabled ? (
              <Button
                title={t('share.button')}
                variant="outline"
                onPress={() => navigation.navigate('TripShare', { tripId, tripName })}
                style={{ marginBottom: 10 }}
              />
            ) : null}
            <Button
              title={t('results.editCostsButton')}
              variant="outline"
              onPress={() => navigation.navigate('TripCosts', { tripId, tripName })}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  statsRow: { gap: 10, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, marginBottom: 6 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  statUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  personRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  personInfo: { flex: 1 },
  personName: { fontWeight: '700', color: colors.text },
  personMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  personBalance: { fontWeight: '800', fontSize: 15, marginLeft: 10 },
  settlementItem: {
    backgroundColor: colors.purpleTint,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settlementSide: { flex: 1, alignItems: 'center' },
  settlementName: { fontWeight: '800', fontSize: 14.5 },
  settlementLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  settlementAmountWrap: {
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 8,
  },
  settlementAmount: { fontWeight: '800', color: colors.primary },
  preferredNote: { marginTop: 6, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
  shareGrid: { flexWrap: 'wrap', gap: 8 },
  shareChip: {
    flexGrow: 1,
    minWidth: '22%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
