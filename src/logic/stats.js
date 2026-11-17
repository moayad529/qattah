import { CATEGORIES } from './categories.js';

const pad = (n) => String(n).padStart(2, '0');
export function localDateKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Wrap digits/dates so they keep their left-to-right order inside Arabic (RTL) text.
export const ltr = (s) => `\u2066${s}\u2069`;

const r2 = (n) => Math.round(n * 100) / 100;

// Trip statistics from a trip's participants + expenses.
export function computeStats(participants, expenses) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const count = expenses.length;
  const pct = (v) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);

  const catTotals = {};
  expenses.forEach((e) => {
    const k = CATEGORIES.some((c) => c.key === e.category) ? e.category : 'other';
    catTotals[k] = catTotals[k] || { total: 0, count: 0 };
    catTotals[k].total += e.amount;
    catTotals[k].count += 1;
  });
  const byCategory = CATEGORIES.filter((c) => catTotals[c.key])
    .map((c) => ({ key: c.key, total: r2(catTotals[c.key].total), count: catTotals[c.key].count, pct: pct(catTotals[c.key].total) }))
    .sort((a, b) => b.total - a.total);

  const payerTotals = {};
  expenses.forEach((e) => {
    payerTotals[e.participantId] = (payerTotals[e.participantId] || 0) + e.amount;
  });
  const byPayer = participants
    .map((p) => ({ id: p.id, name: p.name, total: r2(payerTotals[p.id] || 0), pct: pct(payerTotals[p.id] || 0) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  const dayTotals = {};
  expenses.forEach((e) => {
    const k = localDateKey(e.createdAt);
    if (k) dayTotals[k] = (dayTotals[k] || 0) + e.amount;
  });
  const byDay = Object.keys(dayTotals)
    .sort()
    .map((date) => ({ date, total: r2(dayTotals[date]) }));

  let biggest = null;
  expenses.forEach((e) => {
    if (!biggest || e.amount > biggest.amount) biggest = e;
  });

  return {
    total: r2(total),
    count,
    average: count ? r2(total / count) : 0,
    perPerson: participants.length ? r2(total / participants.length) : 0,
    days: byDay.length,
    perDay: byDay.length ? r2(total / byDay.length) : 0,
    byCategory,
    byPayer,
    byDay,
    biggest,
  };
}
