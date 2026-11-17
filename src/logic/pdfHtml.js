import { categoryMeta } from './categories.js';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateStr = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Builds a self-contained HTML document for expo-print. Rendering through the
// system WebView means Arabic shaping and RTL layout are handled by the OS.
//
// input: {
//   tripName, currencyText, isRTL, createdAt (ISO),
//   data (computeSettlements result), expenses [{createdAt, category, description, name, amount}],
//   byCategory [{key,total,pct}], t (translate fn), shareLabel(ratio) -> text, categoryLabel(key) -> text
// }
export function buildPdfHtml({ tripName, currencyText, isRTL, createdAt, data, expenses, byCategory, t, shareLabel, categoryLabel }) {
  const dir = isRTL ? 'rtl' : 'ltr';
  const align = isRTL ? 'right' : 'left';
  const c = esc(currencyText);

  const participantsRows = data.participants
    .map(
      (p) => `<tr>
        <td>${esc(p.name)}</td><td>${esc(shareLabel(p.shareRatio))}</td>
        <td class="num">${fmt(p.totalExpense)}</td><td class="num">${fmt(p.shouldPay)}</td>
        <td class="num ${p.balance >= 0 ? 'pos' : 'neg'}">${p.balance >= 0 ? '+' : ''}${fmt(p.balance)}</td></tr>`
    )
    .join('');

  const settlementRows = data.settlements.length
    ? data.settlements
        .map((s) => `<div class="settle"><b class="neg">${esc(s.from)}</b> → <b class="pos">${esc(s.to)}</b><span class="amt">${fmt(s.amount)} ${c}</span></div>`)
        .join('')
    : `<div class="muted">${esc(t('results.settled'))}</div>`;

  const catRows = byCategory
    .map((k) => {
      const m = categoryMeta(k.key);
      return `<div class="bar-row"><div class="bar-label">${m.icon} ${esc(categoryLabel(k.key))}</div>
        <div class="bar"><div class="fill" style="width:${Math.max(2, k.pct)}%;background:${m.color}"></div></div>
        <div class="bar-val">${fmt(k.total)} <span class="muted">(${k.pct}%)</span></div></div>`;
    })
    .join('');

  const expenseRows = expenses
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((e) => {
      const m = categoryMeta(e.category);
      return `<tr><td dir="ltr" style="text-align:${align}">${esc(dateStr(e.createdAt))}</td><td>${m.icon} ${esc(categoryLabel(e.category))}</td>
        <td>${esc(e.name)}</td><td>${esc(e.description)}</td><td class="num">${fmt(e.amount)}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', 'Noto Sans Arabic', 'Geeza Pro', Arial, sans-serif; color: #2b2420; direction: ${dir}; text-align: ${align}; font-size: 12px; line-height: 1.5; }
  .head { background: linear-gradient(135deg, #f7941d, #c1272d); color: #fff; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head h1 { margin: 0 0 4px; font-size: 22px; }
  .head .sub { opacity: .92; font-size: 12px; }
  h2 { color: #e8590c; font-size: 15px; border-bottom: 2px solid #e8590c; padding-bottom: 4px; margin: 20px 0 10px; }
  .stats { display: flex; gap: 10px; }
  .stat { flex: 1; background: #fdeee0; border-radius: 10px; padding: 10px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .stat .v { font-size: 18px; font-weight: 800; color: #c1272d; }
  .stat .l { font-size: 11px; color: #6b5f52; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #fbf6ea; font-size: 11px; color: #6b5f52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e8ddc8; text-align: ${align}; vertical-align: top; }
  td.num, th.num { text-align: ${isRTL ? 'left' : 'right'}; white-space: nowrap; direction: ltr; unicode-bidi: plaintext; }
  .pos { color: #2f9e44; } .neg { color: #e03131; } .muted { color: #a39a8c; }
  .settle { background: #fdf0e4; border-radius: 8px; padding: 9px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .settle .amt { font-weight: 800; color: #e8590c; direction: ltr; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .bar-label { width: 28%; font-size: 11.5px; }
  .bar { flex: 1; height: 10px; background: #f1e8d6; border-radius: 6px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fill { height: 100%; border-radius: 6px; }
  .bar-val { width: 26%; font-size: 11.5px; text-align: ${isRTL ? 'left' : 'right'}; direction: ltr; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 22px; text-align: center; color: #a39a8c; font-size: 10.5px; }
</style></head><body>
  <div class="head">
    <h1>${esc(tripName)}</h1>
    <div class="sub">${esc(t('pdf.title'))} · ${esc(t('pdf.generated'))}: ${esc(dateStr(createdAt))} · ${esc(t('pdf.currency'))}: ${c}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="v">${fmt(data.totalExpense)}</div><div class="l">${esc(t('results.statTotal'))} (${c})</div></div>
    <div class="stat"><div class="v">${fmt(data.averagePerShareUnit)}</div><div class="l">${esc(t('results.statPerUnit'))} (${c})</div></div>
    <div class="stat"><div class="v">${data.participants.length}</div><div class="l">${esc(t('results.statParticipants'))}</div></div>
  </div>

  <h2>${esc(t('pdf.settlements'))}</h2>
  ${settlementRows}

  <h2>${esc(t('pdf.participants'))}</h2>
  <table><thead><tr>
    <th>${esc(t('pdf.colName'))}</th><th>${esc(t('pdf.colShare'))}</th>
    <th class="num">${esc(t('pdf.colPaid'))}</th><th class="num">${esc(t('pdf.colOwes'))}</th><th class="num">${esc(t('pdf.colBalance'))}</th>
  </tr></thead><tbody>${participantsRows}</tbody></table>

  ${byCategory.length ? `<h2>${esc(t('pdf.byCategory'))}</h2>${catRows}` : ''}

  ${expenses.length ? `<h2>${esc(t('pdf.expenses'))}</h2>
  <table><thead><tr>
    <th>${esc(t('pdf.colDate'))}</th><th>${esc(t('pdf.colType'))}</th><th>${esc(t('pdf.colPayer'))}</th><th>${esc(t('pdf.colNote'))}</th><th class="num">${esc(t('pdf.colAmount'))}</th>
  </tr></thead><tbody>${expenseRows}</tbody></table>` : ''}

  <div class="foot">${esc(t('pdf.footer'))}</div>
</body></html>`;
}
