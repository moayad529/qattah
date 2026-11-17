import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import Banner from '../components/Banner';
import { useTheme } from '../context/SettingsContext';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import * as db from '../data/storage';
import { ROOMS_API_URL, roomsEnabled } from '../config';

const INVITE_ROLES = ['editor', 'entry', 'viewer'];

export default function TripShareScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshTrips } = useApp();
  const { t, isRTL } = useLanguage();
  const [trip, setTrip] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const load = useCallback(async () => setTrip(await db.getTrip(tripId)), [tripId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const room = trip && trip.room;
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };
  const fail = (e) => setMessage({ type: 'error', text: t(`errors.${e.message}`) || t('common.error') });

  const handleCreate = async () => {
    setMessage({ type: '', text: '' });
    setBusy(true);
    try {
      await db.shareTrip(tripId);
      await load();
      await refreshTrips();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = (code) => `${ROOMS_API_URL}/j#${code}`;

  const sendInvite = async (role, code) => {
    try {
      await Share.share({
        message: t('share.inviteMessage', trip.name, t(`roles.${role}`), code, inviteLink(code)),
      });
    } catch (e) {
      // cancelled
    }
  };

  const copy = async (code) => {
    await Clipboard.setStringAsync(code);
    setMessage({ type: 'success', text: t('share.codeCopied') });
  };

  const regenerate = (role) => {
    Alert.alert('', t('share.regenerateConfirm', t(`roles.${role}`)), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('share.regenerate'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await db.rotateRoomCode(tripId, role);
            await load();
            setMessage({ type: 'success', text: t('share.regenerated') });
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const stop = () => {
    Alert.alert(t('share.stopTitle'), t('share.stopConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('share.stopButton'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await db.stopSharing(tripId);
            await load();
            await refreshTrips();
            setMessage({ type: 'success', text: t('share.stopped') });
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('share.headerTitle')} subtitle={trip ? trip.name : route.params.tripName} />
      <ScrollView contentContainerStyle={styles.content}>
        <Banner type={message.type} message={message.text} />

        {!roomsEnabled ? (
          <Banner type="warning" message={t('errors.rooms_unavailable')} />
        ) : !room ? (
          <Card title={t('share.notSharedTitle')} icon="📱">
            <Text style={[styles.body, textAlign]}>{t('share.notSharedText')}</Text>
            <Text style={[styles.body, textAlign]}>{t('share.privacyBullets')}</Text>
            <Button title={t('share.createButton')} onPress={handleCreate} loading={busy} />
          </Card>
        ) : room.role === 'owner' ? (
          <>
            <Card title={t('share.invitesTitle')} icon="✉️">
              <Text style={[styles.body, textAlign]}>{t('share.invitesHint')}</Text>
              {INVITE_ROLES.map((role) => {
                const code = room.codes && room.codes[role];
                return (
                  <View key={role} style={styles.roleBox}>
                    <Text style={[styles.roleName, textAlign]}>{t(`roles.${role}`)}</Text>
                    <Text style={[styles.roleDesc, textAlign]}>{t(`roles.${role}Desc`)}</Text>
                    {code ? <Text style={styles.code} selectable>{code}</Text> : null}
                    <View style={[styles.btnRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      {code ? (
                        <>
                          <Button title={t('share.sendInvite')} small onPress={() => sendInvite(role, code)} style={{ flex: 1 }} />
                          <Button title={t('share.copyCode')} small variant="outline" onPress={() => copy(code)} style={{ flex: 1 }} />
                        </>
                      ) : null}
                      <Button
                        title={t('share.regenerate')}
                        small
                        variant="outline"
                        onPress={() => regenerate(role)}
                        disabled={busy}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                );
              })}
              <Text style={[styles.note, textAlign]}>{t('share.expiryNote')}</Text>
            </Card>

            <Card title={t('share.ownerTitle')} icon="🔑">
              <Text style={[styles.warn, textAlign]}>{t('share.ownerWarning')}</Text>
              <Text style={styles.code} selectable>{room.code}</Text>
              <Button title={t('share.copyCode')} small variant="outline" onPress={() => copy(room.code)} />
            </Card>

            <Card title={t('share.stopTitle')} icon="🛑">
              <Text style={[styles.body, textAlign]}>{t('share.stopText')}</Text>
              <Button title={t('share.stopButton')} variant="danger" onPress={stop} loading={busy} />
            </Card>
          </>
        ) : (
          <Card title={t('share.memberTitle', t(`roles.${room.role}`))} icon="🔗">
            <Text style={[styles.body, textAlign]}>{t('share.memberText')}</Text>
            <Text style={[styles.note, textAlign]}>{t('share.expiryNote')}</Text>
          </Card>
        )}

        <Button title={t('common.done')} variant="outline" onPress={() => navigation.goBack()} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    content: { padding: 16, paddingBottom: 40 },
    body: { color: colors.text, fontSize: 14, lineHeight: 22, marginBottom: 12 },
    note: { color: colors.textMuted, fontSize: 12.5, marginTop: 4 },
    warn: { color: colors.warningText, backgroundColor: colors.warningBg, padding: 10, borderRadius: 8, fontSize: 13, lineHeight: 20, marginBottom: 12, overflow: 'hidden' },
    roleBox: { backgroundColor: colors.chipBg, borderRadius: 10, padding: 12, marginBottom: 10 },
    roleName: { fontWeight: '800', color: colors.text, fontSize: 15 },
    roleDesc: { color: colors.textMuted, fontSize: 12.5, marginTop: 2, marginBottom: 8 },
    code: { fontFamily: undefined, fontWeight: '700', letterSpacing: 1, color: colors.primary, textAlign: 'center', fontSize: 15, marginVertical: 8 },
    btnRow: { gap: 8 },
  });
