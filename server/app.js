'use strict';
const crypto = require('crypto');
const express = require('express');

// ---------------------------------------------------------------------------
// Qatta rooms API.
//  * No accounts, emails or user names. A *code* is the identity.
//  * Four roles, enforced here on the server (never trust the client):
//      viewer  – read only
//      entry   – read + add expenses
//      editor  – entry + edit/delete expenses + manage participants
//      owner   – editor + rename/currency, rotate codes, delete the room
//  * Codes look like XXXX-XXXX-XXXX-XXXX-XXXX : 8 chars room id + 12 chars secret.
//    Only SHA-256 hashes of secrets are stored.
// ---------------------------------------------------------------------------

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I L O U)
const ROLE_RANK = { viewer: 0, entry: 1, editor: 2, owner: 3 };
const ROLES = Object.keys(ROLE_RANK);
const LIMITS = { participants: 200, expenses: 3000, name: 80, desc: 200, currency: 12, body: '512kb' };
const INACTIVITY_DAYS = 90;

function randomChars(n) {
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEq = (a, b) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
const formatCode = (roomId, secret) => `${roomId}${secret}`.replace(/(.{4})(?=.)/g, '$1-');

function parseCode(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{20}$/.test(clean)) return null;
  return { roomId: clean.slice(0, 8), secret: clean.slice(8) };
}

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(v);
const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validateExpense(b, { requireId }) {
  if (requireId && !isId(b.id)) throw new HttpError(400, 'invalid_id');
  if (!isId(b.participantId)) throw new HttpError(400, 'invalid_data');
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) throw new HttpError(400, 'invalid_data');
  if (!Array.isArray(b.splitAmong) || b.splitAmong.length === 0 || b.splitAmong.length > LIMITS.participants || !b.splitAmong.every(isId)) {
    throw new HttpError(400, 'select_at_least_one_participant');
  }
  let createdAt = new Date();
  if (b.createdAt) {
    const d = new Date(b.createdAt);
    if (!Number.isNaN(d.getTime())) createdAt = d;
  }
  return {
    id: b.id,
    participantId: b.participantId,
    amount: Math.round(amount * 100) / 100,
    description: cleanStr(b.description, LIMITS.desc),
    category: /^[a-z_]{1,24}$/.test(b.category || '') ? b.category : 'other',
    splitAmong: [...new Set(b.splitAmong)],
    createdAt,
  };
}

function validateParticipant(b, { requireId }) {
  if (requireId && !isId(b.id)) throw new HttpError(400, 'invalid_id');
  const name = cleanStr(b.name, LIMITS.name);
  if (!name) throw new HttpError(400, 'name_required');
  const ratio = b.shareRatio === undefined ? 1 : Number(b.shareRatio);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new HttpError(400, 'invalid_share_ratio');
  return { id: b.id, name, shareRatio: ratio };
}

const mapExpense = (r) => ({
  id: r.id,
  participantId: r.participant_id,
  amount: Number(r.amount),
  description: r.description,
  category: r.category,
  splitAmong: r.split_among,
  createdAt: new Date(r.created_at).toISOString(),
});
// payToIds = priority list; payTo (first one) is kept so 1.5 clients keep working
const mapParticipant = (r) => {
  const ids = Array.isArray(r.pay_to_ids) ? r.pay_to_ids : [];
  return { id: r.id, name: r.name, shareRatio: r.share_ratio, payTo: ids[0] || null, payToIds: ids };
};

