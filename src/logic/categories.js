// A category is a stable, language-independent key stored on every expense.
// Labels are translated at display time (costs.quick.<key> in translations.js).
export const CATEGORIES = [
  { key: 'breakfast', icon: '🍳', color: '#f59f00' },
  { key: 'lunch', icon: '🍔', color: '#e8590c' },
  { key: 'dinner', icon: '🍽️', color: '#c92a2a' },
  { key: 'snacks', icon: '☕', color: '#a0714f' },
  { key: 'gas', icon: '⛽', color: '#1c7ed6' },
  { key: 'hotel', icon: '🏨', color: '#7048e8' },
  { key: 'transport', icon: '🚗', color: '#0ca678' },
  { key: 'shopping', icon: '🛍️', color: '#d6336c' },
  { key: 'fun', icon: '🎉', color: '#f76707' },
  { key: 'other', icon: '🧾', color: '#868e96' },
];

const byKey = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const categoryMeta = (key) => byKey[key] || byKey.other;
export const isCategory = (key) => Boolean(byKey[key]);

// Old versions stored the *translated* quick-label text as the description.
const EXACT = {
  breakfast: ['فطور', 'breakfast'],
  lunch: ['غداء', 'lunch'],
  dinner: ['عشاء', 'dinner'],
  gas: ['بنزين', 'gas'],
  hotel: ['فندق', 'hotel'],
  transport: ['مواصلات', 'transport'],
  shopping: ['تسوق', 'shopping'],
  fun: ['ترفيه', 'fun'],
  snacks: ['قهوة/سناكس', 'coffee/snacks'],
};

const KEYWORDS = [
  ['breakfast', ['فطور', 'افطار', 'إفطار', 'breakfast']],
  ['lunch', ['غداء', 'lunch']],
  ['dinner', ['عشاء', 'dinner']],
  ['snacks', ['قهوة', 'سناك', 'كافيه', 'coffee', 'snack', 'cafe', 'عصير', 'حلا']],
  ['gas', ['بنزين', 'وقود', 'ديزل', 'gas', 'fuel', 'petrol']],
  ['hotel', ['فندق', 'شاليه', 'استراحة', 'نزل', 'hotel', 'resort', 'airbnb', 'chalet']],
  ['transport', ['مواصلات', 'تاكسي', 'اوبر', 'أوبر', 'كريم', 'تذكرة', 'طيران', 'transport', 'taxi', 'uber', 'flight', 'ticket', 'parking', 'موقف']],
  ['shopping', ['تسوق', 'سوق', 'بقالة', 'هدايا', 'shopping', 'grocery', 'gift', 'market']],
  ['fun', ['ترفيه', 'ملاهي', 'سينما', 'العاب', 'ألعاب', 'fun', 'cinema', 'park', 'game']],
];

// Returns { category, description } for an old free-text description.
// Exact quick-label text becomes category-only (so it re-translates when the
// language is switched); anything else keeps its text and gets a best-guess category.
export function inferCategoryFromDescription(description) {
  const raw = (description || '').trim();
  if (!raw) return { category: 'other', description: '' };
  const norm = raw.toLowerCase();
  for (const [key, labels] of Object.entries(EXACT)) {
    if (labels.includes(norm)) return { category: key, description: '' };
  }
  for (const [key, words] of KEYWORDS) {
    if (words.some((w) => norm.includes(w))) return { category: key, description: raw };
  }
  return { category: 'other', description: raw };
}
