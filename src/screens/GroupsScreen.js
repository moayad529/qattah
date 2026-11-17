import React, { useState, useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Banner from '../components/Banner';
import { useTheme } from '../context/SettingsContext';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';

export default function GroupsScreen({ navigation }) {
  const { colors, headerGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { groups, createGroup, deleteGroup } = useApp();
  const { t, isRTL } = useLanguage();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setError('');
    if (!name.trim()) {
      setError(t('errors.group_name_required'));
      return;
    }
    setBusy(true);
    try {
      const group = await createGroup(name.trim());
      setName('');
      navigation.navigate('GroupDetail', { groupId: group.id, groupName: group.name });
    } catch (e) {
      setError(t(`errors.${e.message}`) || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (group) => {
    Alert.alert(t('groups.deleteTitle'), t('groups.deleteConfirm', group.name), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteGroup(group.id) },
    ]);
  };

  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('groups.headerTitle')} subtitle={t('groups.headerSubtitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card title={t('groups.newTitle')} icon="➕">
          <Banner type="error" message={error} />
          <Input placeholder={t('groups.namePlaceholder')} value={name} onChangeText={setName} />
          <Button title={t('groups.createButton')} onPress={handleCreate} loading={busy} />
        </Card>

        <Card title={t('groups.listTitle')} icon="📋">
          {groups.length === 0 ? (
            <EmptyState icon="👨‍👩‍👧‍👦" text={t('groups.empty')} />
          ) : (
            groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.groupItem, rowDir]}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('GroupDetail', { groupId: g.id, groupName: g.name })}
              >
                <View style={styles.groupInfo}>
                  <Text style={[styles.groupName, textAlign]}>{g.name}</Text>
                  <Text style={[styles.groupMeta, textAlign]}>{t('groups.memberCount', g.memberCount)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(g)}
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

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  groupItem: {
    alignItems: 'center',
    backgroundColor: colors.chipBg,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  groupInfo: { flex: 1 },
  groupName: { fontWeight: '700', fontSize: 15, color: colors.text },
  groupMeta: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  deleteBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 10,
  },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
});