// accepts null, one id, or a list of ids; returns a clean, de-duplicated list of other members
function cleanPayees(raw, selfId, validIds) {
  const list = raw === null || raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const id of list) {
    if (!isId(id) || id === selfId || !validIds.has(id)) throw new HttpError(400, 'invalid_data');
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: LIMITS.body }));

  // ---- tiny in-memory rate limiter (per IP) --------------------------------
  const hits = new Map();
  const limiter = (max, windowMs) => (req, res, next) => {
    const key = `${req.ip}|${max}|${windowMs}`;
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now - rec.start > windowMs) {
      hits.set(key, { start: now, n: 1 });
      return next();
    }
    rec.n += 1;
    if (rec.n > max) return next(new HttpError(429, 'rate_limited'));
    return next();
  };
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > 3600_000) hits.delete(k);
  }, 600_000);
  sweeper.unref();
  const generalLimit = process.env.NODE_ENV === 'test' ? 100000 : 300;
  const createLimit = process.env.NODE_ENV === 'test' ? 100000 : 20;
  const authFailLimit = process.env.NODE_ENV === 'test' ? 100000 : 40;
  app.use(limiter(generalLimit, 60_000));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---- auth: code in Authorization header -> role --------------------------
  async function authenticate(req, roomIdFromPath) {
    const header = req.get('authorization') || '';
    const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
    const parsed = parseCode(raw);
    if (!parsed || (roomIdFromPath && parsed.roomId !== roomIdFromPath.toUpperCase())) {
      throw new HttpError(401, 'invalid_code');
    }
    const { rows } = await pool.query('SELECT * FROM rooms WHERE id=$1', [parsed.roomId]);
    const room = rows[0];
    if (!room) throw new HttpError(404, 'room_not_found');
    const h = sha(parsed.secret);
    let role = null;
    for (const r of ['owner', 'editor', 'entry', 'viewer']) {
      if (safeEq(h, room[`${r}_hash`])) { role = r; break; }
    }
    if (!role) throw new HttpError(401, 'invalid_code');
    return { room, role };
  }
  const need = (role, min) => {
    if (ROLE_RANK[role] < ROLE_RANK[min]) throw new HttpError(403, 'forbidden');
  };

  const bumpSql = 'UPDATE rooms SET rev=rev+1, last_activity=now() WHERE id=$1';

  async function inTx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function snapshot(db, roomId, role) {
    // sequential on purpose: inside a transaction all queries share one client
    const room = await db.query('SELECT id,name,currency,rev FROM rooms WHERE id=$1', [roomId]);
    const ps = await db.query('SELECT * FROM room_participants WHERE room_id=$1 ORDER BY name', [roomId]);
    const es = await db.query('SELECT * FROM room_expenses WHERE room_id=$1 ORDER BY created_at DESC', [roomId]);
    const r = room.rows[0];
    return {
      role,
      room: { id: r.id, name: r.name, currency: r.currency, rev: Number(r.rev) },
      participants: ps.rows.map(mapParticipant),
      expenses: es.rows.map(mapExpense),
    };
  }

  app.get('/health', wrap(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  }));

  // ---- create a room from an existing local trip ---------------------------
  app.post('/v1/rooms', limiter(createLimit, 3600_000), wrap(async (req, res) => {
    const b = req.body || {};
    const name = cleanStr(b.name, LIMITS.name);
    if (!name) throw new HttpError(400, 'trip_name_required');
    const currency = cleanStr(b.currency, LIMITS.currency) || 'SAR';
    const participants = Array.isArray(b.participants) ? b.participants : [];
    const expenses = Array.isArray(b.expenses) ? b.expenses : [];
    if (participants.length > LIMITS.participants || expenses.length > LIMITS.expenses) {
      throw new HttpError(413, 'too_large');
    }
    const ps = participants.map((p) => validateParticipant(p, { requireId: true }));
    const pIds = new Set(ps.map((p) => p.id));
    if (pIds.size !== ps.length) throw new HttpError(400, 'invalid_data');
    // optional "pays to" preference — unknown / self ids are silently dropped
    ps.forEach((p, i) => {
      const w = participants[i].payToIds !== undefined ? participants[i].payToIds : participants[i].payTo;
      const list = Array.isArray(w) ? w : w ? [w] : [];
      p.payTo = [...new Set(list.filter((id) => isId(id) && id !== p.id && pIds.has(id)))];
    });
    const es = expenses.map((e) => validateExpense(e, { requireId: true }));
    if (new Set(es.map((e) => e.id)).size !== es.length) throw new HttpError(400, 'invalid_data');
    if (es.some((e) => !pIds.has(e.participantId))) throw new HttpError(400, 'invalid_data');

    const secrets = Object.fromEntries(ROLES.map((r) => [r, randomChars(12)]));
    const roomId = randomChars(8);

    await inTx(async (db) => {
      await db.query(
        `INSERT INTO rooms (id,name,currency,owner_hash,editor_hash,entry_hash,viewer_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [roomId, name, currency, sha(secrets.owner), sha(secrets.editor), sha(secrets.entry), sha(secrets.viewer)]
      );
      for (const p of ps) {
        await db.query('INSERT INTO room_participants (room_id,id,name,share_ratio,pay_to_ids) VALUES ($1,$2,$3,$4,$5)', [roomId, p.id, p.name, p.shareRatio, JSON.stringify(p.payTo)]);
      }
      for (const e of es) {
        await db.query(
          `INSERT INTO room_expenses (room_id,id,participant_id,amount,description,category,split_among,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [roomId, e.id, e.participantId, e.amount, e.description, e.category, JSON.stringify(e.splitAmong), e.createdAt]
        );
      }
    });

    res.status(201).json({
      roomId,
      codes: Object.fromEntries(ROLES.map((r) => [r, formatCode(roomId, secrets[r])])),
    });
  }));

  // ---- resolve a code to a room + role (join step) -------------------------
  app.post('/v1/join', limiter(authFailLimit, 600_000), wrap(async (req, res) => {
    const parsed = parseCode((req.body || {}).code);
    if (!parsed) throw new HttpError(400, 'invalid_code');
    req.headers.authorization = `Bearer ${parsed.roomId}${parsed.secret}`;
    const { room, role } = await authenticate(req, parsed.roomId);
    const snap = await snapshot(pool, room.id, role);
    await pool.query("UPDATE rooms SET last_activity=now() WHERE id=$1 AND last_activity < now() - interval '1 hour'", [room.id]);
    res.json({ roomId: room.id, ...snap });
  }));

  // ---- read ---------------------------------------------------------------
  app.get('/v1/rooms/:id', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    // keep "inactivity" honest: any authenticated read counts, throttled to 1/hour
    await pool.query("UPDATE rooms SET last_activity=now() WHERE id=$1 AND last_activity < now() - interval '1 hour'", [room.id]);
    if (req.query.rev !== undefined && Number(req.query.rev) === Number(room.rev)) {
      return res.json({ unchanged: true, role, rev: Number(room.rev) });
    }
    return res.json(await snapshot(pool, room.id, role));
  }));

  // ---- expenses -----------------------------------------------------------
  app.post('/v1/rooms/:id/expenses', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'entry');
    const e = validateExpense(req.body || {}, { requireId: true });
    const snap = await inTx(async (db) => {
      const cnt = await db.query('SELECT count(*)::int AS n FROM room_expenses WHERE room_id=$1', [room.id]);
      if (cnt.rows[0].n >= LIMITS.expenses) throw new HttpError(413, 'too_large');
      const ps = await db.query('SELECT id FROM room_participants WHERE room_id=$1', [room.id]);
      const ids = new Set(ps.rows.map((r) => r.id));
      if (!ids.has(e.participantId)) throw new HttpError(400, 'invalid_data');
      const split = e.splitAmong.filter((id) => ids.has(id));
      if (split.length === 0) throw new HttpError(400, 'select_at_least_one_participant');
      await db.query(
        `INSERT INTO room_expenses (room_id,id,participant_id,amount,description,category,split_among,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (room_id,id) DO NOTHING`,
        [room.id, e.id, e.participantId, e.amount, e.description, e.category, JSON.stringify(split), e.createdAt]
      );
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.status(201).json(snap);
  }));

  app.put('/v1/rooms/:id/expenses/:eid', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'editor');
    const e = validateExpense({ ...(req.body || {}), id: req.params.eid }, { requireId: true });
    const snap = await inTx(async (db) => {
      const ps = await db.query('SELECT id FROM room_participants WHERE room_id=$1', [room.id]);
      const ids = new Set(ps.rows.map((r) => r.id));
      if (!ids.has(e.participantId)) throw new HttpError(400, 'invalid_data');
      const split = e.splitAmong.filter((id) => ids.has(id));
      if (split.length === 0) throw new HttpError(400, 'select_at_least_one_participant');
      const r = await db.query(
        `UPDATE room_expenses SET participant_id=$3, amount=$4, description=$5, category=$6, split_among=$7
         WHERE room_id=$1 AND id=$2`,
        [room.id, e.id, e.participantId, e.amount, e.description, e.category, JSON.stringify(split)]
      );
      if (r.rowCount === 0) throw new HttpError(404, 'expense_not_found');
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.json(snap);
  }));

  app.delete('/v1/rooms/:id/expenses/:eid', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'editor');
    const snap = await inTx(async (db) => {
      await db.query('DELETE FROM room_expenses WHERE room_id=$1 AND id=$2', [room.id, req.params.eid]);
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.json(snap);
  }));

  // ---- participants -------------------------------------------------------
  app.post('/v1/rooms/:id/participants', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'editor');
    const p = validateParticipant(req.body || {}, { requireId: true });
    const snap = await inTx(async (db) => {
      const cnt = await db.query('SELECT count(*)::int AS n FROM room_participants WHERE room_id=$1', [room.id]);
      if (cnt.rows[0].n >= LIMITS.participants) throw new HttpError(413, 'too_large');
      const dup = await db.query('SELECT 1 FROM room_participants WHERE room_id=$1 AND lower(name)=lower($2) AND id<>$3', [room.id, p.name, p.id]);
      if (dup.rowCount) throw new HttpError(409, 'duplicate_participant_name');
      await db.query(
        'INSERT INTO room_participants (room_id,id,name,share_ratio) VALUES ($1,$2,$3,$4) ON CONFLICT (room_id,id) DO NOTHING',
        [room.id, p.id, p.name, p.shareRatio]
      );
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.status(201).json(snap);
  }));

  app.put('/v1/rooms/:id/participants/:pid', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'editor');
    const p = validateParticipant({ ...(req.body || {}), id: req.params.pid }, { requireId: true });
    const snap = await inTx(async (db) => {
      const dup = await db.query('SELECT 1 FROM room_participants WHERE room_id=$1 AND lower(name)=lower($2) AND id<>$3', [room.id, p.name, p.id]);
      if (dup.rowCount) throw new HttpError(409, 'duplicate_participant_name');
      const r = await db.query('UPDATE room_participants SET name=$3, share_ratio=$4 WHERE room_id=$1 AND id=$2', [room.id, p.id, p.name, p.shareRatio]);
      if (r.rowCount === 0) throw new HttpError(404, 'participant_not_found');
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.json(snap);
  }));

  app.delete('/v1/rooms/:id/participants/:pid', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'editor');
    const snap = await inTx(async (db) => {
      await db.query('DELETE FROM room_expenses WHERE room_id=$1 AND participant_id=$2', [room.id, req.params.pid]);
      await db.query('DELETE FROM room_participants WHERE room_id=$1 AND id=$2', [room.id, req.params.pid]);
      await db.query('UPDATE room_participants SET pay_to_ids = pay_to_ids - $2::text WHERE room_id=$1 AND pay_to_ids ? $2::text', [room.id, req.params.pid]);
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.json(snap);
  }));

  // Owner decides who each member pays first. Body: { assignments: { <memberId>: <payeeId> | [<payeeId>, ...] | null } }
  // A list is a priority order. Everything else about a member stays editable by editors; this is owner-only.
  app.put('/v1/rooms/:id/pay-to', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'owner');
    const a = (req.body || {}).assignments;
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw new HttpError(400, 'invalid_data');
    const entries = Object.entries(a);
    if (entries.length > LIMITS.participants) throw new HttpError(413, 'too_large');
    const snap = await inTx(async (db) => {
      const ps = await db.query('SELECT id FROM room_participants WHERE room_id=$1', [room.id]);
      const ids = new Set(ps.rows.map((r) => r.id));
      const clean = entries.map(([id, raw]) => {
        if (!ids.has(id)) throw new HttpError(404, 'participant_not_found');
        return [id, cleanPayees(raw, id, ids)];
      });
      for (const [id, list] of clean) {
        await db.query('UPDATE room_participants SET pay_to_ids=$3::jsonb WHERE room_id=$1 AND id=$2', [room.id, id, JSON.stringify(list)]);
      }
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.json(snap);
  }));

  // ---- owner-only ---------------------------------------------------------
  app.put('/v1/rooms/:id', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'owner');
    const b = req.body || {};
    const name = b.name === undefined ? room.name : cleanStr(b.name, LIMITS.name);
    const currency = b.currency === undefined ? room.currency : cleanStr(b.currency, LIMITS.currency);
    if (!name) throw new HttpError(400, 'trip_name_required');
    if (!currency) throw new HttpError(400, 'invalid_data');
    const snap = await inTx(async (db) => {
      await db.query('UPDATE rooms SET name=$2, currency=$3 WHERE id=$1', [room.id, name, currency]);
      await db.query(bumpSql, [room.id]);
      return snapshot(db, room.id, role);
    });
    res.json(snap);
  }));

  // Replace the code for one role (revokes the old link). Owner code can be rotated too.
  app.post('/v1/rooms/:id/rotate', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'owner');
    const target = (req.body || {}).role;
    if (!ROLES.includes(target)) throw new HttpError(400, 'invalid_data');
    const secret = randomChars(12);
    await pool.query(`UPDATE rooms SET ${target}_hash=$2, last_activity=now() WHERE id=$1`, [room.id, sha(secret)]);
    res.json({ role: target, code: formatCode(room.id, secret) });
  }));

  app.delete('/v1/rooms/:id', wrap(async (req, res) => {
    const { room, role } = await authenticate(req, req.params.id);
    need(role, 'owner');
    await pool.query('DELETE FROM rooms WHERE id=$1', [room.id]);
    res.json({ deleted: true });
  }));


