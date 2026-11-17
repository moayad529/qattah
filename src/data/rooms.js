import { ROOMS_API_URL } from '../config.js';

// Thin client for the Qatta rooms server. No accounts: a room *code* is the
// identity and the server decides what that code may do. Errors are thrown as
// Error(key) so screens can show t(`errors.${key}`).

const TIMEOUT_MS = 15000;

async function request(method, path, { code, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ROOMS_API_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(code ? { Authorization: `Bearer ${code}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error('network_error');
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok) {
    const key = json && json.error ? json.error : res.status >= 500 ? 'server_error' : 'invalid_data';
    throw new Error(key);
  }
  return json;
}

const expenseBody = (e) => ({
  id: e.id,
  participantId: e.participantId,
  amount: e.amount,
  description: e.description || '',
  category: e.category || 'other',
  splitAmong: e.splitAmong,
  createdAt: e.createdAt,
});

export const createRoom = ({ name, currency, participants, expenses }) =>
  request('POST', '/v1/rooms', {
    body: {
      name,
      currency,
      participants: participants.map((p) => ({ id: p.id, name: p.name, shareRatio: p.shareRatio })),
      expenses: expenses.map(expenseBody),
    },
  });

export const joinRoom = (code) => request('POST', '/v1/join', { body: { code } });

// room = { id, code }
export const fetchRoom = (room, knownRev) =>
  request('GET', `/v1/rooms/${room.id}${knownRev ? `?rev=${knownRev}` : ''}`, { code: room.code });

export const addExpense = (room, e) =>
  request('POST', `/v1/rooms/${room.id}/expenses`, { code: room.code, body: expenseBody(e) });
export const updateExpense = (room, e) =>
  request('PUT', `/v1/rooms/${room.id}/expenses/${e.id}`, { code: room.code, body: expenseBody(e) });
export const deleteExpense = (room, id) =>
  request('DELETE', `/v1/rooms/${room.id}/expenses/${id}`, { code: room.code });

export const addParticipant = (room, p) =>
  request('POST', `/v1/rooms/${room.id}/participants`, {
    code: room.code,
    body: { id: p.id, name: p.name, shareRatio: p.shareRatio },
  });
export const updateParticipant = (room, p) =>
  request('PUT', `/v1/rooms/${room.id}/participants/${p.id}`, {
    code: room.code,
    body: { name: p.name, shareRatio: p.shareRatio },
  });
export const deleteParticipant = (room, id) =>
  request('DELETE', `/v1/rooms/${room.id}/participants/${id}`, { code: room.code });

export const updateRoomInfo = (room, { name, currency }) =>
  request('PUT', `/v1/rooms/${room.id}`, { code: room.code, body: { name, currency } });
export const rotateCode = (room, role) =>
  request('POST', `/v1/rooms/${room.id}/rotate`, { code: room.code, body: { role } });
export const deleteRoom = (room) => request('DELETE', `/v1/rooms/${room.id}`, { code: room.code });

// Role capabilities — mirrored from the server purely so the UI can hide
// buttons. The server is what actually enforces them.
const RANK = { viewer: 0, entry: 1, editor: 2, owner: 3 };
export const can = (role, min) => (role ? RANK[role] >= RANK[min] : true); // no role = local trip = full access
