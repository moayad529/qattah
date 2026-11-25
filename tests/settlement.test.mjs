import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSettlements } from '../src/logic/settlement.js';

const P = (id, extra = {}) => ({ id, name: id.toUpperCase(), shareRatio: 1, ...extra });
const E = (participantId, amount, splitAmong) => ({ id: `${participantId}${amount}`, participantId, amount, splitAmong });
const flat = (r) => r.settlements.map((s) => `${s.from}>${s.to}:${s.amount}`).sort();

// a paid 300, b paid 100, c paid 0, d paid 0 ; everyone owes 100  => a +200, b 0, c -100, d -100
const base = (payTo = {}) => [
  P('a'), P('b'), P('c', { payTo: payTo.c }), P('d', { payTo: payTo.d }),
];
const exp = [E('a', 300, ['a', 'b', 'c', 'd']), E('b', 100, ['a', 'b', 'c', 'd'])];
// totals: 400, share 100 each; a paid 300 (+200), b paid 100 (0), c -100, d -100

test('without preferences the result is unchanged and nothing is flagged', () => {
  const r = computeSettlements(base(), exp);
  assert.deepEqual(flat(r), ['C>A:100', 'D>A:100']);
  assert.ok(r.settlements.every((s) => !s.preferred));
});

test('a debtor pays his chosen creditor first', () => {
  // two creditors: a (+150) and b (+50); c and d both owe 100
  const ps = [P('a'), P('b'), P('c', { payTo: 'b' }), P('d')];
  const ex = [E('a', 250, ['a', 'b', 'c', 'd']), E('b', 150, ['a', 'b', 'c', 'd'])]; // 400 => a +150, b +50
  const r = computeSettlements(ps, ex);
  const toB = r.settlements.filter((s) => s.to === 'B');
  assert.equal(toB.reduce((s, x) => s + x.amount, 0), 50);
  assert.equal(toB[0].from, 'C');
  assert.equal(toB[0].preferred, true);
  // total paid equals total owed
  assert.equal(r.settlements.reduce((s, x) => s + x.amount, 0), 200);
});

test('if the chosen payee cannot absorb everything, the rest goes to the other creditors', () => {
  const ps = [P('a'), P('b'), P('c', { payTo: 'b' }), P('d')];
  const ex = [E('a', 250, ['a', 'b', 'c', 'd']), E('b', 150, ['a', 'b', 'c', 'd'])];
  const r = computeSettlements(ps, ex);
  const cPays = r.settlements.filter((s) => s.from === 'C');
  assert.deepEqual(cPays.map((s) => [s.to, s.amount]).sort(), [['A', 50], ['B', 50]]);
  assert.equal(cPays.find((s) => s.to === 'B').preferred, true);
  assert.equal(cPays.find((s) => s.to === 'A').preferred, undefined);
});

test('a preference for someone who is not owed money (or for himself) is ignored', () => {
  const r1 = computeSettlements(base({ c: 'd' }), exp); // d is a debtor
  assert.deepEqual(flat(r1), ['C>A:100', 'D>A:100']);
  const r2 = computeSettlements(base({ c: 'c' }), exp);
  assert.deepEqual(flat(r2), ['C>A:100', 'D>A:100']);
  const r3 = computeSettlements(base({ c: 'zzz' }), exp); // deleted member
  assert.deepEqual(flat(r3), ['C>A:100', 'D>A:100']);
  const r4 = computeSettlements(base({ c: 'b' }), exp); // b is settled (balance 0)
  assert.deepEqual(flat(r4), ['C>A:100', 'D>A:100']);
});

test('everyone choosing one collector: he receives from the first debtors, the rest overflow', () => {
  const ps = [P('a'), P('b'), P('c', { payTo: 'b' }), P('d', { payTo: 'b' })];
  const ex = [E('a', 250, ['a', 'b', 'c', 'd']), E('b', 150, ['a', 'b', 'c', 'd'])]; // a +150, b +50, c -100, d -100
  const r = computeSettlements(ps, ex);
  assert.equal(r.settlements.filter((s) => s.to === 'B').reduce((s, x) => s + x.amount, 0), 50);
  assert.equal(r.settlements.filter((s) => s.to === 'A').reduce((s, x) => s + x.amount, 0), 150);
});

test('balances and totals are not affected by preferences', () => {
  const a = computeSettlements(base(), exp);
  const b = computeSettlements(base({ c: 'a' }), exp);
  assert.deepEqual(a.participants, b.participants);
  assert.equal(a.totalExpense, b.totalExpense);
});

