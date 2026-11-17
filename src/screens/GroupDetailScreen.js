import React, { useCallback, useState, useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Banner from '../components/Banner';
import { useTheme } from '../context/SettingsContext';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import * as db from '../data/storage';

export default function GroupDetailScreen({ route }) {
  const { colors, headerGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { groupId, groupName } = route.params;
  const { refreshGroups } = useApp();
  const { t, isRTL } = useLanguage();

  const [members, setMembers] = useState([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMembers(await db.getGroupMembers(groupId));
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = async () => {
    setMessage({ type: '', text: '' });
    if (!name.trim()) {
      setMessage({ type: 'error', text: t('errors.name_required') });
      return;
    }
    setBusy(true);
    try {
      await db.addGroupMember(groupId, name.trim());
      setName('');
      await load();
      await refreshGroups();
    } catch (e) {
      setMessage({ type: 'error', text: t(`errors.${e.message}`) || t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (member) => {
    Alert.alert(t('groupDetail.deleteTitle'), t('groupDetail.deleteConfirm', member.name), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await db.deleteGroupMember(member.id);
          await load();
          await refreshGroups();
        },
      },
    ]);
  };

  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('groupDetail.headerTitle')} subtitle={groupName} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card title={t('groupDetail.addTitle')} icon="➕">
          <Banner type={message.type} message={message.text} />
          <View style={styles.row}>
            <Input containerStyle={styles.rowInput} placeholder={t('groupDetail.namePlaceholder')} value={name} onChangeText={setName} />
          </View>
          <Button title={t('groupDetail.addButton')} onPress={handleAdd} loading={busy} />
        </Card>

        <Card title={t('groupDetail.listTitle')} icon="📋">
          {members.length === 0 ? (
            <EmptyState icon="🙂" text={t('groupDetail.empty')} />
          ) : (
            members.map((m) => (
              <View key={m.id} style={[styles.memberRow, rowDir]}>
                <Text style={styles.memberName}>{m.name}</Text>
                <TouchableOpacity onPress={() => handleDelete(m)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row' },
  rowInput: { flex: 1 },
  memberRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.chipBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  memberName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  deleteBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
});
