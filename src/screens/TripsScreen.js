import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Banner from '../components/Banner';
import CurrencyPicker from '../components/CurrencyPicker';
import { useTheme, useSettings } from '../context/SettingsContext';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import * as db from '../data/storage';
import { currencyName } from '../logic/currencies';
import { extractCode } from '../logic/codes';
import { roomsEnabled } from '../config';

export default function TripsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { settings } = useSettings();
  const { trips, createTrip, deleteTrip, refreshTrips } = useApp();
  const { t, isRTL, language, cur } = useLanguage();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinText, setJoinText] = useState('');
  const [joinMsg, setJoinMsg] = useState({ type: '', text: '' });
  const [joinBusy, setJoinBusy] = useState(false);

  // follow the default currency from Settings until the user picks one here
  const [touchedCurrency, setTouchedCurrency] = useState(false);
  useEffect(() => {
    if (!touchedCurrency) setCurrency(settings.defaultCurrency);
  }, [settings.defaultCurrency, touchedCurrency]);

  const roleName = (role) => t(`roles.${role}`);

  const handleCreate = async () => {
    setError('');
    if (!name.trim()) {
      setError(t('errors.trip_name_required'));
      return;
    }
    setBusy(true);
    try {
      const trip = await createTrip(name.trim(), currency);
      setName('');
      navigation.navigate('TripParticipants', { tripId: trip.id, tripName: trip.name });
    } catch (e) {
      setError(t(`errors.${e.message}`) || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const joinWith = async (text) => {
    setJoinMsg({ type: '', text: '' });
    const code = extractCode(text);
    if (!code) {
      setJoinMsg({ type: 'error', text: t('trips.joinInvalid') });
      return;
    }
    setJoinBusy(true);
    try {
      const trip = await db.joinTrip(code);
      await refreshTrips();
      setJoinText('');
      setJoinMsg({ type: 'success', text: t('trips.joinedAs', trip.name, roleName(trip.room.role)) });
      navigation.navigate('TripParticipants', { tripId: trip.id, tripName: trip.name });
    } catch (e) {
      setJoinMsg({ type: 'error', text: t(`errors.${e.message}`) || t('common.error') });
    } finally {
      setJoinBusy(false);
    }
  };

  // opened from an invitation link (qatta://join/CODE)
  useEffect(() => {
    const code = route?.params?.joinCode;
    if (code && roomsEnabled) {
      setJoinText(code);
      joinWith(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.joinNonce]);

  const handleOpen = (trip) => {
    navigation.navigate('TripParticipants', { tripId: trip.id, tripName: trip.name });
  };

  const showError = (e) => Alert.alert('', t(`errors.${e.message}`) || t('common.error'));

  const handleDelete = (trip) => {
    const localDelete = () => deleteTrip(trip.id);
    if (trip.room && trip.room.role === 'owner') {
      Alert.alert(t('trips.deleteTitle'), t('trips.deleteSharedOwnerConfirm', trip.name), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('trips.deleteHere'), onPress: localDelete },
        {
          text: t('trips.deleteEverywhere'),
          style: 'destructive',
          onPress: async () => {
            try {
              await db.stopSharing(trip.id);
              await localDelete();
            } catch (e) {
              showError(e);
            }
          },
        },
      ]);
      return;
    }
    const message = trip.room ? t('trips.deleteSharedMemberConfirm', trip.name) : t('trips.deleteConfirm', trip.name);
    Alert.alert(t('trips.deleteTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: localDelete },
    ]);
  };

  const row = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('trips.headerTitle')} subtitle={t('trips.headerSubtitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card title={t('trips.manageTitle')} icon="📄">
          <Banner type="error" message={error} />
          <Input placeholder={t('trips.namePlaceholder')} value={name} onChangeText={setName} />

          <Text style={[styles.label, textAlign]}>{t('trips.currencyLabel')}</Text>
          <TouchableOpacity style={[styles.currencyBox, row]} onPress={() => setCurrencyOpen((v) => !v)} activeOpacity={0.8}>
            <Text style={styles.currencyText}>💱 {currencyName(currency, language)} ({cur(currency)})</Text>
            <Text style={styles.currencyText}>{currencyOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {currencyOpen ? (
            <View style={{ marginBottom: 14 }}>
              <CurrencyPicker
                value={currency}
                onChange={(c) => {
                  setTouchedCurrency(true);
                  setCurrency(c);
                }}
              />
            </View>
          ) : null}

          <Button title={t('trips.addButton')} onPress={handleCreate} loading={busy} />
        </Card>

        {roomsEnabled ? (
          <Card title={t('trips.joinTitle')} icon="🔗">
            <Text style={[styles.hint, textAlign]}>{t('trips.joinHint')}</Text>
            <Banner type={joinMsg.type} message={joinMsg.text} />
            <Input
              placeholder={t('trips.joinPlaceholder')}
              value={joinText}
              onChangeText={setJoinText}
              autoCapitalize="characters"
              autoCorrect={false}
              multiline
              style={{ minHeight: 48 }}
            />
            <Button title={t('trips.joinButton')} variant="outline" onPress={() => joinWith(joinText)} loading={joinBusy} />
          </Card>
        ) : null}

        <Card title={t('trips.listTitle')} icon="🧳">
          {trips.length === 0 ? (
            <EmptyState icon="🧳" text={t('trips.empty')} />
          ) : (
            trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                onPress={() => handleOpen(trip)}
                activeOpacity={0.8}
                style={[styles.tripItem, row]}
              >
                <View style={styles.tripInfo}>
                  <Text style={[styles.tripName, textAlign]}>{trip.name}</Text>
                  <Text style={[styles.tripStats, textAlign]}>
                    {t('trips.participantsCount', trip.participantCount)} ·{' '}
                    {t('trips.totalExpense', trip.totalExpense.toFixed(2), cur(trip.currency))}
                    {trip.room ? `  ·  ${t('trips.sharedBadge', roleName(trip.room.role))}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(trip)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    content: { padding: 16, paddingBottom: 40 },
    label: { marginBottom: 8, color: colors.text, fontWeight: '600', fontSize: 14 },
    hint: { color: colors.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 19 },
    currencyBox: {
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 14,
      backgroundColor: colors.inputBg,
    },
    currencyText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    tripItem: {
      alignItems: 'center',
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
      gap: 10,
    },
    tripInfo: { flex: 1 },
    tripName: { fontWeight: '700', fontSize: 15, color: colors.text },
    tripStats: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
    deleteBtn: { backgroundColor: colors.danger, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  });
