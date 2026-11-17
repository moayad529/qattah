import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
import * as receipts from '../data/receipts';
import { can } from '../data/rooms';
import useTripSync from '../hooks/useTripSync';
import { CATEGORIES, categoryMeta } from '../logic/categories';
import { parseBankMessages } from '../logic/bankSms';
import { localDateKey, ltr } from '../logic/stats';

export default function TripCostsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshTrips } = useApp();
  const { t, isRTL, cur } = useLanguage();
  const scrollRef = useRef(null);

  const [trip, setTrip] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [receiptMap, setReceiptMap] = useState({});

  // ---- form state (shared by "add" and "edit") ----
  const [editingId, setEditingId] = useState(null);
  const [participantId, setParticipantId] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [expenseDate, setExpenseDate] = useState(null); // ISO or null (= now for new / keep for edit)
  const [dateFromSms, setDateFromSms] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState(null); // new local image URI picked in this form
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const selectionTouched = useRef(false);

  // ---- bank message paste ----
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsQueue, setSmsQueue] = useState([]);
  const [smsWarnings, setSmsWarnings] = useState([]);

  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);

  const tripName = trip ? trip.name : route.params.tripName;
  const role = trip && trip.room ? trip.room.role : null;
  const canAdd = can(role, 'entry');
  const canEdit = can(role, 'editor');
  const currencyText = cur(trip ? trip.currency : 'SAR');

  const load = useCallback(async () => {
    const [tr, p, e, map] = await Promise.all([
      db.getTrip(tripId),
      db.getParticipants(tripId),
      db.getExpenses(tripId),
      receipts.getReceiptMap(),
    ]);
    setTrip(tr);
    setParticipants(p);
    setExpenses(e);
    setReceiptMap(map);
    const ids = p.map((x) => x.id);
    // keep the split selection valid; default to "everyone" until the user touches it
    setSelectedIds((prev) => (selectionTouched.current ? prev.filter((id) => ids.includes(id)) : ids));
    // default "who paid" to me (shared trips) once
    setParticipantId((prev) => (prev && ids.includes(prev) ? prev : tr && tr.meId && ids.includes(tr.meId) ? tr.meId : ''));
    return p;
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const { refreshing, onRefresh, offline } = useTripSync(tripId, tripName, load);

  const toggleSelected = (id) => {
    selectionTouched.current = true;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetForm = (ps = participants) => {
    setEditingId(null);
    setAmount('');
    setCategory('');
    setNote('');
    setExpenseDate(null);
    setDateFromSms(false);
    setReceiptDraft(null);
    setReceiptRemoved(false);
    setSmsWarnings([]);
    selectionTouched.current = false;
    setSelectedIds(ps.map((x) => x.id));
    setParticipantId(trip && trip.meId && ps.some((p) => p.id === trip.meId) ? trip.meId : '');
  };

  // ---- bank message ----
  const applyParsed = (p) => {
    setEditingId(null);
    setAmount(String(p.amount));
    setNote(p.merchant || '');
    setCategory(p.category || '');
    setExpenseDate(p.date || null);
    setDateFromSms(Boolean(p.date));
    const warnings = [];
    if (p.incoming) warnings.push(t('costs.sms.incoming'));
    if (p.currency && trip && p.currency !== trip.currency) {
      warnings.push(t('costs.sms.currencyMismatch', cur(p.currency), cur(trip.currency)));
    }
    setSmsWarnings(warnings);
    setMessage({ type: 'success', text: t('costs.sms.filled') });
  };

  const handleParseSms = () => {
    setMessage({ type: '', text: '' });
    const parsed = parseBankMessages(smsText);
    if (parsed.length === 0) {
      setMessage({ type: 'error', text: t('errors.sms_no_amount') });
      return;
    }
    setSmsQueue(parsed.slice(1));
    applyParsed(parsed[0]);
    setSmsText('');
    setSmsOpen(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // ---- receipt image ----
  const pickReceipt = async (fromCamera) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('', t('costs.receipt.permissionDenied'));
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setReceiptDraft(result.assets[0].uri);
        setReceiptRemoved(false);
      }
    } catch (e) {
      Alert.alert('', t('costs.receipt.permissionDenied'));
    }
  };

  const currentReceiptUri = receiptDraft
    ? receiptDraft
    : editingId && !receiptRemoved && receiptMap[editingId]
    ? receipts.receiptUri(receiptMap[editingId])
    : null;

  // ---- save (add or edit) ----
  const handleSave = async () => {
    setMessage({ type: '', text: '' });
    if (!participantId) {
      setMessage({ type: 'error', text: t('costs.whoPaidValidation') });
      return;
    }
    const parsed = parseFloat(String(amount).replace(',', '.'));
    if (!parsed || parsed <= 0) {
      setMessage({ type: 'error', text: t('costs.amountValidation') });
      return;
    }
    if (selectedIds.length === 0) {
      setMessage({ type: 'error', text: t('errors.select_at_least_one_participant') });
      return;
    }
    setBusy(true);
    try {
      const opts = { category: category || 'other', createdAt: expenseDate || undefined };
      let saved;
      if (editingId) {
        saved = await db.updateExpense(editingId, participantId, parsed, note, selectedIds, opts);
      } else {
        saved = await db.addExpense(tripId, participantId, parsed, note, selectedIds, opts);
      }
      if (receiptDraft) await receipts.saveReceipt(saved.id, receiptDraft);
      else if (editingId && receiptRemoved) await receipts.removeReceipt(editingId);

      const wasEditing = Boolean(editingId);
      const p = await load();
      await refreshTrips();
      resetForm(p);
      if (!wasEditing && smsQueue.length > 0) {
        const [next, ...rest] = smsQueue;
        setSmsQueue(rest);
        applyParsed(next);
      } else {
        setMessage({ type: 'success', text: t(wasEditing ? 'costs.updateSuccess' : 'costs.addSuccess') });
      }
    } catch (e) {
      setMessage({ type: 'error', text: t(`errors.${e.message}`) || t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (e) => {
    setMessage({ type: '', text: '' });
    setEditingId(e.id);
    setParticipantId(e.participantId);
    setAmount(String(e.amount));
    setCategory(e.category === 'other' ? 'other' : e.category);
    setNote(e.description || '');
    setExpenseDate(e.createdAt);
    setDateFromSms(false);
    setReceiptDraft(null);
    setReceiptRemoved(false);
    setSmsWarnings([]);
    selectionTouched.current = true;
    const valid = (e.splitAmong || []).filter((id) => participants.some((p) => p.id === id));
    setSelectedIds(valid.length > 0 ? valid : participants.map((p) => p.id));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleDelete = (expense) => {
    Alert.alert(t('costs.deleteTitle'), t('costs.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await db.deleteExpense(expense.id);
            if (editingId === expense.id) resetForm();
            await load();
            await refreshTrips();
          } catch (e) {
            setMessage({ type: 'error', text: t(`errors.${e.message}`) || t('common.error') });
          }
        },
      },
    ]);
  };

  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };
  const dateLabel = expenseDate ? ltr(localDateKey(expenseDate)) : null;

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('costs.headerTitle')} subtitle={tripName} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={role ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {offline ? <Banner type="warning" message={t('share.offlineNote')} /> : null}

        {!canAdd ? <Banner type="warning" message={t('costs.viewOnlyNote')} /> : null}
        {canAdd && !canEdit ? <Banner type="warning" message={t('costs.entryOnlyNote')} /> : null}

        {canAdd ? (
          <>
            <Card title={t('costs.sms.title')} icon="💬">
              {smsOpen ? (
                <>
                  <Text style={[styles.hint, textAlign]}>{t('costs.sms.hint')}</Text>
                  <Input
                    placeholder={t('costs.sms.placeholder')}
                    value={smsText}
                    onChangeText={setSmsText}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    style={{ minHeight: 110 }}
                  />
                  <View style={[styles.btnRow, rowDir]}>
                    <Button title={t('costs.sms.parse')} onPress={handleParseSms} style={{ flex: 1 }} disabled={!smsText.trim()} />
                    <Button title={t('costs.sms.toggleHide')} variant="outline" onPress={() => setSmsOpen(false)} />
                  </View>
                </>
              ) : (
                <Button title={t('costs.sms.toggleShow')} variant="outline" icon="📋" onPress={() => setSmsOpen(true)} />
              )}
            </Card>

            <Card title={editingId ? t('costs.editTitle') : t('costs.addTitle')} icon={editingId ? '✏️' : '➕'}>
              <Banner type={message.type} message={message.text} />
              {smsWarnings.map((w, i) => (
                <Banner key={i} type="warning" message={w} />
              ))}
              {smsQueue.length > 0 && !editingId ? <Banner type="success" message={t('costs.sms.queue', smsQueue.length)} /> : null}

              <Text style={[styles.label, textAlign]}>{t('costs.whoPaidLabel')}</Text>
              <View style={[styles.chipRow, rowDir]}>
                {participants.map((p) => (
                  <Chip key={p.id} label={p.name} selected={participantId === p.id} onPress={() => setParticipantId(p.id)} />
                ))}
              </View>

              <Input
                label={t('costs.amountLabel', currencyText)}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={[styles.label, textAlign]}>{t('costs.categoryLabel')}</Text>
              <View style={[styles.chipRow, rowDir]}>
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c.key}
                    label={`${c.icon} ${t(`costs.quick.${c.key}`)}`}
                    selected={category === c.key}
                    onPress={() => setCategory(category === c.key ? '' : c.key)}
                  />
                ))}
              </View>

              <Input
                label={t('costs.noteLabel')}
                placeholder={t('costs.notePlaceholder')}
                value={note}
                onChangeText={setNote}
                containerStyle={{ marginTop: 4 }}
              />

              {dateLabel ? (
                <View style={[styles.dateRow, rowDir]}>
                  <Text style={styles.dateText}>
                    📅 {t('costs.dateLabel')}: {dateLabel}
                    {dateFromSms ? ` (${t('costs.dateFromMessage')})` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => { setExpenseDate(new Date().toISOString()); setDateFromSms(false); }}>
                    <Text style={styles.linkText}>{t('costs.dateReset')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={[styles.label, textAlign]}>{t('costs.splitLabel')}</Text>
              <View style={[styles.chipRow, rowDir]}>
                {participants.map((p) => {
                  const selected = selectedIds.includes(p.id);
                  return (
                    <Chip
                      key={p.id}
                      tone="success"
                      label={`${selected ? '✓ ' : ''}${p.name}`}
                      selected={selected}
                      onPress={() => toggleSelected(p.id)}
                    />
                  );
                })}
              </View>

              <Text style={[styles.label, textAlign, { marginTop: 14 }]}>{t('costs.receipt.title')}</Text>
              {currentReceiptUri ? (
                <View style={[styles.receiptRow, rowDir]}>
                  <TouchableOpacity onPress={() => setViewerUri(currentReceiptUri)}>
                    <Image source={{ uri: currentReceiptUri }} style={styles.receiptThumb} />
                  </TouchableOpacity>
                  <Button
                    title={t('costs.receipt.remove')}
                    small
                    variant="outline"
                    onPress={() => {
                      setReceiptDraft(null);
                      setReceiptRemoved(true);
                    }}
                  />
                </View>
              ) : (
                <View style={[styles.btnRow, rowDir]}>
                  <Button title={`📷 ${t('costs.receipt.camera')}`} small variant="outline" onPress={() => pickReceipt(true)} style={{ flex: 1 }} />
                  <Button title={`🖼️ ${t('costs.receipt.library')}`} small variant="outline" onPress={() => pickReceipt(false)} style={{ flex: 1 }} />
                </View>
              )}
              <Text style={[styles.hint, textAlign, { marginTop: 8 }]}>
                {role ? t('costs.receipt.sharedNote') : t('costs.receipt.localNote')}
              </Text>

              <Button
                title={editingId ? t('costs.saveEditButton') : t('costs.addButton')}
                onPress={handleSave}
                loading={busy}
                style={{ marginTop: 12 }}
              />
              {editingId ? (
                <Button
                  title={t('costs.cancelEditButton')}
                  variant="outline"
                  onPress={() => {
                    resetForm();
                    setMessage({ type: '', text: '' });
                  }}
                  style={{ marginTop: 8 }}
                />
              ) : null}
            </Card>
          </>
        ) : null}

        <Card title={t('costs.historyTitle')} icon="🧾">
          {expenses.length === 0 ? (
            <EmptyState icon="💰" text={t('costs.empty')} />
          ) : (
            expenses.map((e) => {
              const meta = categoryMeta(e.category);
              const hasReceipt = Boolean(receiptMap[e.id]);
              return (
                <View key={e.id} style={[styles.expenseRow, rowDir, editingId === e.id && styles.expenseRowEditing]}>
                  <View style={styles.expenseInfo}>
                    <Text style={[styles.expenseName, textAlign]}>
                      {meta.icon} {t(`costs.quick.${e.category}`)}
                      {e.description ? ` — ${e.description}` : ''}
                    </Text>
                    <Text style={[styles.expenseDesc, textAlign]}>
                      {e.name} · {t('costs.splitCount', e.splitCount || participants.length)}
                    </Text>
                    <Text style={[styles.expenseDesc, textAlign]}>{ltr(localDateKey(e.createdAt))}</Text>
                    {hasReceipt ? (
                      <TouchableOpacity onPress={() => setViewerUri(receipts.receiptUri(receiptMap[e.id]))}>
                        <Text style={[styles.linkText, textAlign]}>{t('costs.receipt.hasReceipt')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.expenseAmount}>
                    {e.amount.toFixed(2)} {currencyText}
                  </Text>
                  {canEdit ? (
                    <View style={styles.actionsCol}>
                      <TouchableOpacity onPress={() => startEdit(e)} style={styles.editBtn}>
                        <Text style={styles.btnText}>{t('costs.editButton')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(e)} style={styles.deleteBtn}>
                        <Text style={styles.btnText}>{t('common.delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>

        <Button
          title={t('costs.nextButton')}
          onPress={() => navigation.navigate('TripResults', { tripId, tripName })}
          style={{ marginTop: 4 }}
        />
        <Button
          title={t('costs.statsButton')}
          variant="outline"
          onPress={() => navigation.navigate('TripStats', { tripId, tripName })}
          style={{ marginTop: 10 }}
        />
      </ScrollView>

      <Modal visible={Boolean(viewerUri)} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
          {viewerUri ? <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    content: { padding: 16, paddingBottom: 40 },
    label: { marginBottom: 8, color: colors.text, fontWeight: '600', fontSize: 14 },
    hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 19, marginBottom: 10 },
    chipRow: { flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    btnRow: { gap: 8, alignItems: 'center' },
    dateRow: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 },
    dateText: { color: colors.textMuted, fontSize: 13, flex: 1 },
    linkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    receiptRow: { alignItems: 'center', gap: 12 },
    receiptThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.chipBg },
    expenseRow: {
      alignItems: 'center',
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      gap: 10,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    expenseRowEditing: { borderColor: colors.primary },
    expenseInfo: { flex: 1 },
    expenseName: { fontWeight: '700', color: colors.text },
    expenseDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    expenseAmount: { color: colors.primary, fontWeight: '700' },
    actionsCol: { gap: 6 },
    editBtn: { backgroundColor: colors.info, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center' },
    deleteBtn: { backgroundColor: colors.danger, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    viewerBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' },
    viewerImage: { width: '94%', height: '80%' },
    viewerClose: { position: 'absolute', top: 56, right: 24, zIndex: 2, padding: 8 },
    viewerCloseText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  });
