// Run with: node --experimental-test-module-mocks --test tests/
import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---- fake AsyncStorage with one store per simulated "device" ----
const stores = { A: new Map(), B: new Map(), C: new Map(), D: new Map() };
const fake = {
  dev: 'A',
  async getItem(k) { return stores[fake.dev].has(k) ? stores[fake.dev].get(k) : null; },
  async setItem(k, v) { stores[fake.dev].set(k, v); },
  async removeItem(k) { stores[fake.dev].delete(k); },
};
mock.module('@react-native-async-storage/async-storage', { defaultExport: fake });

// ---- real rooms server on a random port ----
process.env.NODE_ENV = 'test';
const { Pool } = require('../server/node_modules/pg');
const { createApp } = require('../server/app.js');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/qatta_test' });
let server;
before(async () => {
  await pool.query(fs.readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  server = createApp(pool).listen(0);
  process.env.EXPO_PUBLIC_ROOMS_API_URL = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

const load = async () => import('../src/data/storage.js');
const as = (dev) => { fake.dev = dev; };
const rejectsWith = async (p, key) => {
  await assert.rejects(p, (e) => { assert.equal(e.message, key); return true; });
};

test('migration: old trips get currency, old expenses get stable categories', async () => {
  as('A');
  const db = await load();
  stores.A.set('@tripkitty/trips', JSON.stringify([{ id: 't1', name: 'قديمة', createdAt: '2026-01-01T00:00:00Z' }]));
  stores.A.set('@tripkitty/participants', JSON.stringify([{ id: 'p1', tripId: 't1', name: 'علي', shareRatio: 1 }]));
  stores.A.set('@tripkitty/expenses', JSON.stringify([
    { id: 'e1', tripId: 't1', participantId: 'p1', amount: 10, description: 'فطور', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'e2', tripId: 't1', participantId: 'p1', amount: 20, description: 'Breakfast', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'e3', tripId: 't1', participantId: 'p1', amount: 30, description: 'بنزين للسيارة', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'e4', tripId: 't1', participantId: 'p1', amount: 40, description: 'شي ثاني', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'e5', tripId: 't1', participantId: 'p1', amount: 50, description: '', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'e6', tripId: 't1', participantId: 'p1', amount: 5, description: 'Coffee/Snacks', createdAt: '2026-01-01T08:00:00Z' },
  ]));
  await db.ensureInitialized();
  const trips = await db.getTrips();
  assert.equal(trips[0].currency, 'SAR');
  const ex = Object.fromEntries((await db.getExpenses('t1')).map((e) => [e.id, e]));
  assert.deepEqual([ex.e1.category, ex.e1.description], ['breakfast', '']);
  assert.deepEqual([ex.e2.category, ex.e2.description], ['breakfast', '']); // English text -> same stable key
  assert.deepEqual([ex.e3.category, ex.e3.description], ['gas', 'بنزين للسيارة']);
  assert.deepEqual([ex.e4.category, ex.e4.description], ['other', 'شي ثاني']);
  assert.equal(ex.e5.category, 'other');
  assert.equal(ex.e6.category, 'snacks');
  // idempotent
  await db.ensureInitialized();
  assert.equal((await db.getExpenses('t1')).length, 6);
});

test('local trip: currency fixed at creation, add / edit / delete expense, settlements', async () => {
  as('B');
  const db = await load();
  const removed = [];
  db.onExpensesRemoved((ids) => removed.push(...ids));
  const trip = await db.createTrip('رحلة أبها', 'AED');
  assert.equal(trip.currency, 'AED');
  const ali = await db.addParticipant(trip.id, 'علي', 1);
  const sara = await db.addParticipant(trip.id, 'سارة', 1);
  const e = await db.addExpense(trip.id, ali.id, 100, 'مطعم', [ali.id, sara.id], { category: 'dinner', createdAt: '2026-11-10T18:00:00.000Z' });
  assert.equal(e.category, 'dinner');
  let s = await db.getSettlements(trip.id);
  assert.deepEqual(s.settlements, [{ from: 'سارة', to: 'علي', amount: 50 }]);

  const upd = await db.updateExpense(e.id, sara.id, 200, 'مطعم البحر', [ali.id, sara.id], { category: 'lunch' });
  assert.equal(upd.amount, 200);
  assert.equal(upd.createdAt, '2026-11-10T18:00:00.000Z'); // date kept when not overridden
  s = await db.getSettlements(trip.id);
  assert.deepEqual(s.settlements, [{ from: 'علي', to: 'سارة', amount: 100 }]);
  const got = (await db.getExpenses(trip.id))[0];
  assert.deepEqual([got.category, got.description, got.participantId], ['lunch', 'مطعم البحر', sara.id]);

  await rejectsWith(db.updateExpense(e.id, sara.id, 5, '', []), 'select_at_least_one_participant');
  await rejectsWith(db.updateExpense('nope', sara.id, 5, '', [ali.id]), 'invalid_data');

  await db.deleteExpense(e.id);
  assert.deepEqual(removed, [e.id]);
  assert.equal((await db.getExpenses(trip.id)).length, 0);

  // a second trip with another currency is independent
  const t2 = await db.createTrip('ثانية');
  assert.equal(t2.currency, 'SAR');
});

test('shared trip: server-enforced roles through the app storage layer', async () => {
  // ---- owner device (A) builds a local trip with data, then shares it ----
  as('A');
  const dbA = await load();
  const trip = await dbA.createTrip('العلا', 'SAR');
  const ali = await dbA.addParticipant(trip.id, 'علي', 1);
  const sara = await dbA.addParticipant(trip.id, 'سارة', 0.5);
  const e1 = await dbA.addExpense(trip.id, ali.id, 90, 'بنزين', [ali.id, sara.id], { category: 'gas' });
  const codes = await dbA.shareTrip(trip.id);
  assert.equal((await dbA.getTrip(trip.id)).room.role, 'owner');
  await rejectsWith(dbA.shareTrip(trip.id), 'already_shared');

  // ---- viewer device (B) ----
  as('B');
  const dbB = await import('../src/data/storage.js?dev=B');
  const tv = await dbB.joinTrip(codes.viewer);
  assert.equal(tv.room.role, 'viewer');
  assert.equal(tv.name, 'العلا');
  assert.equal((await dbB.getParticipants(tv.id)).length, 2);
  assert.equal((await dbB.getExpenses(tv.id)).length, 1);
  const pb = (await dbB.getParticipants(tv.id))[0];
  await rejectsWith(dbB.addExpense(tv.id, pb.id, 5, 'x', [pb.id]), 'forbidden');
  await rejectsWith(dbB.addParticipant(tv.id, 'مين', 1), 'forbidden');

  // ---- entry device (C) ----
  as('C');
  const dbC = await import('../src/data/storage.js?dev=C');
  const te = await dbC.joinTrip(codes.entry);
  const pc = (await dbC.getParticipants(te.id)).find((p) => p.name === 'سارة');
  await dbC.setMe(te.id, pc.id);
  await dbC.addExpense(te.id, pc.id, 30, 'قهوة', [pc.id], { category: 'snacks' });
  assert.equal((await dbC.getExpenses(te.id)).length, 2);
  const eC = (await dbC.getExpenses(te.id))[0];
  await rejectsWith(dbC.updateExpense(eC.id, pc.id, 1, '', [pc.id]), 'forbidden');
  await rejectsWith(dbC.deleteExpense(eC.id), 'forbidden');

  // ---- editor device (D) ----
  as('D');
  const dbD = await import('../src/data/storage.js?dev=D');
  const td = await dbD.joinTrip(codes.editor);
  const exps = await dbD.getExpenses(td.id);
  const coffee = exps.find((x) => x.category === 'snacks');
  await dbD.updateExpense(coffee.id, coffee.participantId, 35, 'قهوة وكيك', coffee.splitAmong, { category: 'snacks' });
  await dbD.addParticipant(td.id, 'عمر', 1);
  await dbD.deleteExpense(exps.find((x) => x.category === 'gas').id);

  // ---- owner sees everyone's changes after sync ----
  as('A');
  assert.equal(await dbA.syncTrip(trip.id), 'ok');
  assert.equal(await dbA.syncTrip(trip.id), 'unchanged');
  const ownerExps = await dbA.getExpenses(trip.id);
  assert.equal(ownerExps.length, 1);
  assert.deepEqual([ownerExps[0].amount, ownerExps[0].description], [35, 'قهوة وكيك']);
  assert.equal((await dbA.getParticipants(trip.id)).length, 3);

  // ---- owner revokes the viewer code: that device falls back to a local copy ----
  const newCode = await dbA.rotateRoomCode(trip.id, 'viewer');
  assert.notEqual(newCode, codes.viewer);
  as('B');
  assert.equal(await dbB.syncTrip(tv.id), 'detached');
  const detached = await dbB.getTrip(tv.id);
  assert.equal(detached.room, undefined);
  assert.ok((await dbB.getExpenses(tv.id)).length >= 1); // data kept locally

  // ---- editor / non-owner cannot stop sharing; owner can ----
  as('D');
  await rejectsWith(dbD.stopSharing(td.id), 'forbidden');
  as('A');
  await dbA.stopSharing(trip.id);
  assert.equal((await dbA.getTrip(trip.id)).room, undefined);
  as('C');
  assert.equal(await dbC.syncTrip(te.id), 'detached'); // room gone
  assert.equal((await dbC.getParticipants(te.id)).length, 2); // keeps the copy it last synced
});

test('pays-to preference: local trip, effect on settlements, cleanup on delete', async () => {
  as('B');
  const db = await load();
  const trip = await db.createTrip('تفضيل الدفع', 'SAR');
  const a = await db.addParticipant(trip.id, 'أحمد', 1);
  const b = await db.addParticipant(trip.id, 'بدر', 1);
  const c = await db.addParticipant(trip.id, 'خالد', 1);
  // أحمد paid 250, بدر paid 150, خالد 0 => split 3 ways of 400: أحمد +116.67, بدر +16.67, خالد -133.33
  await db.addExpense(trip.id, a.id, 250, 'x', [a.id, b.id, c.id], { category: 'other' });
  await db.addExpense(trip.id, b.id, 150, 'y', [a.id, b.id, c.id], { category: 'other' });
  let s = await db.getSettlements(trip.id);
  assert.deepEqual(s.settlements.map((x) => x.to), ['أحمد', 'بدر']); // automatic: biggest creditor first

  await db.setPayTo(trip.id, { [c.id]: b.id });
  s = await db.getSettlements(trip.id);
  const toB = s.settlements.find((x) => x.to === 'بدر');
  assert.equal(toB.preferred, true);                 // preferred payee is paid first ...
  assert.ok(Math.abs(s.settlements.reduce((t, x) => t + x.amount, 0) - 133.33) < 0.02); // ... and the debt is still fully settled
  assert.equal(s.settlements.length, 2);             // overflow went to the other creditor

  await rejectsWith(db.setPayTo(trip.id, { [c.id]: c.id }), 'invalid_data');
  await rejectsWith(db.setPayTo(trip.id, { [c.id]: 'ghost' }), 'invalid_data');
  await rejectsWith(db.setPayTo(trip.id, { ghost: a.id }), 'invalid_data');

  await db.deleteParticipant(b.id);                  // payee removed -> preference cleared
  assert.equal((await db.getParticipants(trip.id)).find((p) => p.id === c.id).payTo, undefined);
  await db.setPayTo(trip.id, { [c.id]: a.id });
  await db.setPayTo(trip.id, { [c.id]: null });
  assert.equal((await db.getParticipants(trip.id)).find((p) => p.id === c.id).payTo, undefined);
});

test('pays-to preference on a shared trip: only the owner can set it, everyone sees it', async () => {
  as('A');
  const dbA = await load();
  const trip = await dbA.createTrip('مشتركة', 'SAR');
  const ali = await dbA.addParticipant(trip.id, 'علي', 1);
  const omar = await dbA.addParticipant(trip.id, 'عمر', 1);
  const codes = await dbA.shareTrip(trip.id);
  await dbA.setPayTo(trip.id, { [omar.id]: ali.id });
  assert.deepEqual((await dbA.getParticipants(trip.id)).find((p) => p.id === omar.id).payTo, [ali.id]);

  as('D');
  const dbD = await import('../src/data/storage.js?dev=D2');
  const te = await dbD.joinTrip(codes.editor);
  const ps = await dbD.getParticipants(te.id);
  const omarD = ps.find((p) => p.name === 'عمر');
  const aliD = ps.find((p) => p.name === 'علي');
  assert.deepEqual(omarD.payTo, [aliD.id]);                        // editor sees the owner's choice
  await rejectsWith(dbD.setPayTo(te.id, { [omarD.id]: null }), 'forbidden');
  await dbD.updateParticipantShare(omarD.id, 0.5);                 // editing the share keeps it
  assert.deepEqual((await dbD.getParticipants(te.id)).find((p) => p.name === 'عمر').payTo, [aliD.id]);

  as('C');
  const dbC = await import('../src/data/storage.js?dev=C2');
  const tv = await dbC.joinTrip(codes.viewer);
  assert.deepEqual((await dbC.getParticipants(tv.id)).find((p) => p.name === 'عمر').payTo, [aliD.id]);
  await rejectsWith(dbC.setPayTo(tv.id, { [omarD.id]: null }), 'forbidden');
});

test('pays-to with several people: order kept, local and shared, payee removal trims the list', async () => {
  as('B');
  const db = await load();
  const trip = await db.createTrip('عدة مستلمين', 'SAR');
  const a = await db.addParticipant(trip.id, 'أ', 1);
  const b = await db.addParticipant(trip.id, 'ب', 1);
  const c = await db.addParticipant(trip.id, 'ج', 1);
  const d = await db.addParticipant(trip.id, 'د', 1);
  await db.setPayTo(trip.id, { [d.id]: [c.id, a.id, c.id] });           // duplicate dropped, order kept
  assert.deepEqual((await db.getParticipants(trip.id)).find((p) => p.id === d.id).payTo, [c.id, a.id]);
  await rejectsWith(db.setPayTo(trip.id, { [d.id]: [d.id] }), 'invalid_data');
  await rejectsWith(db.setPayTo(trip.id, { [d.id]: [a.id, 'ghost'] }), 'invalid_data');
  await db.deleteParticipant(c.id);
  assert.deepEqual((await db.getParticipants(trip.id)).find((p) => p.id === d.id).payTo, [a.id]);
  // legacy single-id data written by 1.5 still works
  const raw = JSON.parse(stores.B.get('@tripkitty/participants'));
  stores.B.set('@tripkitty/participants', JSON.stringify(raw.map((p) => (p.id === d.id ? { ...p, payTo: b.id } : p))));
  await db.addExpense(trip.id, a.id, 100, 'x', [a.id, b.id, d.id], { category: 'other' });
  const s = await db.getSettlements(trip.id);
  assert.ok(s.settlements.find((x) => x.from === 'د' && x.to === 'أ')); // (b settles himself; d owes a)

  // shared: the list travels through the server
  as('A');
  const dbA = await load();
  const t2 = await dbA.createTrip('مشتركة ٢', 'SAR');
  const p1 = await dbA.addParticipant(t2.id, 'واحد', 1);
  const p2 = await dbA.addParticipant(t2.id, 'اثنين', 1);
  const p3 = await dbA.addParticipant(t2.id, 'ثلاثة', 1);
  const codes = await dbA.shareTrip(t2.id);
  await dbA.setPayTo(t2.id, { [p1.id]: [p3.id, p2.id] });
  assert.deepEqual((await dbA.getParticipants(t2.id)).find((p) => p.id === p1.id).payTo, [p3.id, p2.id]);
  as('C');
  const dbC = await import('../src/data/storage.js?dev=C3');
  const tv = await dbC.joinTrip(codes.viewer);
  assert.deepEqual((await dbC.getParticipants(tv.id)).find((p) => p.name === 'واحد').payTo, [p3.id, p2.id]);
});

test('offline: server unreachable gives network_error on writes and "offline" on sync', async () => {
  as('A');
  const dbA = await load();
  const trip = await dbA.createTrip('اوفلاين', 'SAR');
  const p = await dbA.addParticipant(trip.id, 'علي', 1);
  await dbA.shareTrip(trip.id);
  const realUrl = process.env.EXPO_PUBLIC_ROOMS_API_URL;
  // point the (already loaded) client at a dead port by closing the server temporarily
  await new Promise((r) => server.close(r));
  await rejectsWith(dbA.addExpense(trip.id, p.id, 5, '', [p.id]), 'network_error');
  assert.equal(await dbA.syncTrip(trip.id), 'offline');
  assert.equal((await dbA.getTrip(trip.id)).room.role, 'owner'); // still linked
  server = createApp(pool).listen(Number(new URL(realUrl).port)); // restore for later tests
});
