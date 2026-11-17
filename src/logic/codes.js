// Room codes look like XXXX-XXXX-XXXX-XXXX-XXXX (Crockford base32).
export function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{20}$/.test(clean)) return null;
  return clean.replace(/(.{4})(?=.)/g, '$1-');
}

// Finds a code inside pasted text (a share message, a link, or the bare code).
export function extractCode(text) {
  if (typeof text !== 'string') return null;
  const direct = normalizeCode(text);
  if (direct) return direct;
  const up = text.toUpperCase();
  const dashed = up.match(/(?:[0-9A-Z]{4}-){4}[0-9A-Z]{4}/);
  if (dashed && normalizeCode(dashed[0])) return normalizeCode(dashed[0]);
  const plain = up.match(/(?<![0-9A-Z])[0-9A-Z]{20}(?![0-9A-Z])/);
  return plain ? normalizeCode(plain[0]) : null;
}

export function roomIdFromCode(code) {
  const n = normalizeCode(code);
  return n ? n.replace(/-/g, '').slice(0, 8) : null;
}
