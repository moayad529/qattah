// Trip currency is chosen when a trip is created and stored on the trip itself,
// so changing the default later never touches existing trips.
export const CURRENCIES = [
  { code: 'SAR', ar: 'ريال سعودي', en: 'Saudi Riyal', shortAr: 'ريال' },
  { code: 'AED', ar: 'درهم إماراتي', en: 'UAE Dirham', shortAr: 'درهم' },
  { code: 'KWD', ar: 'دينار كويتي', en: 'Kuwaiti Dinar', shortAr: 'دينار' },
  { code: 'BHD', ar: 'دينار بحريني', en: 'Bahraini Dinar', shortAr: 'دينار' },
  { code: 'JOD', ar: 'دينار أردني', en: 'Jordanian Dinar', shortAr: 'دينار' },
  { code: 'QAR', ar: 'ريال قطري', en: 'Qatari Riyal', shortAr: 'ريال' },
  { code: 'OMR', ar: 'ريال عماني', en: 'Omani Rial', shortAr: 'ريال' },
  { code: 'EGP', ar: 'جنيه مصري', en: 'Egyptian Pound', shortAr: 'جنيه' },
  { code: 'USD', ar: 'دولار أمريكي', en: 'US Dollar', shortAr: 'دولار' },
  { code: 'EUR', ar: 'يورو', en: 'Euro', shortAr: 'يورو' },
];

export const DEFAULT_CURRENCY = 'SAR';
export const MAX_CUSTOM_CURRENCY_LENGTH = 8;

const byCode = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export const isKnownCurrency = (code) => Boolean(byCode[code]);

// Short text printed after amounts: "ريال" / "SAR". Custom symbols are shown as typed.
export function currencyLabel(code, language) {
  const c = byCode[code];
  if (!c) return code || (language === 'ar' ? byCode.SAR.shortAr : 'SAR');
  return language === 'ar' ? c.shortAr : c.code;
}

export function currencyName(code, language) {
  const c = byCode[code];
  if (!c) return code;
  return language === 'ar' ? c.ar : c.en;
}

export function sanitizeCustomCurrency(text) {
  return (text || '').trim().slice(0, MAX_CUSTOM_CURRENCY_LENGTH);
}
