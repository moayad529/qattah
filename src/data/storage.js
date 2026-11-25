import AsyncStorage from '@react-native-async-storage/async-storage';
import * as rooms from './rooms.js';
import { computeSettlements, payeeIds } from '../logic/settlement.js';
import { inferCategoryFromDescription, isCategory } from '../logic/categories.js';
import { DEFAULT_CURRENCY } from '../logic/currencies.js';

// ---------------------------------------------------------------------------
// Local, on-device storage (AsyncStorage). Trips are local by default. A trip
// can optionally be *shared*: then it carries a `room` link and every change
// goes through the rooms server first (which enforces the member's role) and
// the local copy is refreshed from the server's answer.
//
// Shape:
//   trips:         [{ id, name, currency, createdAt, meId?, room? }]
//                    room = { id, role, code, codes?, rev }   (codes: owner only)
//   participants:  [{ id, tripId, name, shareRatio, payTo? }]   payTo = ids this member pays first, in priority order (owner's choice; a single id in older data)
//   expenses:      [{ id, tripId, participantId, amount, description, category,
//                     splitAmong, createdAt }]
//   groups:        [{ id, name, createdAt }]
//   groupMembers:  [{ id, groupId, name }]
// ---------------------------------------------------------------------------

const KEYS = {
  trips: '@tripkitty/trips',
  participants: '@tripkitty/participants',
  expenses: '@tripkitty/expenses',
  groups: '@tripkitty/groups',
  groupMembers: '@tripkitty/groupMembers',
  schema: '@qatta/schemaVersion',
};
const SCHEMA_VERSION = 2;
const ROLE_RANK = { viewer: 0, entry: 1, editor: 2, owner: 3 };

const genId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function readJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function writeJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

const getTripsRaw = () => readJSON(KEYS.trips, []);
const setTripsRaw = (v) => writeJSON(KEYS.trips, v);
const getParticipantsRaw = () => readJSON(KEYS.participants, []);
const setParticipantsRaw = (v) => writeJSON(KEYS.participants, v);
const getExpensesRaw = () => readJSON(KEYS.expenses, []);
const setExpensesRaw = (v) => writeJSON(KEYS.expenses, v);
const getGroupsRaw = () => readJSON(KEYS.groups, []);
const setGroupsRaw = (v) => writeJSON(KEYS.groups, v);
const getGroupMembersRaw = () => readJSON(KEYS.groupMembers, []);
const setGroupMembersRaw = (v) => writeJSON(KEYS.groupMembers, v);

// Other modules (e.g. receipt images) can clean up when expenses disappear.
let expensesRemovedHook = null;
export function onExpensesRemoved(fn) {
  expensesRemovedHook = fn;
}
function notifyRemoved(ids) {
  if (expensesRemovedHook && ids.length > 0) {
    Promise.resolve(expensesRemovedHook(ids)).catch(() => {});
  }
}

// One-time upgrade of data written by older app versions:
//  - every trip gets a currency (old trips were all in the global default, SAR)
//  - every expense gets a stable, language-independent category
export async function ensureInitialized() {
  const version = Number((await AsyncStorage.getItem(KEYS.schema)) || 0);
  if (version >= SCHEMA_VERSION) return;

  const [trips, expenses] = await Promise.all([getTripsRaw(), getExpensesRaw()]);
  await setTripsRaw(trips.map((t) => (t.currency ? t : { ...t, currency: DEFAULT_CURRENCY })));
  await setExpensesRaw(
    expenses.map((e) => {
      if (isCategory(e.category)) return e;
      const { category, description } = inferCategoryFromDescription(e.description);
      return { ...e, category, description };
    })
  );
  await AsyncStorage.setItem(KEYS.schema, String(SCHEMA_VERSION));
}

// ------------------------------ Rooms glue -----------------------------------

async function updateTrip(tripId, patch) {
  const trips = await getTripsRaw();
  await setTripsRaw(trips.map((t) => (t.id === tripId ? { ...t, ...patch } : t)));
}

async function getTripRaw(tripId) {
  const trips = await getTripsRaw();
  return trips.find((t) => t.id === tripId) || null;
}

