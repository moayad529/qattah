import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSettlements } from '../src/logic/settlement.js';
import { computeStats } from '../src/logic/stats.js';
import { buildPdfHtml } from '../src/logic/pdfHtml.js';
import { translations } from '../src/i18n/translations.js';
import { extractCode, normalizeCode } from '../src/logic/codes.js';
import { inferCategoryFromDescription } from '../src/logic/categories.js';
import { currencyLabel } from '../src/logic/currencies.js';

const P = [
  { id: 'a', name: 'علي', shareRatio: 1 },
  { id: 'b', name: 'سارة', shareRatio: 0.5 },
  { id: 'c', name: 'عمر', shareRatio: 1 },
];

test('settlement: weighted split, payer excluded from owing only if not in split', () => {
  const E = [
    { participantId: 'a', amount: 250, splitAmong: ['a', 'b', 'c'] }, // units 2.5 -> a 100, b 50, c 100
    { participantId: 'b', amount: 60, splitAmong: ['a', 'c'] },        // a 30, c 30
  ];
  const r = computeSettlements(P, E);
  const by = Object.fromEntries(r.participants.map((p) => [p.id, p]));
  assert.equal(r.totalExpense, 310);
  assert.equal(by.a.shouldPay, 130);
  assert.equal(by.b.shouldPay, 50);
  assert.equal(by.c.shouldPay, 130);
  assert.equal(by.a.balance, 120);
  assert.equal(by.b.balance, 10);
  assert.equal(by.c.balance, -130);
  const sum = r.settlements.reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(sum * 100) / 100, 130);
  assert.ok(r.settlements.every((s) => s.from === 'عمر'));
});

test('settlement: legacy expense without splitAmong = everyone; empty trip is safe', () => {
  const r = computeSettlements([{ id: 'a', name: 'A', shareRatio: 1 }, { id: 'b', name: 'B', shareRatio: 1 }], [{ participantId: 'a', amount: 100 }]);
  assert.deepEqual(r.settlements, [{ from: 'B', to: 'A', amount: 50 }]);
  assert.equal(computeSettlements([], []).settlements.length, 0);
});

test('stats: categories, payers, days, biggest', () => {
  const E = [
    { id: '1', participantId: 'a', amount: 100, category: 'gas', createdAt: '2026-11-10T10:00:00' },
    { id: '2', participantId: 'a', amount: 50, category: 'gas', createdAt: '2026-11-10T20:00:00' },
    { id: '3', participantId: 'b', amount: 50, category: 'dinner', createdAt: '2026-11-11T20:00:00' },
    { id: '4', participantId: 'b', amount: 100, category: 'weird-old-value', createdAt: '2026-11-12T09:00:00' },
  ];
  const s = computeStats(P, E);
  assert.equal(s.total, 300);
  assert.equal(s.count, 4);
  assert.deepEqual(s.byCategory.map((c) => [c.key, c.total, c.pct]), [['gas', 150, 50], ['other', 100, 33.3], ['dinner', 50, 16.7]]);
  assert.deepEqual(s.byPayer.map((p) => [p.name, p.total]), [['علي', 150], ['سارة', 150]]);
  assert.equal(s.days, 3);
  assert.equal(s.perDay, 100);
  assert.equal(s.biggest.amount, 100);
  const empty = computeStats(P, []);
  assert.equal(empty.total, 0);
  assert.equal(empty.biggest, null);
});

test('pdf html: Arabic + English render inputs, HTML is escaped', () => {
  for (const lang of ['ar', 'en']) {
    const T = translations[lang];
    const t = (key, ...args) => {
      const v = key.split('.').reduce((a, k) => a?.[k], T);
      return typeof v === 'function' ? v(...args) : v;
    };
    const exps = [{ createdAt: '2026-11-10T10:00:00', category: 'gas', description: '<script>alert(1)</script>', name: 'علي', amount: 100 }];
    const data = computeSettlements(P, [{ participantId: 'a', amount: 100, splitAmong: ['a', 'b', 'c'] }]);
    const html = buildPdfHtml({
      tripName: 'رحلة <العلا> & "أبها"', currencyText: lang === 'ar' ? 'ريال' : 'SAR', isRTL: lang === 'ar',
      createdAt: '2026-11-17T10:00:00', data, expenses: exps, byCategory: computeStats(P, exps).byCategory,
      t, shareLabel: (r) => (r === 1 ? t('participants.shareFull') : r === 0.5 ? t('participants.shareHalf') : `${r * 100}%`),
      categoryLabel: (k) => t(`costs.quick.${k}`),
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes(lang === 'ar' ? 'dir="rtl"' : 'dir="ltr"'));
    assert.ok(html.includes(lang === 'ar' ? 'من يدفع لمن' : 'Who Pays Whom'));
    assert.ok(!/undefined|NaN/.test(html));
  }
});

test('codes: extract from messages/links, tolerate typos', () => {
  const code = 'ABCD-EFGH-JKMN-PQRS-TVWX';
  assert.equal(normalizeCode('abcd efgh jkmn pqrs tvwx'), code);
  assert.equal(extractCode(`دعوة ... الكود: ${code}\nافتح الرابط: https://x.up.railway.app/j/${code}`), code);
  assert.equal(extractCode('https://x.up.railway.app/j/ABCDEFGHJKMNPQRSTVWX'), code);
  assert.equal(extractCode('hello'), null);
  assert.equal(normalizeCode('ABCD-EFGH-JKMN-PQRS-TVW'), null);
});

test('categories + currencies helpers', () => {
  assert.deepEqual(inferCategoryFromDescription('  فطور '), { category: 'breakfast', description: '' });
  assert.deepEqual(inferCategoryFromDescription('Uber to airport'), { category: 'transport', description: 'Uber to airport' });
  assert.equal(currencyLabel('SAR', 'ar'), 'ريال');
  assert.equal(currencyLabel('SAR', 'en'), 'SAR');
  assert.equal(currencyLabel('MAD', 'ar'), 'MAD');
  assert.equal(currencyLabel('AED', 'ar'), 'درهم');
});
