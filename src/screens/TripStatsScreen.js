import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import GradientHeader from '../components/GradientHeader';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useTheme } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import * as db from '../data/storage';
import { categoryMeta } from '../logic/categories';
import { computeStats, localDateKey, ltr } from '../logic/stats';

const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function BarRow({ label, value, pct, color, sub, styles, rowDir, textAlign }) {
  return (
    <View style={styles.barBlock}>
      <View style={[styles.barTop, rowDir]}>
        <Text style={[styles.barLabel, textAlign]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.barValue}>{value}</Text>
      </View>
      <View style={[styles.track, rowDir]}>
        <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color }]} />
      </View>
      {sub ? <Text style={[styles.barSub, textAlign]}>{sub}</Text> : null}
    </View>
  );
}

export default function TripStatsScreen({ route }) {
  const { tripId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, isRTL, cur } = useLanguage();
  const [trip, setTrip] = useState(null);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    const [tr, p, e] = await Promise.all([db.getTrip(tripId), db.getParticipants(tripId), db.getExpenses(tripId)]);
    setTrip(tr);
    setStats({ ...computeStats(p, e), participantCount: p.length, expensesList: e });
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tripName = trip ? trip.name : route.params.tripName;
  const c = cur(trip ? trip.currency : 'SAR');
  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  const textAlign = { textAlign: isRTL ? 'right' : 'left' };
  const hasData = stats && stats.count > 0;

  const tiles = hasData
    ? [
        { l: t('stats.total'), v: `${money(stats.total)}`, u: c },
        { l: t('stats.count'), v: `${stats.count}`, u: '' },
        { l: t('stats.average'), v: `${money(stats.average)}`, u: c },
        { l: t('stats.perPerson'), v: `${money(stats.perPerson)}`, u: c },
        { l: t('stats.perDay'), v: `${money(stats.perDay)}`, u: c },
        { l: t('stats.days'), v: `${stats.days}`, u: '' },
      ]
    : [];

  const maxDay = hasData ? Math.max(...stats.byDay.map((d) => d.total)) : 0;
  const biggest = hasData ? stats.biggest : null;
  const biggestPayer = biggest && stats.expensesList.find((e) => e.id === biggest.id);

  return (
    <View style={styles.screen}>
      <GradientHeader title={t('stats.headerTitle')} subtitle={tripName} />
      <ScrollView contentContainerStyle={styles.content}>
        {!hasData ? (
          <Card>
            <EmptyState icon="📈" text={t('stats.empty')} />
          </Card>
        ) : (
          <>
            <View style={[styles.grid, rowDir]}>
              {tiles.map((x) => (
                <View key={x.l} style={styles.tile}>
                  <Text style={styles.tileLabel}>{x.l}</Text>
                  <Text style={styles.tileValue}>{x.v}</Text>
                  {x.u ? <Text style={styles.tileUnit}>{x.u}</Text> : <Text style={styles.tileUnit}> </Text>}
                </View>
              ))}
            </View>

            {biggest ? (
              <Card title={t('stats.biggest')} icon="🏆">
                <Text style={[styles.biggestAmount, textAlign]}>
                  {money(biggest.amount)} {c}
                </Text>
                <Text style={[styles.barSub, textAlign]}>
                  {categoryMeta(biggest.category).icon} {t(`costs.quick.${biggest.category}`)}
                  {biggest.description ? ` — ${biggest.description}` : ''}
                </Text>
                <Text style={[styles.barSub, textAlign]}>
                  {biggestPayer ? `${biggestPayer.name} · ` : ''}
                  {ltr(localDateKey(biggest.createdAt))}
                </Text>
              </Card>
            ) : null}

            <Card title={t('stats.byCategory')} icon="🧩">
              {stats.byCategory.map((k) => {
                const m = categoryMeta(k.key);
                return (
                  <BarRow
                    key={k.key}
                    label={`${m.icon} ${t(`costs.quick.${k.key}`)}`}
                    value={`${money(k.total)} ${c} · ${k.pct}%`}
                    pct={k.pct}
                    color={m.color}
                    sub={t('stats.times', k.count)}
                    styles={styles}
                    rowDir={rowDir}
                    textAlign={textAlign}
                  />
                );
              })}
            </Card>

            <Card title={t('stats.byPayer')} icon="💳">
              {stats.byPayer.map((p) => (
                <BarRow
                  key={p.id}
                  label={p.name}
                  value={`${money(p.total)} ${c} · ${p.pct}%`}
                  pct={p.pct}
                  color={colors.primary}
                  styles={styles}
                  rowDir={rowDir}
                  textAlign={textAlign}
                />
              ))}
            </Card>

            <Card title={t('stats.byDay')} icon="📅">
              {stats.byDay.map((d) => (
                <BarRow
                  key={d.date}
                  label={ltr(d.date)}
                  value={`${money(d.total)} ${c}`}
                  pct={maxDay > 0 ? (d.total / maxDay) * 100 : 0}
                  color={colors.info}
                  styles={styles}
                  rowDir={rowDir}
                  textAlign={textAlign}
                />
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    content: { padding: 16, paddingBottom: 40 },
    grid: { flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    tile: { width: '48%', flexGrow: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    tileLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, marginBottom: 6, textAlign: 'center' },
    tileValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
    tileUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
    biggestAmount: { fontSize: 24, fontWeight: '800', color: colors.primary, marginBottom: 6 },
    barBlock: { marginBottom: 14 },
    barTop: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
    barLabel: { color: colors.text, fontWeight: '600', fontSize: 13.5, flexShrink: 1 },
    barValue: { color: colors.textMuted, fontSize: 12.5 },
    track: { height: 10, borderRadius: 6, backgroundColor: colors.chipBg, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 6 },
    barSub: { color: colors.textLight, fontSize: 12, marginTop: 4 },
  });