// Replace the local copy of a shared trip with the server's snapshot.
async function applySnapshot(tripId, snap) {
  const [trips, participants, expenses] = await Promise.all([
    getTripsRaw(),
    getParticipantsRaw(),
    getExpensesRaw(),
  ]);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return;

  const newParticipants = snap.participants.map((p) => ({
    id: p.id,
    tripId,
    name: p.name,
    shareRatio: p.shareRatio,
    payTo: (() => {
      const ids = Array.isArray(p.payToIds) && p.payToIds.length ? p.payToIds : payeeIds(p.payTo);
      return ids.length ? ids : undefined;
    })(),
  }));
  const newExpenses = snap.expenses.map((e) => ({
    id: e.id,
    tripId,
    participantId: e.participantId,
    amount: e.amount,
    description: e.description || '',
    category: isCategory(e.category) ? e.category : 'other',
    splitAmong: e.splitAmong,
    createdAt: e.createdAt,
  }));

  const keptIds = new Set(newExpenses.map((e) => e.id));
  const removed = expenses.filter((e) => e.tripId === tripId && !keptIds.has(e.id)).map((e) => e.id);

  await setParticipantsRaw([...participants.filter((p) => p.tripId !== tripId), ...newParticipants]);
  await setExpensesRaw([...expenses.filter((e) => e.tripId !== tripId), ...newExpenses]);
  await setTripsRaw(
    trips.map((t) =>
      t.id === tripId
        ? {
            ...t,
            name: snap.room.name,
            currency: snap.room.currency,
            meId: newParticipants.some((p) => p.id === t.meId) ? t.meId : undefined,
            room: { ...t.room, role: snap.role, rev: snap.room.rev },
          }
        : t
    )
  );
  notifyRemoved(removed);
}

// Pulls the latest server state for a shared trip.
// -> 'local' | 'ok' | 'unchanged' | 'offline' | 'detached'
export async function syncTrip(tripId, { force = false } = {}) {
  const trip = await getTripRaw(tripId);
  if (!trip || !trip.room) return 'local';
  try {
    const snap = await rooms.fetchRoom(trip.room, force ? undefined : trip.room.rev);
    if (snap.unchanged) {
      if (snap.role !== trip.room.role) await updateTrip(tripId, { room: { ...trip.room, role: snap.role } });
      return 'unchanged';
    }
    await applySnapshot(tripId, snap);
    return 'ok';
  } catch (e) {
    if (e.message === 'room_not_found' || e.message === 'invalid_code') {
      // Room deleted / expired, or this code was revoked: keep the data, make it a normal local trip.
      await updateTrip(tripId, { room: undefined, detachedReason: e.message });
      return 'detached';
    }
    return 'offline';
  }
}

// Run a server write for a shared trip, then adopt the server's answer.
async function viaRoom(trip, call) {
  const snap = await call(trip.room);
  await applySnapshot(trip.id, snap);
}

// Uploads a local trip and returns the room codes (owner device only).
export async function shareTrip(tripId) {
  const trip = await getTripRaw(tripId);
  if (!trip) throw new Error('no_trip_selected');
  if (trip.room) throw new Error('already_shared');
  const [participants, expensesAll] = await Promise.all([getParticipantsRaw(), getExpensesRaw()]);
  const ps = participants.filter((p) => p.tripId === tripId);
  const ids = new Set(ps.map((p) => p.id));
  const es = expensesAll
    .filter((e) => e.tripId === tripId && ids.has(e.participantId))
    .map((e) => {
      const split = (Array.isArray(e.splitAmong) ? e.splitAmong : []).filter((id) => ids.has(id));
      return { ...e, splitAmong: split.length > 0 ? split : [...ids] }; // legacy = everyone
    });
  const res = await rooms.createRoom({
    name: trip.name,
    currency: trip.currency || DEFAULT_CURRENCY,
    participants: ps,
    expenses: es,
  });
  await updateTrip(tripId, {
    detachedReason: undefined,
    room: { id: res.roomId, role: 'owner', code: res.codes.owner, codes: res.codes, rev: 0 },
  });
  await syncTrip(tripId, { force: true });
  return res.codes;
}

// Joins an existing room with a code and creates a local copy of the trip.
export async function joinTrip(code) {
  const snap = await rooms.joinRoom(code);
  const trips = await getTripsRaw();
  const existing = trips.find((t) => t.room && t.room.id === snap.roomId);
  let trip;
  if (existing) {
    // Same room joined again: never downgrade (an owner pasting a viewer code stays owner).
    trip = existing;
    if (ROLE_RANK[snap.role] > ROLE_RANK[existing.room.role]) {
      trip = { ...existing, room: { ...existing.room, role: snap.role, code, rev: 0 } };
      await setTripsRaw(trips.map((t) => (t.id === existing.id ? trip : t)));
    }
  } else {
    trip = {
      id: genId(),
      name: snap.room.name,
      currency: snap.room.currency,
      createdAt: new Date().toISOString(),
      room: { id: snap.roomId, role: snap.role, code, rev: 0 },
    };
    await setTripsRaw([...trips, trip]);
  }
  await applySnapshot(trip.id, snap);
  return getTrip(trip.id);
}