test('every debt is fully settled whatever the preferences', () => {
  const ps = [P('a', { shareRatio: 0.5 }), P('b', { payTo: 'a' }), P('c', { payTo: 'a' }), P('d', { payTo: 'e' }), P('e', { payTo: 'c' })];
  const ex = [E('a', 70, ['a', 'b', 'c']), E('b', 12.34, ['b', 'c', 'd']), E('e', 200, ['a', 'b', 'c', 'd', 'e']), E('c', 5.55, ['c', 'd'])];
  const r = computeSettlements(ps, ex);
  const net = Object.fromEntries(r.participants.map((p) => [p.name, p.balance]));
  r.settlements.forEach((s) => { net[s.from] += s.amount; net[s.to] -= s.amount; });
  Object.values(net).forEach((v) => assert.ok(Math.abs(v) < 0.05, `left over ${v}`));
});

// ---- several preferred payees (priority = order chosen) ------------------------
test('several payees: the first chosen is filled first, then the next, then everyone else', () => {
  // a +150, b +50, e +100 ; c owes 300
  const ps = [P('a'), P('b'), P('c', { payTo: ['b', 'e'] }), P('d'), P('e')];
  const ex = [E('a', 270, ['a', 'b', 'c', 'd', 'e']), E('b', 170, ['a', 'b', 'c', 'd', 'e']), E('e', 220, ['a', 'b', 'c', 'd', 'e'])];
  const r = computeSettlements(ps, ex);
  const c = r.settlements.filter((s) => s.from === 'C');
  assert.equal(c[0].to, 'B'); assert.equal(c[0].preferred, true);
  assert.equal(c[1].to, 'E'); assert.equal(c[1].preferred, true);
  const net = Object.fromEntries(r.participants.map((p) => [p.name, p.balance]));
  r.settlements.forEach((s) => { net[s.from] += s.amount; net[s.to] -= s.amount; });
  Object.values(net).forEach((v) => assert.ok(Math.abs(v) < 0.05));
});

test('payTo still accepts a single id (older data) and ignores unknown / self / repeated ids in a list', () => {
  const ps = [P('a'), P('b'), P('c', { payTo: ['c', 'ghost', 'b', 'b'] }), P('d', { payTo: 'a' })];
  const ex = [E('a', 250, ['a', 'b', 'c', 'd']), E('b', 150, ['a', 'b', 'c', 'd'])];
  const r = computeSettlements(ps, ex);
  assert.equal(r.settlements.filter((s) => s.to === 'B').reduce((t, x) => t + x.amount, 0), 50);
  assert.ok(r.settlements.filter((s) => s.from === 'D').every((s) => s.to === 'A'));
  assert.equal(r.settlements.filter((s) => s.from === 'C' && s.to === 'B').length, 1);
});

// ---- ordering: all payments of one debtor are together ---------------------------
test('settlements are grouped by debtor (biggest debtor first), preferred payees first inside a group', () => {
  // creditors: a +100, b +60 ; debtors: c -90, d -70
  const ps = [P('a'), P('b'), P('c', { payTo: ['b'] }), P('d')];
  const ex = [E('a', 200, ['a', 'b', 'c', 'd']), E('b', 160, ['a', 'b', 'c', 'd'])]; // 360 => 90 each; a +110, b +70, c -90, d -90
  const r = computeSettlements(ps, ex);
  const froms = r.settlements.map((s) => s.from);
  // no debtor appears in two separate runs
  const runs = froms.filter((f, i) => i === 0 || f !== froms[i - 1]);
  assert.equal(new Set(runs).size, runs.length);
  const cs = r.settlements.filter((s) => s.from === 'C');
  assert.equal(cs[0].to, 'B'); assert.equal(cs[0].preferred, true);
});

test('grouping: debtors ordered by total owed, then name; amounts inside a group biggest first', () => {
  const ps = [P('a'), P('b'), P('c'), P('d'), P('e')];
  const ex = [E('a', 400, ['a', 'b', 'c', 'd', 'e']), E('b', 100, ['a', 'b', 'c', 'd', 'e'])]; // 500 => 100 each; a +300, b 0, c/d/e -100
  const r = computeSettlements(ps, ex);
  assert.deepEqual(r.settlements.map((s) => s.from), ['C', 'D', 'E']); // equal totals -> by name
  const big = computeSettlements([P('a'), P('b'), P('c'), P('d')], [E('a', 300, ['a', 'b', 'c', 'd']), E('b', 100, ['a', 'b', 'c', 'd'])]);
  // a +225? b +25 ; c,d owe 100 each: c pays a then b — biggest first
  const forC = big.settlements.filter((s) => s.from === 'C').map((s) => s.amount);
  assert.deepEqual(forC, [...forC].sort((x, y) => y - x));
});
