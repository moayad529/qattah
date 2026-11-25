'use strict';
process.env.NODE_ENV = 'test';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { createApp, cleanupInactive, parseCode } = require('../app');

const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/qatta_test';
let pool, server, base;

const call = async (method, url, { code, body } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(code ? { authorization: `Bearer ${code}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

before(async () => {
  pool = new Pool({ connectionString: DB });
  await pool.query(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  await pool.query('TRUNCATE rooms CASCADE');
  server = createApp(pool).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await pool.end();
});

async function makeRoom() {
  const r = await call('POST', '/v1/rooms', {
    body: {
      name: 'رحلة العلا', currency: 'SAR',
      participants: [
        { id: 'p_ali', name: 'علي', shareRatio: 1 },
        { id: 'p_sara', name: 'سارة', shareRatio: 0.5 },
      ],
      expenses: [{ id: 'e_one', participantId: 'p_ali', amount: 100, description: 'بنزين', category: 'fuel', splitAmong: ['p_ali', 'p_sara'] }],
    },
  });
  assert.equal(r.status, 201);
  return r.json;
}

test('create returns four distinct codes of the right format', async () => {
  const { roomId, codes } = await makeRoom();
  assert.equal(roomId.length, 8);
  const all = Object.values(codes);
  assert.equal(new Set(all).size, 4);
  for (const c of all) assert.match(c, /^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/);
  assert.deepEqual(Object.keys(codes).sort(), ['editor', 'entry', 'owner', 'viewer']);
});

test('join resolves each code to its role and returns the snapshot', async () => {
  const { codes } = await makeRoom();
  for (const role of ['owner', 'editor', 'entry', 'viewer']) {
    const r = await call('POST', '/v1/join', { body: { code: codes[role] } });
    assert.equal(r.status, 200);
    assert.equal(r.json.role, role);
    assert.equal(r.json.participants.length, 2);
    assert.equal(r.json.expenses[0].category, 'fuel');
  }
  // typed in lowercase / without dashes / with I-L-O confusion still works
  const messy = codes.viewer.toLowerCase().replace(/-/g, ' ');
  assert.equal((await call('POST', '/v1/join', { body: { code: messy } })).json.role, 'viewer');
});

test('bad / wrong codes are rejected without leaking info', async () => {
  const { roomId, codes } = await makeRoom();
  assert.equal((await call('POST', '/v1/join', { body: { code: 'nonsense' } })).status, 400);
  const wrongSecret = roomId + 'ZZZZZZZZZZZZ';
  assert.equal((await call('POST', '/v1/join', { body: { code: wrongSecret } })).status, 401);
  assert.equal((await call('POST', '/v1/join', { body: { code: 'ZZZZZZZZ' + 'ZZZZZZZZZZZZ' } })).status, 404);
  assert.equal((await call('GET', `/v1/rooms/${roomId}`)).status, 401);
  // code of room A cannot read room B
  const other = await makeRoom();
  assert.equal((await call('GET', `/v1/rooms/${other.roomId}`, { code: codes.owner })).status, 401);
});

test('viewer: read only', async () => {
  const { roomId, codes } = await makeRoom();
  const c = codes.viewer;
  assert.equal((await call('GET', `/v1/rooms/${roomId}`, { code: c })).status, 200);
  const exp = { id: 'e_new1', participantId: 'p_ali', amount: 5, splitAmong: ['p_ali'] };
  assert.equal((await call('POST', `/v1/rooms/${roomId}/expenses`, { code: c, body: exp })).status, 403);
  assert.equal((await call('PUT', `/v1/rooms/${roomId}/expenses/e_one`, { code: c, body: { ...exp, id: 'e_one' } })).status, 403);
  assert.equal((await call('DELETE', `/v1/rooms/${roomId}/expenses/e_one`, { code: c })).status, 403);
  assert.equal((await call('POST', `/v1/rooms/${roomId}/participants`, { code: c, body: { id: 'p_new1', name: 'x' } })).status, 403);
  assert.equal((await call('PUT', `/v1/rooms/${roomId}`, { code: c, body: { name: 'x' } })).status, 403);
  assert.equal((await call('POST', `/v1/rooms/${roomId}/rotate`, { code: c, body: { role: 'viewer' } })).status, 403);
  assert.equal((await call('DELETE', `/v1/rooms/${roomId}`, { code: c })).status, 403);
});

test('entry: can add expenses only', async () => {
  const { roomId, codes } = await makeRoom();
  const c = codes.entry;
  const add = await call('POST', `/v1/rooms/${roomId}/expenses`, {
    code: c, body: { id: 'e_entry1', participantId: 'p_sara', amount: 42.555, description: 'غداء', category: 'food', splitAmong: ['p_ali', 'p_sara'] },
  });
  assert.equal(add.status, 201);
  assert.equal(add.json.expenses.length, 2);
  assert.equal(add.json.expenses.find((e) => e.id === 'e_entry1').amount, 42.56);
  // idempotent retry (same id) does not duplicate
  const again = await call('POST', `/v1/rooms/${roomId}/expenses`, {
    code: c, body: { id: 'e_entry1', participantId: 'p_sara', amount: 42.555, splitAmong: ['p_ali'] },
  });
  assert.equal(again.json.expenses.length, 2);
  const e = { id: 'e_one', participantId: 'p_ali', amount: 1, splitAmong: ['p_ali'] };
  assert.equal((await call('PUT', `/v1/rooms/${roomId}/expenses/e_one`, { code: c, body: e })).status, 403);
  assert.equal((await call('DELETE', `/v1/rooms/${roomId}/expenses/e_one`, { code: c })).status, 403);
  assert.equal((await call('POST', `/v1/rooms/${roomId}/participants`, { code: c, body: { id: 'p_zzz1', name: 'x' } })).status, 403);
  assert.equal((await call('DELETE', `/v1/rooms/${roomId}`, { code: c })).status, 403);
});

test('editor: edit/delete expenses + manage participants, but not owner actions', async () => {
  const { roomId, codes } = await makeRoom();
  const c = codes.editor;
  const upd = await call('PUT', `/v1/rooms/${roomId}/expenses/e_one`, {
    code: c, body: { participantId: 'p_sara', amount: 250, description: 'فندق', category: 'stay', splitAmong: ['p_ali', 'p_sara'] },
  });
  assert.equal(upd.status, 200);
  const e = upd.json.expenses[0];
  assert.deepEqual([e.amount, e.category, e.participantId], [250, 'stay', 'p_sara']);

  const addP = await call('POST', `/v1/rooms/${roomId}/participants`, { code: c, body: { id: 'p_omar', name: 'عمر', shareRatio: 1 } });
  assert.equal(addP.status, 201);
  assert.equal(addP.json.participants.length, 3);
  const dup = await call('POST', `/v1/rooms/${roomId}/participants`, { code: c, body: { id: 'p_omar2', name: 'عمر' } });
  assert.equal(dup.status, 409);
  assert.equal((await call('PUT', `/v1/rooms/${roomId}/participants/p_omar`, { code: c, body: { name: 'عمر', shareRatio: 0.5 } })).status, 200);

  const delP = await call('DELETE', `/v1/rooms/${roomId}/participants/p_sara`, { code: c });
  assert.equal(delP.json.participants.length, 2);
  assert.equal(delP.json.expenses.length, 0); // sara paid the only expense

  assert.equal((await call('PUT', `/v1/rooms/${roomId}`, { code: c, body: { name: 'x' } })).status, 403);
  assert.equal((await call('POST', `/v1/rooms/${roomId}/rotate`, { code: c, body: { role: 'viewer' } })).status, 403);
  assert.equal((await call('DELETE', `/v1/rooms/${roomId}`, { code: c })).status, 403);
});

test('owner: rename, currency, rotate (revokes old code), delete', async () => {
  const { roomId, codes } = await makeRoom();
  const c = codes.owner;
  const ren = await call('PUT', `/v1/rooms/${roomId}`, { code: c, body: { name: 'رحلة جديدة', currency: 'AED' } });
  assert.equal(ren.status, 200);
  assert.deepEqual([ren.json.room.name, ren.json.room.currency], ['رحلة جديدة', 'AED']);

  const rot = await call('POST', `/v1/rooms/${roomId}/rotate`, { code: c, body: { role: 'editor' } });
  assert.equal(rot.status, 200);
  assert.notEqual(rot.json.code, codes.editor);
  assert.equal((await call('GET', `/v1/rooms/${roomId}`, { code: codes.editor })).status, 401); // old revoked
  assert.equal((await call('GET', `/v1/rooms/${roomId}`, { code: rot.json.code })).json.role, 'editor');
  assert.equal((await call('GET', `/v1/rooms/${roomId}`, { code: codes.viewer })).status, 200); // others untouched

  assert.equal((await call('DELETE', `/v1/rooms/${roomId}`, { code: c })).json.deleted, true);
  assert.equal((await call('GET', `/v1/rooms/${roomId}`, { code: c })).status, 404);
  const left = await pool.query('SELECT count(*)::int n FROM room_participants WHERE room_id=$1', [roomId]);
  assert.equal(left.rows[0].n, 0); // cascade
});

test('rev: unchanged polling and bump on writes', async () => {
  const { roomId, codes } = await makeRoom();
  const first = await call('GET', `/v1/rooms/${roomId}`, { code: codes.viewer });
  const rev = first.json.room.rev;
  const same = await call('GET', `/v1/rooms/${roomId}?rev=${rev}`, { code: codes.viewer });
  assert.equal(same.json.unchanged, true);
  await call('POST', `/v1/rooms/${roomId}/expenses`, { code: codes.entry, body: { id: 'e_rev1', participantId: 'p_ali', amount: 1, splitAmong: ['p_ali'] } });
  const diff = await call('GET', `/v1/rooms/${roomId}?rev=${rev}`, { code: codes.viewer });
  assert.equal(diff.json.unchanged, undefined);
  assert.equal(diff.json.expenses.length, 2);
  assert.ok(diff.json.room.rev > rev);
});

test('validation: bad input is rejected', async () => {
  const { roomId, codes } = await makeRoom();
  const c = codes.editor;
  const post = (body) => call('POST', `/v1/rooms/${roomId}/expenses`, { code: c, body });
  assert.equal((await post({ id: 'e_bad1', participantId: 'p_ali', amount: -5, splitAmong: ['p_ali'] })).status, 400);
  assert.equal((await post({ id: 'e_bad2', participantId: 'p_ali', amount: 'abc', splitAmong: ['p_ali'] })).status, 400);
  assert.equal((await post({ id: 'e_bad3', participantId: 'p_ali', amount: 5, splitAmong: [] })).status, 400);
  assert.equal((await post({ id: 'e_bad4', participantId: 'nobody', amount: 5, splitAmong: ['p_ali'] })).status, 400);
  assert.equal((await post({ id: 'e_bad5', participantId: 'p_ali', amount: 5, splitAmong: ['ghost'] })).status, 400);
  assert.equal((await post({ id: '../x', participantId: 'p_ali', amount: 5, splitAmong: ['p_ali'] })).status, 400);
  assert.equal((await call('POST', `/v1/rooms/${roomId}/participants`, { code: c, body: { id: 'p_bad1', name: '  ' } })).status, 400);
  assert.equal((await call('POST', `/v1/rooms/${roomId}/participants`, { code: c, body: { id: 'p_bad2', name: 'x', shareRatio: 3 } })).status, 400);
  assert.equal((await call('POST', '/v1/rooms', { body: { name: '' } })).status, 400);
  assert.equal((await call('POST', '/v1/rooms', { body: { name: 'x', participants: [{ id: 'aaaa', name: 'a' }], expenses: [{ id: 'bbbb', participantId: 'zzzz', amount: 1, splitAmong: ['aaaa'] }] } })).status, 400);
});

test('inactivity cleanup removes only stale rooms; reads refresh activity', async () => {
  const stale = await makeRoom();
  const fresh = await makeRoom();
  const touched = await makeRoom();
  await pool.query("UPDATE rooms SET last_activity = now() - interval '91 days' WHERE id = ANY($1)", [[stale.roomId, touched.roomId]]);
  // an authenticated read of an old room counts as activity
  await call('GET', `/v1/rooms/${touched.roomId}`, { code: touched.codes.viewer });
  const n = await cleanupInactive(pool);
  assert.ok(n >= 1);
  const ids = (await pool.query('SELECT id FROM rooms')).rows.map((r) => r.id);
  assert.ok(!ids.includes(stale.roomId));
  assert.ok(ids.includes(fresh.roomId));
  assert.ok(ids.includes(touched.roomId));
});

test('secrets are stored only as hashes; no personal columns exist', async () => {
  const { roomId, codes } = await makeRoom();
  const row = (await pool.query('SELECT * FROM rooms WHERE id=$1', [roomId])).rows[0];
  const secret = parseCode(codes.owner).secret;
  assert.ok(!JSON.stringify(row).includes(secret));
  const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name IN ('rooms','room_participants','room_expenses')")).rows.map((r) => r.column_name);
  for (const bad of ['email', 'phone', 'user_id', 'username', 'ip', 'ip_address', 'device', 'device_id']) {
    assert.ok(!cols.includes(bad), `unexpected column ${bad}`);
  }
});

test('invitation page is static, served at /j, and never needs the code on the server', async () => {
  const res = await fetch(base + '/j');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.ok(html.includes('qatta://join/'));
  assert.ok(html.includes("location.hash")); // code is read from the fragment in the browser
  assert.ok(!html.includes('fetch('));        // the page itself makes no network calls
});

test('health endpoint', async () => {
  assert.equal((await call('GET', '/health')).json.ok, true);
});

// ---- "pays to" preference (owner only) ---------------------------------------
test('only the owner can set who a member pays; others are rejected', async () => {
  const { roomId, codes } = await makeRoom();
  const body = { assignments: { p_sara: 'p_ali' } };
  for (const role of ['viewer', 'entry', 'editor']) {
    const r = await call('PUT', `/v1/rooms/${roomId}/pay-to`, { code: codes[role], body });
    assert.equal(r.status, 403, role);
  }
  const ok = await call('PUT', `/v1/rooms/${roomId}/pay-to`, { code: codes.owner, body });
  assert.equal(ok.status, 200);
  const sara = ok.json.participants.find((p) => p.id === 'p_sara');
  assert.equal(sara.payTo, 'p_ali');
  assert.equal(ok.json.participants.find((p) => p.id === 'p_ali').payTo, null);
  // everyone with a code sees it
  const v = await call('POST', '/v1/join', { body: { code: codes.viewer } });
  assert.equal(v.json.participants.find((p) => p.id === 'p_sara').payTo, 'p_ali');
});

test('pay-to rejects unknown members, self and bad shapes; null clears', async () => {
  const { roomId, codes } = await makeRoom();
  const put = (assignments) => call('PUT', `/v1/rooms/${roomId}/pay-to`, { code: codes.owner, body: { assignments } });
  assert.equal((await put({ p_sara: 'p_sara' })).status, 400);
  assert.equal((await put({ p_sara: 'p_nobody' })).status, 400);
  assert.equal((await put({ p_nobody: 'p_ali' })).status, 404);
  assert.equal((await call('PUT', `/v1/rooms/${roomId}/pay-to`, { code: codes.owner, body: { assignments: [] } })).status, 400);
  assert.equal((await put({ p_sara: 'p_ali' })).status, 200);
  const cleared = await put({ p_sara: null });
  assert.equal(cleared.json.participants.find((p) => p.id === 'p_sara').payTo, null);
});

test('editors can rename a member without losing the preference; deleting the payee clears it', async () => {
  const { roomId, codes } = await makeRoom();
  await call('PUT', `/v1/rooms/${roomId}/pay-to`, { code: codes.owner, body: { assignments: { p_sara: 'p_ali' } } });
  const ren = await call('PUT', `/v1/rooms/${roomId}/participants/p_sara`, { code: codes.editor, body: { name: 'سارة م', shareRatio: 1 } });
  assert.equal(ren.status, 200);
  assert.equal(ren.json.participants.find((p) => p.id === 'p_sara').payTo, 'p_ali');
  const del = await call('DELETE', `/v1/rooms/${roomId}/participants/p_ali`, { code: codes.editor });
  assert.equal(del.status, 200);
  assert.equal(del.json.participants.find((p) => p.id === 'p_sara').payTo, null);
});

test('create keeps valid preferences and drops invalid ones', async () => {
  const r = await call('POST', '/v1/rooms', {
    body: {
      name: 'x', currency: 'SAR',
      participants: [
        { id: 'p_one', name: 'A', shareRatio: 1, payTo: 'p_two' },
        { id: 'p_two', name: 'B', shareRatio: 1, payTo: 'p_two' },
        { id: 'p_three', name: 'C', shareRatio: 1, payTo: 'p_ghost' },
      ],
      expenses: [],
    },
  });
  assert.equal(r.status, 201);
  const j = await call('POST', '/v1/join', { body: { code: r.json.codes.owner } });
  const by = Object.fromEntries(j.json.participants.map((p) => [p.id, p.payTo]));
  assert.deepEqual(by, { p_one: 'p_two', p_two: null, p_three: null });
});
