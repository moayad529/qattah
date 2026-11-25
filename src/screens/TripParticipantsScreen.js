import React, { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import Banner from '../components/Banner';
import { useTheme } from '../context/SettingsContext';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import * as db from '../data/storage';
import { can } from '../data/rooms';
import useTripSync from '../hooks/useTripSync';
import { shareLabelText } from '../i18n/translations';
import { roomsEnabled } from '../config';
import { payeeIds } from '../logic/settlement';

export default function TripParticipantsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { groups, refreshTrips } = useApp();
  const { t, isRTL, cur } = useLanguage();

  const [trip, setTrip] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState(1);
  const [customPercent, setCustomPercent] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const tripName = trip ? trip.name : route.params.tripName;
  const role = trip && trip.room ? trip.room.role : null; // null = local trip
  const canManage = can(role, 'editor');
  const canSetPay = role === null || role === 'owner'; // local trips are always yours

  const load = useCallback(async () => {
    const [tr, ps] = await Promise.all([db.getTrip(tripId), db.getParticipants(tripId)]);
    setTrip(tr);
    setParticipants(ps);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const { refreshing, onRefresh, offline } = useTripSync(tripId, tripName, load);

  const run = async (fn) => {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      await fn();
    } catch (e) {
      setMessage({ type: 'error', text: t(`errors.${e.message}`) || t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  const resolveRatio = () => {
    if (!useCustom) return ratio;
    const n = parseFloat(customPercent);
    if (isNaN(n) || n < 0 || n > 100) return null;
    return n / 100;
  };

  const handleAdd = () => {
    if (!name.trim()) {
      setMessage({ type: 'error', text: t('errors.name_required') });
      return;
    }
    const finalRatio = resolveRatio();
    if (finalRatio === null) {
      setMessage({ type: 'error', text: t('errors.invalid_share_ratio') });
      return;
    }
    run(async () => {
      await db.addParticipant(tripId, name.trim(), finalRatio);
      setName('');
      setCustomPercent('');
      setUseCustom(false);
      setRatio(1);
      await load();
      await refreshTrips();
    });
  };

  const handleImportGroup = (group) =>
    run(async () => {
      const added = await db.importGroupToTrip(tripId, group.id);
      await load();
      await refreshTrips();
      setMessage({
        type: 'success',
        text: added > 0 ? t('participants.importedCount', added, group.name) : t('participants.alreadyImported', group.name),
      });
    });

  const handleUpdateShare = (id, newRatio) =>
    run(async () => {
      await db.updateParticipantShare(id, newRatio);
      await load();
    });

  const handleDelete = (p) => {
    Alert.alert(t('participants.deleteTitle'), t('participants.deleteConfirm', p.name), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await db.deleteParticipant(p.id);
            await load();
            await refreshTrips();
          }),
      },
    ]);
  };

  const nameOf = (id) => {
    const p = participants.find((x) => x.id === id);
    return p ? p.name : '';
  };

  // tap a name to add / remove him from this member's priority list (order = order of choosing)
  const handlePayToggle = (p, otherId) =>
    run(async () => {
      const list = payeeIds(p.payTo);
      const next = list.includes(otherId) ? list.filter((x) => x !== otherId) : [...list, otherId];
      await db.setPayTo(tripId, { [p.id]: next });
      await load();
    });

  const handlePayAuto = (p) =>
    run(async () => {
      await db.setPayTo(tripId, { [p.id]: [] });
      await load();
    });

  // "everyone pays …": the chosen people are paid first by all the others
  const applyCollectors = (list) =>
    run(async () => {
      const assignments = {};
      participants.forEach((p) => {
        assignments[p.id] = list.filter((x) => x !== p.id);
      });
      await db.setPayTo(tripId, assignments);
      await load();
    });

  // the group everyone else pays, when every member's list is exactly "that group without himself"
  const collectors = (() => {
    if (participants.length < 2) return [];
    const group = [];
    participants.forEach((p) =>
      payeeIds(p.payTo).forEach((id) => {
        if (!group.includes(id)) group.push(id);
      })
    );
    if (group.length === 0) return [];
    const consistent = participants.every((p) => {
      const want = group.filter((x) => x !== p.id);
      const have = payeeIds(p.payTo);
      return have.length === want.length && want.every((x) => have.includes(x));
    });
    return consistent ? group : [];
  })();

  const toggleCollector = (id) =>
    applyCollectors(collectors.includes(id) ? collectors.filter((x) => x !== id) : [...collectors, id]);

  const handleSetMe = async (id) => {
    await db.setMe(tripId, trip && trip.meId === id ? undefined : id);
    await load();
  };

  const handleNext = () => {
    if (participants.length === 0) {
      setMessage({ type: 'error', text: t('participants.nextValidation') });
      return;
    }
    navigation.navigate('TripCosts', { tripId, tripName });
  };

  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };
  const accentSide = isRTL
    ? { borderRightWidth: 4, borderRightColor: colors.primary }
    : { borderLeftWidth: 4, borderLeftColor: colors.primary };
  const currencyText = cur(trip ? trip.currency : 'SAR');

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('participants.headerTitle')} subtitle={tripName} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={role ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {offline ? <Banner type="warning" message={t('share.offlineNote')} /> : null}

        {roomsEnabled ? (
          <Button
            title={
              role
                ? `${t('share.button')} · ${t(`roles.${role}`)}`
                : t('share.button')
            }
            variant="outline"
            onPress={() => navigation.navigate('TripShare', { tripId, tripName })}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {role ? (
          <Card title={t('participants.whoAmITitle')} icon="🙋">
            <Text style={[styles.hint, textAlign]}>{t('participants.whoAmIHint')}</Text>
            <View style={[styles.chipRow, rowDir]}>
              {participants.map((p) => (
                <Chip key={p.id} label={p.name} selected={trip && trip.meId === p.id} onPress={() => handleSetMe(p.id)} />
              ))}
            </View>
          </Card>
        ) : null}

        {canManage ? (
          <>
            <Card title={t('participants.importTitle')} icon="👨‍👩‍👧‍👦">
              {groups.length === 0 ? (
                <EmptyState icon="📭" text={t('participants.importEmpty')} />
              ) : (
                groups.map((g) => (
                  <View key={g.id} style={[styles.groupRow, rowDir]}>
                    <View style={styles.groupInfo}>
                      <Text style={[styles.groupName, textAlign]}>{g.name}</Text>
                      <Text style={[styles.groupMeta, textAlign]}>{t('participants.memberCount', g.memberCount)}</Text>
                    </View>
                    <Button title={t('participants.importButton')} small variant="outline" onPress={() => handleImportGroup(g)} disabled={busy} />
                  </View>
                ))
              )}
            </Card>

            <Card title={t('participants.addNewTitle')} icon="➕">
              <Banner type={message.type} message={message.text} />
              <Input label={t('participants.nameLabel')} placeholder={t('participants.namePlaceholder')} value={name} onChangeText={setName} />

              <Text style={[styles.label, textAlign]}>{t('participants.shareLabel')}</Text>
              <View style={[styles.chipRow, rowDir, { marginBottom: 16 }]}>
                <Chip
                  label={t('participants.shareFull')}
                  selected={!useCustom && ratio === 1}
                  onPress={() => {
                    setUseCustom(false);
                    setRatio(1);
                  }}
                />
                <Chip
                  label={t('participants.shareHalf')}
                  selected={!useCustom && ratio === 0.5}
                  onPress={() => {
                    setUseCustom(false);
                    setRatio(0.5);
                  }}
                />
                <Chip label={t('participants.shareCustom')} selected={useCustom} onPress={() => setUseCustom(true)} />
              </View>

              {useCustom && (
                <Input
                  placeholder={t('participants.customPlaceholder')}
                  keyboardType="numeric"
                  value={customPercent}
                  onChangeText={setCustomPercent}
                  containerStyle={{ marginTop: 4 }}
                />
              )}

              <Button title={t('participants.addButton')} onPress={handleAdd} loading={busy} style={{ marginTop: 4 }} />
            </Card>
          </>
        ) : (
          <Banner type="warning" message={role === 'viewer' ? t('participants.viewOnly') : t('participants.managedByEditors')} />
        )}

        {canSetPay && participants.length >= 2 ? (
          <Card title={t('participants.payTitle')} icon="💸">
            <Text style={[styles.hint, textAlign]}>{t('participants.payHint')}</Text>
            <Text style={[styles.label, textAlign]}>
              {t('participants.payAll')} <Text style={styles.payNote}>{t('participants.payPriorityNote')}</Text>
            </Text>
            <View style={[styles.chipRow, rowDir]}>
              <Chip label={t('participants.payAuto')} selected={!participants.some((p) => payeeIds(p.payTo).length)} onPress={() => applyCollectors([])} />
              {participants.map((p) => (
                <Chip key={p.id} label={p.name} selected={collectors.includes(p.id)} onPress={() => toggleCollector(p.id)} />
              ))}
            </View>
          </Card>
        ) : null}

        <Card title={t('participants.listTitle')} icon="📋">
          {participants.length === 0 ? (
            <EmptyState icon="👥" text={t('participants.empty')} />
          ) : (
            participants.map((p) => (
              <View key={p.id} style={[styles.participantItem, accentSide]}>
                <View style={[styles.participantTop, rowDir]}>
                  <Text style={styles.participantName}>
                    {p.name}
                    {trip && trip.meId === p.id ? `  (${t('common.you')})` : ''}
                  </Text>
                  <View style={[styles.badges, rowDir]}>
                    <Text style={styles.expenseBadge}>
                      {p.totalExpense.toFixed(2)} {currencyText}
                    </Text>
                    <Text style={styles.shareBadge}>{shareLabelText(p.shareRatio, t)}</Text>
                  </View>
                </View>
                {canManage ? (
                  <View style={[styles.actionsRow, rowDir]}>
                    <Button
                      title={t('participants.shareFull')}
                      small
                      variant={p.shareRatio === 1 ? 'primary' : 'outline'}
                      onPress={() => handleUpdateShare(p.id, 1)}
                      style={styles.actionBtn}
                    />
                    <Button
                      title={t('participants.shareHalf')}
                      small
                      variant={p.shareRatio === 0.5 ? 'primary' : 'outline'}
                      onPress={() => handleUpdateShare(p.id, 0.5)}
                      style={styles.actionBtn}
                    />
                    <Button title={t('common.delete')} small variant="danger" onPress={() => handleDelete(p)} style={styles.actionBtn} />
                  </View>
                ) : null}
                {canSetPay && participants.length >= 2 ? (
                  <View style={styles.payRow}>
                    <Text style={[styles.payLabel, textAlign]}>
                      {t('participants.payTo')} <Text style={styles.payNote}>{t('participants.payPriorityNote')}</Text>
                    </Text>
                    <View style={[styles.chipRow, rowDir]}>
                      <Chip label={t('participants.payAuto')} selected={payeeIds(p.payTo).length === 0} onPress={() => handlePayAuto(p)} />
                      {participants
                        .filter((o) => o.id !== p.id)
                        .map((o) => {
                          const pos = payeeIds(p.payTo).indexOf(o.id);
                          return (
                            <Chip
                              key={o.id}
                              label={pos >= 0 && payeeIds(p.payTo).length > 1 ? `${pos + 1}. ${o.name}` : o.name}
                              selected={pos >= 0}
                              onPress={() => handlePayToggle(p, o.id)}
                            />
                          );
                        })}
                    </View>
                  </View>
                ) : payeeIds(p.payTo).some((x) => nameOf(x)) ? (
                  <Text style={[styles.payReadOnly, textAlign]}>
                    💸 {t('participants.payToName', payeeIds(p.payTo).map(nameOf).filter(Boolean).join(isRTL ? '، ' : ', '))}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </Card>

        <Button title={t('participants.nextButton')} onPress={handleNext} style={{ marginTop: 4 }} />
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
    chipRow: { flexWrap: 'wrap', gap: 8 },
    groupRow: {
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    groupInfo: { flex: 1 },
    groupName: { fontWeight: '700', color: colors.text },
    groupMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    participantItem: { backgroundColor: colors.chipBg, borderRadius: 10, padding: 14, marginBottom: 10 },
    participantTop: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
    participantName: { fontWeight: '700', fontSize: 16, color: colors.text },
    badges: { gap: 8 },
    expenseBadge: {
      backgroundColor: colors.cardBg,
      color: colors.primary,
      fontWeight: '700',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      fontSize: 12.5,
      overflow: 'hidden',
    },
    shareBadge: {
      backgroundColor: colors.infoBg,
      color: colors.info,
      fontWeight: '700',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      fontSize: 12.5,
      overflow: 'hidden',
    },
    payRow: { marginTop: 12 },
    payLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600', marginBottom: 6 },
    payNote: { fontSize: 11.5, color: colors.textMuted, fontWeight: '500' },
    payReadOnly: { marginTop: 8, fontSize: 13, color: colors.textMuted },
    actionsRow: { gap: 8 },
    actionBtn: { flex: 1 },
  });
