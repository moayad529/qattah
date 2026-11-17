// On-device parser for bank / wallet purchase notifications (Arabic & English).
// Nothing here touches the network and nothing is read automatically: the user
// pastes the text, we extract amount + merchant (+date/time), and the app shows
// the result in the normal "add cost" form for confirmation.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeDigits(text) {
  return (text || '')
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '');
}

const CUR_WORDS = 'SAR|SR|AED|KWD|BHD|JOD|QAR|OMR|EGP|USD|EUR|ر\\.?\\s?س\\.?|ريال|درهم|دينار|جنيه|دولار|\\$';
const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';
const BALANCE_RE = /(الرصيد|رصيد|رصيدك|balance|\bbal\b|available|avail\b|limit|الحد)/i;
const INCOMING_RE = /(إيداع|ايداع|حوالة\s*واردة|حوالة\s*مستلمة|استلام|استرجاع|مرتجع|إرجاع|ارجاع|refund|reversal|credited|credit\s+of|deposit|received|salary|راتب)/i;

const CURRENCY_MAP = [
  [/SAR|\bSR\b|ر\.?\s?س|ريال\s*سعودي|ريال/i, 'SAR'],
  [/AED|درهم/i, 'AED'],
  [/KWD|دينار\s*كويتي/i, 'KWD'],
  [/BHD|دينار\s*بحريني/i, 'BHD'],
  [/JOD|دينار\s*اردني|دينار\s*أردني/i, 'JOD'],
  [/QAR/i, 'QAR'],
  [/OMR/i, 'OMR'],
  [/EGP|جنيه/i, 'EGP'],
  [/USD|\$|دولار/i, 'USD'],
  [/EUR|€|يورو/i, 'EUR'],
];

function toAmount(str) {
  const n = parseFloat(String(str).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
}

function currencyOf(token) {
  if (!token) return null;
  for (const [re, code] of CURRENCY_MAP) if (re.test(token)) return code;
  return null;
}

// Drop everything from a "balance" keyword to the end of its line so the
// account balance is never mistaken for the purchase amount.
function stripBalance(text) {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(BALANCE_RE);
      return m ? line.slice(0, m.index) : line;
    })
    .join('\n');
}

function findAmount(text) {
  const t = stripBalance(text);
  const cur = `(?:(${CUR_WORDS})\\s*)?`;
  const tries = [
    // labelled: "مبلغ: SAR 45.00", "Amount: 45", "بمبلغ 45 ريال"
    new RegExp(`(?:المبلغ|مبلغ|بمبلغ|قيمة\\s*(?:الشراء|العملية|المشتريات)|amount|amt|total|value)\\s*[:：\\-]?\\s*${cur}${NUM}\\s*(${CUR_WORDS})?`, 'i'),
    // verb + currency: "Purchase of SAR 45", "تم خصم 45 ر.س", "spent SAR 12"
    new RegExp(`(?:purchase|payment|paid|spent|debited|debit|charged|withdrawal|pos|شراء|خصم|سحب|دفع|مدفوع)[^\\d\\n]{0,25}?${cur}${NUM}\\s*(${CUR_WORDS})?`, 'i'),
    // currency right before / after a number anywhere
    new RegExp(`(${CUR_WORDS})\\s*${NUM}`, 'i'),
    new RegExp(`${NUM}\\s*(${CUR_WORDS})`, 'i'),
  ];
  for (let i = 0; i < tries.length; i++) {
    const m = t.match(tries[i]);
    if (!m) continue;
    let amountStr;
    let curToken;
    if (i <= 1) {
      curToken = m[1] || m[3];
      amountStr = m[2];
    } else if (i === 2) {
      curToken = m[1];
      amountStr = m[2];
    } else {
      amountStr = m[1];
      curToken = m[2];
    }
    const amount = toAmount(amountStr);
    if (amount) return { amount, currency: currencyOf(curToken) };
  }
  return null;
}

const MERCHANT_STOP =
  /\s+(?:on|using|via|card|bal(?:ance)?|date|time|ref|avail)(?=[\s:.,]|$)|\s+(?:في\s*\d|بتاريخ|الرصيد|رصيد|بطاقة|من\s*بطاقة)|\s+\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\s+\d{4}-\d{1,2}-\d{1,2}|\s+\d{1,2}:\d{2}/i;

function cleanMerchant(raw) {
  let s = raw.split('\n')[0];
  const stop = s.search(MERCHANT_STOP);
  if (stop > 0) s = s.slice(0, stop);
  s = s.replace(/^[\s:：\-–*]+|[\s.,;:：\-–*]+$/g, '').replace(/\s{2,}/g, ' ');
  if (!s || /^\d[\d:/.\-\s]*$/.test(s) || s.length < 2) return '';
  return s.slice(0, 60);
}