// ---- invitation landing page -------------------------------------------------
// Invitation links look like  https://<server>/j#XXXX-XXXX-XXXX-XXXX-XXXX
// The code lives in the URL *fragment*, which browsers never send to the server,
// so codes don't end up in server or proxy logs. The page just helps people open the app.
const JOIN_PAGE = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>دعوة إلى رحلة في قطّة · Qatta trip invitation</title>
<style>
 body{margin:0;font-family:-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;background:#FAF4E6;color:#2b2420;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
 .card{background:#fff;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,.1);padding:26px;max-width:420px;width:100%;text-align:center}
 h1{margin:0 0 6px;font-size:22px;background:linear-gradient(135deg,#f7941d,#c1272d);-webkit-background-clip:text;background-clip:text;color:transparent}
 p{line-height:1.7;margin:8px 0;color:#6b5f52}
 .code{font-family:ui-monospace,Menlo,monospace;font-size:17px;font-weight:700;letter-spacing:1px;color:#e8590c;background:#fdeee0;border-radius:10px;padding:12px;margin:14px 0;direction:ltr;word-break:break-all}
 a.btn,button{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:14px;font-size:16px;font-weight:700;margin-top:10px;text-decoration:none;cursor:pointer}
 a.btn{background:#e8590c;color:#fff}
 button{background:#fff;color:#e8590c;border:2px solid #e8590c}
 small{color:#a39a8c;display:block;margin-top:16px}
 .en{direction:ltr;border-top:1px solid #e8ddc8;margin-top:16px;padding-top:12px}
</style></head><body><div class="card">
 <h1>🚗 قطّة · Qatta</h1>
 <p>وصلتك دعوة للانضمام إلى رحلة مشتركة.</p>
 <div class="code" id="code">—</div>
 <a class="btn" id="open" href="#">فتح التطبيق · Open the app</a>
 <button id="copy" type="button">نسخ الكود · Copy code</button>
 <p>إذا ما انفتح التطبيق: ثبّته من <a href="https://sbaqkm.com/our-apps.html">هنا</a> ثم اختر «الانضمام لرحلة بكود» وألصق الكود.</p>
 <p class="en">If the app doesn't open: install Qatta from <a href="https://sbaqkm.com/our-apps.html">here</a>, choose "Join a Trip with a Code" and paste the code.</p>
 <small>الكود لا يُرسل لأي خادم من هذه الصفحة · The code never leaves your browser on this page.</small>
</div>
<script>
 (function(){
  var c=(location.hash||'').replace(/^#/,'').toUpperCase().replace(/[^0-9A-Z-]/g,'');
  var ok=/^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/.test(c);
  document.getElementById('code').textContent=ok?c:'—';
  var a=document.getElementById('open');
  if(ok){a.href='qatta://join/'+c;}else{a.style.display='none';document.getElementById('copy').style.display='none';}
  document.getElementById('copy').onclick=function(){
   if(navigator.clipboard){navigator.clipboard.writeText(c);this.textContent='✓';}
  };
 })();
</script></body></html>`;

  app.get(['/j', '/j/'], (req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(JOIN_PAGE);
  });

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_data' });
    console.error('unhandled error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  });

  return app;
}

// Deletes every room with no authenticated activity for INACTIVITY_DAYS days.
async function cleanupInactive(pool, days = INACTIVITY_DAYS) {
  const r = await pool.query("DELETE FROM rooms WHERE last_activity < now() - ($1 || ' days')::interval", [String(days)]);
  return r.rowCount;
}

module.exports = { createApp, cleanupInactive, parseCode, formatCode, INACTIVITY_DAYS };
