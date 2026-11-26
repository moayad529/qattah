// Numbers typed by people: accept Arabic-Indic (٠-٩) and Persian (۰-۹) digits and
// Arabic separators, and turn them into plain Western digits ("١٢٫٥" -> "12.5").
import { normalizeDigits } from './bankSms.js';

// Live text clean-up for numeric inputs: digits + separators only; keeps what the
// person is typing otherwise (so half-typed values like "12." still work).
export function toWesternNumberText(text) {
  return normalizeDigits(String(text === null || text === undefined ? '' : text))
    .replace(/،/g, '.') // Arabic comma used as a decimal mark
    .replace(/[ \s]/g, '');
}

// Full parse -> number, or NaN. "1,000.5" -> 1000.5 ; "12,5" -> 12.5 ; "١٢٫٥" -> 12.5
export function parseNumber(text) {
  let s = toWesternNumberText(text);
  if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN;
  return parseFloat(s);
}