// Owner: replace the code for one role (the old link stops working).
export async function rotateRoomCode(tripId, role) {
  const trip = await getTripRaw(tripId);
  if (!trip || !trip.room || trip.room.role !== 'owner') throw new Error('forbidden');
  const res = await rooms.rotateCode(trip.room, role);
  const codes = { ...(trip.room.codes || {}), [role]: res.code };
  await updateTrip(tripId, {
    room: { ...trip.room, codes, code: role === 'owner' ? res.code : trip.room.code },
  });
  return res.code;
}

// Owner: delete the room from the server. The trip stays on this device as a normal local trip.
export async function stopSharing(tripId) {
  const trip = await getTripRaw(tripId);
  if (!trip || !trip.room) return;
  if (trip.room.role !== 'owner') throw new Error('forbidden');
  try {
    await rooms.deleteRoom(trip.room);
  } catch (e) {
    if (e.message !== 'room_not_found') throw e;
  }
  await updateTrip(tripId, { room: undefined });
}

export async function setMe(tripId, participantId) {
  await updateTrip(tripId, { meId: participantId || undefined });
}

// ----------------------------- Trips ---------------------------------------

export async function getTrips() {
  const [trips, participants, expenses] = await Promise.all([
    getTripsRaw(),
    getParticipantsRaw(),
    getExpensesRaw(),
  ]);
  return trips
    .map((t) => ({
      ...t,
      currency: t.currency || DEFAULT_CURRENCY,
      participantCount: participants.filter((p) => p.tripId === t.id).length,
      totalExpense: expenses
        .filter((e) => e.tripId === t.id)
        .reduce((sum, e) => sum + e.amount, 0),
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getTrip(id) {
  const trip = await getTripRaw(id);
  return trip ? { ...trip, currency: trip.currency || DEFAULT_CURRENCY } : null;
}

export async function createTrip(name, currency = DEFAULT_CURRENCY) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('trip_name_required');

  const trips = await getTripsRaw();
  const trip = {
    id: genId(),
    name: trimmed,
    currency: (currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY,
    createdAt: new Date().toISOString(),
  };
  await setTripsRaw([...trips, trip]);
  return trip;
}

// Deletes the trip from this device only (shared rooms are handled by stopSharing).
export async function deleteTrip(id) {
  const [trips, participants, expenses] = await Promise.all([
    getTripsRaw(),
    getParticipantsRaw(),
    getExpensesRaw(),
  ]);

  const removed = expenses.filter((e) => e.tripId === id).map((e) => e.id);
  await setExpensesRaw(expenses.filter((e) => e.tripId !== id));
  await setParticipantsRaw(participants.filter((p) => p.tripId !== id));
  await setTripsRaw(trips.filter((t) => t.id !== id));
  notifyRemoved(removed);
}

// ------------------------- Participants -------------------------------------

export async function getParticipants(tripId) {
  const [participants, expenses] = await Promise.all([getParticipantsRaw(), getExpensesRaw()]);
  return participants
    .filter((p) => p.tripId === tripId)
    .map((p) => ({
      ...p,
      totalExpense: expenses
        .filter((e) => e.participantId === p.id)
        .reduce((sum, e) => sum + e.amount, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addParticipant(tripId, name, shareRatio = 1) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('name_required');
  if (!tripId) throw new Error('no_trip_selected');

  const trip = await getTripRaw(tripId);
  const participants = await getParticipantsRaw();
  const duplicate = participants.some(
    (p) => p.tripId === tripId && p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) throw new Error('duplicate_participant_name');

  const participant = { id: genId(), tripId, name: trimmed, shareRatio };
  if (trip && trip.room) {
    await viaRoom(trip, (room) => rooms.addParticipant(room, participant));
    return participant;
  }
  await setParticipantsRaw([...participants, participant]);
  return participant;
}

export async function updateParticipantShare(id, shareRatio) {
  if (shareRatio === undefined || shareRatio === null || shareRatio < 0 || shareRatio > 1) {
    throw new Error('invalid_share_ratio');
  }
  const participants = await getParticipantsRaw();
  const current = participants.find((p) => p.id === id);
  if (!current) return;
  const trip = await getTripRaw(current.tripId);
  if (trip && trip.room) {
    await viaRoom(trip, (room) => rooms.updateParticipant(room, { id, name: current.name, shareRatio }));
    return;
  }
  await setParticipantsRaw(participants.map((p) => (p.id === id ? { ...p, shareRatio } : p)));
}

// Who pays whom first. Only the trip owner may set it (a local trip is always yours).
// assignments: { [participantId]: [payeeId, ...] }  — a list in priority order;
// [] / null = automatic. A single id is accepted too.
export async function setPayTo(tripId, assignments) {
  const trip = await getTripRaw(tripId);
  if (!trip) throw new Error('no_trip_selected');
  const participants = await getParticipantsRaw();
  const ids = new Set(participants.filter((p) => p.tripId === tripId).map((p) => p.id));
  const clean = {};
  Object.entries(assignments || {}).forEach(([id, payTo]) => {
    if (!ids.has(id)) throw new Error('invalid_data');
    const list = [];
    payeeIds(payTo).forEach((o) => {
      if (!ids.has(o) || o === id) throw new Error('invalid_data');
      if (!list.includes(o)) list.push(o);
    });
    clean[id] = list;
  });
  if (trip.room) {
    if (trip.room.role !== 'owner') throw new Error('forbidden');
    await viaRoom(trip, (room) => rooms.setPayTo(room, clean));
    return;
  }
  await setParticipantsRaw(
    participants.map((p) =>
      p.tripId === tripId && Object.prototype.hasOwnProperty.call(clean, p.id)
        ? { ...p, payTo: clean[p.id].length ? clean[p.id] : undefined }
        : p
    )
  );
}

export async function deleteParticipant(id) {
  const [participants, expenses] = await Promise.all([getParticipantsRaw(), getExpensesRaw()]);
  const current = participants.find((p) => p.id === id);
  if (!current) return;
  const trip = await getTripRaw(current.tripId);
  if (trip && trip.room) {
    await viaRoom(trip, (room) => rooms.deleteParticipant(room, id));
    return;
  }
  const removed = expenses.filter((e) => e.participantId === id).map((e) => e.id);
  await setExpensesRaw(expenses.filter((e) => e.participantId !== id));
  // anyone who was told to pay the deleted member goes back to the automatic rule
  await setParticipantsRaw(
    participants
      .filter((p) => p.id !== id)
      .map((p) => {
        const left = payeeIds(p.payTo).filter((o) => o !== id);
        return payeeIds(p.payTo).length === left.length ? p : { ...p, payTo: left.length ? left : undefined };
      })
  );
  notifyRemoved(removed);
}

// --------------------------- Expenses ---------------------------------------

export async function getExpenses(tripId) {
  const [expenses, participants] = await Promise.all([getExpensesRaw(), getParticipantsRaw()]);
  const nameById = Object.fromEntries(participants.map((p) => [p.id, p.name]));
  return expenses
    .filter((e) => e.tripId === tripId)
    .map((e) => ({
      ...e,
      category: isCategory(e.category) ? e.category : 'other',
      name: nameById[e.participantId] || '—',
      splitAmong: e.splitAmong || [],
      splitCount: (e.splitAmong || []).length,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function validateExpenseInput(tripId, participantId, amount, splitAmong) {
  if (!participantId || amount === undefined || amount === null || Number.isNaN(Number(amount)) || amount < 0) {
    throw new Error('invalid_data');
  }
  if (!tripId) throw new Error('no_trip_selected');
  if (!Array.isArray(splitAmong) || splitAmong.length === 0) {
    throw new Error('select_at_least_one_participant');
  }
}

// opts: { category, createdAt (ISO) }
export async function addExpense(tripId, participantId, amount, description, splitAmong, opts = {}) {
  validateExpenseInput(tripId, participantId, amount, splitAmong);
  const trip = await getTripRaw(tripId);
  const expense = {
    id: genId(),
    tripId,
    participantId,
    amount: parseFloat(amount),
    description: (description || '').trim(),
    category: isCategory(opts.category) ? opts.category : 'other',
    splitAmong,
    createdAt: opts.createdAt || new Date().toISOString(),
  };
  if (trip && trip.room) {
    await viaRoom(trip, (room) => rooms.addExpense(room, expense));
    return expense;
  }
  const expenses = await getExpensesRaw();
  await setExpensesRaw([...expenses, expense]);
  return expense;
}

// opts: { category, createdAt }
export async function updateExpense(id, participantId, amount, description, splitAmong, opts = {}) {
  const expenses = await getExpensesRaw();
  const current = expenses.find((e) => e.id === id);
  if (!current) throw new Error('invalid_data');
  validateExpenseInput(current.tripId, participantId, amount, splitAmong);
  const updated = {
    ...current,
    participantId,
    amount: parseFloat(amount),
    description: (description || '').trim(),
    category: isCategory(opts.category) ? opts.category : current.category || 'other',
    splitAmong,
    createdAt: opts.createdAt || current.createdAt,
  };
  const trip = await getTripRaw(current.tripId);
  if (trip && trip.room) {
    await viaRoom(trip, (room) => rooms.updateExpense(room, updated));
    return updated;
  }
  await setExpensesRaw(expenses.map((e) => (e.id === id ? updated : e)));
  return updated;
}

export async function deleteExpense(id) {
  const expenses = await getExpensesRaw();
  const current = expenses.find((e) => e.id === id);
  if (!current) return;
  const trip = await getTripRaw(current.tripId);
  if (trip && trip.room) {
    await viaRoom(trip, (room) => rooms.deleteExpense(room, id));
    return;
  }
  await setExpensesRaw(expenses.filter((e) => e.id !== id));
  notifyRemoved([id]);
}

// -------------------------- Settlements -------------------------------------

export async function getSettlements(tripId) {
  const [participants, expenses] = await Promise.all([getParticipants(tripId), getExpensesRaw()]);
  return computeSettlements(participants, expenses.filter((e) => e.tripId === tripId));
}

export async function clearTripData(tripId) {
  if (!tripId) throw new Error('no_trip_selected');
  const [expenses, participants] = await Promise.all([getExpensesRaw(), getParticipantsRaw()]);
  const removed = expenses.filter((e) => e.tripId === tripId).map((e) => e.id);
  await setExpensesRaw(expenses.filter((e) => e.tripId !== tripId));
  await setParticipantsRaw(participants.filter((p) => p.tripId !== tripId));
  notifyRemoved(removed);
}

// ----------------------------- Groups ---------------------------------------
// Groups are just reusable name lists (no share ratios). Importing a group
// into a trip COPIES the names into that trip's participant list — editing
// participants afterward never touches the original group, and vice versa.

export async function getGroups() {
  const [groups, members] = await Promise.all([getGroupsRaw(), getGroupMembersRaw()]);
  return groups
    .map((g) => ({
      ...g,
      memberCount: members.filter((m) => m.groupId === g.id).length,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createGroup(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('group_name_required');

  const groups = await getGroupsRaw();
  const group = { id: genId(), name: trimmed, createdAt: new Date().toISOString() };
  await setGroupsRaw([...groups, group]);
  return group;
}

export async function deleteGroup(id) {
  const [groups, members] = await Promise.all([getGroupsRaw(), getGroupMembersRaw()]);
  await setGroupMembersRaw(members.filter((m) => m.groupId !== id));
  await setGroupsRaw(groups.filter((g) => g.id !== id));
}

export async function getGroupMembers(groupId) {
  const members = await getGroupMembersRaw();
  return members
    .filter((m) => m.groupId === groupId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addGroupMember(groupId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('name_required');
  if (!groupId) throw new Error('no_group_selected');

  const members = await getGroupMembersRaw();
  const duplicate = members.some(
    (m) => m.groupId === groupId && m.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) throw new Error('duplicate_group_member_name');

  const member = { id: genId(), groupId, name: trimmed };
  await setGroupMembersRaw([...members, member]);
  return member;
}

export async function deleteGroupMember(id) {
  const members = await getGroupMembersRaw();
  await setGroupMembersRaw(members.filter((m) => m.id !== id));
}

// Copies a group's member names into a trip as new, independent participants.
// Names that already exist in the trip (case-insensitive) are skipped so
// importing the same group twice — or two overlapping groups — doesn't
// create duplicates. Returns how many were actually added.
export async function importGroupToTrip(tripId, groupId) {
  if (!tripId) throw new Error('no_trip_selected');
  const [members, participants, trip] = await Promise.all([
    getGroupMembers(groupId),
    getParticipantsRaw(),
    getTripRaw(tripId),
  ]);

  const existingNames = new Set(
    participants.filter((p) => p.tripId === tripId).map((p) => p.name.toLowerCase())
  );
  const toAdd = members.filter((m) => !existingNames.has(m.name.toLowerCase()));

  if (trip && trip.room) {
    let added = 0;
    for (const m of toAdd) {
      await addParticipant(tripId, m.name, 1);
      added += 1;
    }
    return added;
  }

  if (toAdd.length > 0) {
    await setParticipantsRaw([
      ...participants,
      ...toAdd.map((m) => ({ id: genId(), tripId, name: m.name, shareRatio: 1 })),
    ]);
  }
  return toAdd.length;
}
