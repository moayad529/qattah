import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as db from '../data/storage';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [trips, setTrips] = useState([]);
  const [groups, setGroups] = useState([]);

  const refreshTrips = useCallback(async () => {
    setTrips(await db.getTrips());
  }, []);

  const refreshGroups = useCallback(async () => {
    setGroups(await db.getGroups());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await db.ensureInitialized(); // one-time upgrade of data from older versions
      } catch (e) {
        // never block the app on a migration problem
      }
      await Promise.all([refreshTrips(), refreshGroups()]);
      setReady(true);
    })();
  }, [refreshTrips, refreshGroups]);

  // ---- Trip actions ----------------------------------------------------

  const createTrip = useCallback(
    async (name, currency) => {
      const trip = await db.createTrip(name, currency);
      await refreshTrips();
      return trip;
    },
    [refreshTrips]
  );

  const deleteTrip = useCallback(
    async (id) => {
      await db.deleteTrip(id);
      await refreshTrips();
    },
    [refreshTrips]
  );

  // ---- Group actions -----------------------------------------------------

  const createGroup = useCallback(
    async (name) => {
      const group = await db.createGroup(name);
      await refreshGroups();
      return group;
    },
    [refreshGroups]
  );

  const deleteGroup = useCallback(
    async (id) => {
      await db.deleteGroup(id);
      await refreshGroups();
    },
    [refreshGroups]
  );

  const value = {
    ready,
    trips,
    groups,
    refreshTrips,
    refreshGroups,
    createTrip,
    deleteTrip,
    createGroup,
    deleteGroup,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
