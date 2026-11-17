import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as db from '../data/storage';
import { useLanguage } from '../context/LanguageContext';
import { useApp } from '../context/AppContext';

// Keeps a shared trip fresh: sync on focus, every 15s while focused, and on pull-to-refresh.
// For local trips it does nothing. `reload` re-reads local storage into screen state.
//
// returns { refreshing, onRefresh, offline }
export default function useTripSync(tripId, tripName, reload, { poll = true } = {}) {
  const { t } = useLanguage();
  const { refreshTrips } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const timer = useRef(null);

  const run = useCallback(
    async (force = false) => {
      const status = await db.syncTrip(tripId, { force });
      if (status === 'ok') {
        await reload();
        await refreshTrips();
      }
      if (status === 'detached') {
        const trip = await db.getTrip(tripId);
        const key = trip && trip.detachedReason === 'invalid_code' ? 'trips.detachedRevoked' : 'trips.detachedGone';
        await reload();
        await refreshTrips();
        Alert.alert('', t(key, tripName));
      }
      setOffline(status === 'offline');
      return status;
    },
    [tripId, tripName, reload, refreshTrips, t]
  );

  useFocusEffect(
    useCallback(() => {
      run();
      if (poll) timer.current = setInterval(() => run(), 15000);
      return () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      };
    }, [run, poll])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run(true);
    } finally {
      setRefreshing(false);
    }
  }, [run]);

  return { refreshing, onRefresh, offline };
}
