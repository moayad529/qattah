import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, toWesternNumberText } from '../src/logic/numbers.js';

test('Arabic-Indic and Persian digits become English digits', () => {
  assert.equal(toWesternNumberText('١٢٣٤٥٦٧٨٩٠'), '1234567890');
  assert.equal(toWesternNumberText('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
  assert.equal(toWesternNumberText('١٢٫٥'), '12.5');      // Arabic decimal separator
  assert.equal(toWesternNumberText('١٢،٥'), '12.5');      // Arabic comma typed as decimal mark
  assert.equal(toWesternNumberText('12 5'), '125');       // stray spaces dropped
  assert.equal(toWesternNumberText('‏١٢‎'), '12'); // bidi marks dropped
  assert.equal(toWesternNumberText('12.'), '12.');        // half-typed value is kept
  assert.equal(toWesternNumberText(undefined), '');
});

test('parseNumber: all the ways people type an amount', () => {
  assert.equal(parseNumber('250'), 250);
  assert.equal(parseNumber('٢٥٠'), 250);
  assert.equal(parseNumber('١٢٫٥٠'), 12.5);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('1,000.50'), 1000.5);
  assert.equal(parseNumber('١٬٠٠٠٫٥'), 1000.5);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('12.'), 12);
  assert.equal(parseNumber(100.25), 100.25);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('12abc')));
  assert.ok(Number.isNaN(parseNumber('1.2.3')));
  assert.ok(Number.isNaN(parseNumber('-5')));
});
