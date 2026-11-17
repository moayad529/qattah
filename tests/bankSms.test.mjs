import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBankMessage, parseBankMessages } from '../src/logic/bankSms.js';

const P = parseBankMessage;

test('Al Rajhi style Arabic POS purchase', () => {
  const r = P('شراء عبر نقاط البيع\nبطاقة: 1234*\nمبلغ: SAR 45.50\nلدى: STARBUCKS RIYADH\nفي: 16-11-26 21:20');
  assert.equal(r.amount, 45.5);
  assert.equal(r.currency, 'SAR');
  assert.equal(r.merchant, 'STARBUCKS RIYADH');
  assert.equal(r.category, 'snacks');
  assert.ok(r.date);
  assert.equal(new Date(r.date).getDate(), 16);
  assert.equal(new Date(r.date).getMonth(), 10);
  assert.equal(r.incoming, false);
});

test('SNB style with balance line must not be taken as amount', () => {
  const r = P('شراء\nمبلغ:SAR 120.00\nبطاقة:*4321\nلدى:ALDREES PETROLEUM\nالرصيد: SAR 5,300.25');
  assert.equal(r.amount, 120);
  assert.equal(r.merchant, 'ALDREES PETROLEUM');
  assert.equal(r.category, 'gas');
});

test('English Riyad-bank style', () => {
  const r = P('Purchase\nCard: 1234\nAmount: SAR 1,250.00\nAt: HILTON GARDEN INN\nDate: 2026-11-15 14:05\nBalance: SAR 9,000');
  assert.equal(r.amount, 1250);
  assert.equal(r.merchant, 'HILTON GARDEN INN');
  assert.equal(r.category, 'hotel');
  assert.equal(new Date(r.date).getHours(), 14);
});

test('Arabic-Indic digits and Arabic wording', () => {
  const r = P('عملية شراء بمبلغ ٧٥٫٢٥ ريال لدى مطعم الشاورما في ١٥/١١/٢٠٢٦ ١٣:٣٠');
  assert.equal(r.amount, 75.25);
  assert.match(r.merchant, /مطعم الشاورما/);
  assert.equal(r.category, 'lunch'); // 13:30 -> lunch
});

test('wallet style: amount before currency', () => {
  const r = P('تم خصم 25.00 ر.س من محفظتك لدى UBER TRIP');
  assert.equal(r.amount, 25);
  assert.equal(r.currency, 'SAR');
  assert.equal(r.merchant, 'UBER TRIP');
  assert.equal(r.category, 'transport');
});

test('single-line English with trailing balance', () => {
  const r = P('Your card ending 9876 was charged SAR 33.10 at PANDA HYPERMARKET on 14/11/2026. Available balance SAR 410.00');
  assert.equal(r.amount, 33.1);
  assert.equal(r.merchant, 'PANDA HYPERMARKET');
  assert.equal(r.category, 'shopping');
});

test('foreign currency is detected, not converted', () => {
  const r = P('Purchase USD 12.99 at NETFLIX');
  assert.equal(r.amount, 12.99);
  assert.equal(r.currency, 'USD');
});

test('refund / deposit flagged as incoming', () => {
  assert.equal(P('استرجاع مبلغ SAR 50.00 من AMAZON').incoming, true);
  assert.equal(P('Refund of SAR 20 from NOON').incoming, true);
});

test('restaurant without a time does not guess a meal', () => {
  const r = P('Purchase SAR 60 at ALBAIK');
  assert.equal(r.category, 'other');
});

test('garbage and empty input return null', () => {
  assert.equal(P(''), null);
  assert.equal(P('مرحبا كيف حالك'), null);
  assert.equal(P('OTP code 123456 do not share'), null);
});

test('multiple messages pasted together', () => {
  const list = parseBankMessages('شراء\nمبلغ: SAR 10\nلدى: A CAFE\n\nشراء\nمبلغ: SAR 20\nلدى: B STORE');
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((x) => x.amount), [10, 20]);
  // one message with a blank line inside stays one message
  const one = parseBankMessages('شراء مبلغ: SAR 99\n\nلدى: SOME PLACE');
  assert.equal(one.length, 1);
  assert.equal(one[0].amount, 99);
});

test('future dates are ignored', () => {
  const r = P('Purchase SAR 5 at X on 01/01/2099');
  assert.equal(r.date, null);
});