function findMerchant(text) {
  const patterns = [
    /(?:لدى|عند|التاجر|المتجر|اسم\s*التاجر|من\s*متجر|في\s*متجر|مكان\s*العملية|الجهة)\s*[:：]?\s*([^\n]+)/i,
    /(?:merchant|mrchnt|store|shop|at)\s*[:：]\s*([^\n]+)/i,
    /\b(?:at|@)\s+([A-Za-z0-9][^\n]*)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const merchant = cleanMerchant(m[1]);
      if (merchant) return merchant;
    }
  }
  return '';
}

function findDateTime(text) {
  let year;
  let month;
  let day;
  let m = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    [year, month, day] = [+m[1], +m[2], +m[3]];
  } else {
    m = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
    if (m) {
      day = +m[1];
      month = +m[2];
      year = +m[3];
      if (year < 100) year += 2000;
    }
  }
  const tm = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?::\d{2})?(?!\d)/);
  let hh = null;
  let mm = null;
  if (tm && +tm[1] < 24 && +tm[2] < 60) {
    hh = +tm[1];
    mm = +tm[2];
  }
  let date = null;
  if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const d = new Date(year, month - 1, day, hh ?? 12, mm ?? 0);
    const valid = d.getMonth() === month - 1 && d.getDate() === day;
    const notFuture = d.getTime() < Date.now() + 36 * 3600 * 1000;
    if (valid && notFuture) date = d.toISOString();
  }
  return { date, hour: hh };
}

const CATEGORY_HINTS = [
  ['gas', /(بنزين|وقود|محطة|ساسكو|sasco|aldrees|الدريس|petrol|fuel|adnoc|enoc|shell|total\s*energies|naft|نفط|wafi|وافي)/i],
  ['hotel', /(فندق|hotel|resort|booking|airbnb|agoda|شاليه|chalet|marriott|hilton|rotana|hyatt)/i],
  ['transport', /(uber|careem|اوبر|أوبر|كريم|taxi|تاكسي|saudia|السعودية|flynas|flyadeal|طيران|airline|airways|\bair\b|parking|موقف|bolt|jeeny|train|قطار|sar\s*train)/i],
  ['fun', /(cinema|سينما|vox|muvi|ترفيه|entertainment|boulevard|بوليفارد|park|ملاهي|games?|ألعاب|العاب|zone|tickets?\s*to)/i],
  ['snacks', /(coffee|قهوة|cafe|كافيه|كافي\b|starbucks|dunkin|tim\s*hortons|barn'?s|bakery|مخبز|حلويات|bonbon|عصير|juice|ice\s*cream|آيس|ايس)/i],
  ['shopping', /(mall|مول|supermarket|سوبر\s*ماركت|بقالة|hyper|panda|بنده|danube|الدانوب|tamimi|التميمي|carrefour|lulu|لولو|noon|نون|amazon|امازون|أمازون|ikea|ايكيا|jarir|جرير|extra|اكسترا|هايبر|shopping|store)/i],
  ['dinner', /(restaurant|مطعم|kitchen|مطبخ|grill|مشويات|burger|برجر|pizza|بيتزا|shawarma|شاورما|albaik|البيك|kudu|كودو|mcdonald|ماكدونالدز|kfc|herfy|هرفي|hungerstation|هنقرستيشن|jahez|جاهز|toyou|مرسول|mrsool|dine|diner|food|طعام|مأكولات)/i],
];

function guessCategory(merchant, text, hour) {
  const hay = `${merchant} ${text}`;
  for (const [key, re] of CATEGORY_HINTS) {
    if (!re.test(hay)) continue;
    if (key === 'dinner') {
      if (hour === null || hour === undefined) return 'other';
      if (hour < 11) return 'breakfast';
      if (hour < 17) return 'lunch';
      return 'dinner';
    }
    return key;
  }
  return null;
}

export function parseBankMessage(rawText) {
  const text = normalizeDigits(rawText || '').trim();
  if (!text) return null;
  const found = findAmount(text);
  if (!found) return null;
  const merchant = findMerchant(text);
  const { date, hour } = findDateTime(text);
  return {
    amount: found.amount,
    currency: found.currency,
    merchant,
    date,
    category: guessCategory(merchant, text, hour),
    incoming: INCOMING_RE.test(text),
  };
}

// A paste may contain several notifications separated by blank lines.
// Returns every block that yields an amount; falls back to the whole text as one message.
export function parseBankMessages(rawText) {
  const text = normalizeDigits(rawText || '').trim();
  if (!text) return [];
  const blocks = text.split(/\n\s*\n+|\n-{3,}\n/).map((b) => b.trim()).filter(Boolean);
  const parsed = blocks.map((b) => parseBankMessage(b)).filter(Boolean);
  if (parsed.length >= 2) return parsed;
  const whole = parseBankMessage(text);
  return whole ? [whole] : [];
}
