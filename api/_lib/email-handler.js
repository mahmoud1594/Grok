// Email contacts endpoints, served by api/leads.js (the Hobby plan caps a deployment at 12 functions).
//   GET  /api/leads?feed=email            signed-in CRM: EmailContacts rows + email unsubscribe list (?fresh=1)
//   POST /api/leads?feed=email            signed-in CRM (or EMAIL_IMPORT_TOKEN): { columns, rows, dry_run } → cleaned, sorted, written
//   POST /api/email-events                email provider webhook (rewritten to ?feed=email-events), EMAIL_WEBHOOK_SECRET
import crypto from 'node:crypto';
import { requireAuth, setCors, handleOptions } from './auth.js';
import { readContacts, importContacts, applyEvents, normaliseEvents, webhookAuth, EMAIL_COLUMNS, MAX_IMPORT } from './email-contacts.js';
import { backend } from './leads-store.js';

// Imports without a CRM session (ops/agents uploading a file): "Authorization: Bearer <EMAIL_IMPORT_TOKEN>" on POST only,
// and only while that env var is set to 32+ characters. Remove the env var when the import is done.
function importTokenOk(req, env = process.env) {
  const secret = String(env.EMAIL_IMPORT_TOKEN || '').trim();
  const auth = String((req.headers || {}).authorization || '');
  if (secret.length < 32 || req.method !== 'POST' || !auth.startsWith('Bearer ')) return false;
  const h = (v) => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(h(auth.slice(7).trim()), h(secret));
}

const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(body)); };

// Read the stream before touching req.body: the webhook signature is over the exact raw bytes.
async function rawBody(req, limit) {
  if (req.readable && !req.readableEnded) {
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
    if (n) return Buffer.concat(chunks).toString('utf8');
  }
  const b = req.body;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  return b && typeof b === 'object' ? JSON.stringify(b) : '';
}

async function contacts(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (!requireAuth(req) && !importTokenOk(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  if (backend() === 'unconfigured') return send(res, 503, { ok: false, error: 'store_not_configured' });
  const q = new URL(req.url || '/', 'http://x').searchParams;
  if (req.method === 'GET') {
    try {
      const r = await readContacts({ fresh: /^(1|true)$/.test(q.get('fresh') || '') });
      return send(res, 200, { ok: true, backend: backend(), columns: EMAIL_COLUMNS, count: r.rows.length, ...r });
    } catch (e) { console.error('email contacts read failed', e.message); return send(res, 502, { ok: false, error: 'store_unavailable' }); }
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  let body;
  try { body = JSON.parse((await rawBody(req, 4.4e6)) || 'null'); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { ok: false, error: e.code === 413 ? 'too_large' : 'bad_json' }); }
  const rows = body && Array.isArray(body.rows) ? body.rows : null;
  if (!rows || !rows.length) return send(res, 400, { ok: false, error: 'no_rows' });
  if (rows.length > MAX_IMPORT) return send(res, 413, { ok: false, error: 'too_many_rows', max: MAX_IMPORT });
  try {
    const r = await importContacts(Array.isArray(body.columns) ? body.columns : null, rows, { dryRun: body.dry_run === true });
    return send(res, 200, { ok: true, ...r });
  } catch (e) {
    if (e.code === 400) return send(res, 400, { ok: false, error: e.error || 'bad_request' });
    console.error('email contacts import failed', e.message);
    return send(res, 502, { ok: false, error: 'store_unavailable' });
  }
}

async function events(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, error: 'method_not_allowed' }); }
  let raw;
  try { raw = await rawBody(req, 2e6); } catch (e) { return send(res, 413, { ok: false, error: 'too_large' }); }
  const auth = webhookAuth(req, raw);
  if (auth === null) return send(res, 503, { ok: false, error: 'webhook_not_configured' });
  if (!auth) return send(res, 401, { ok: false, error: 'unauthorized' });
  let body;
  try { body = JSON.parse(raw || 'null'); } catch { return send(res, 400, { ok: false, error: 'bad_json' }); }
  const list = normaliseEvents(body);
  if (!list.length) return send(res, 200, { ok: true, received: 0, ignored: true });
  if (backend() === 'unconfigured') return send(res, 503, { ok: false, error: 'store_not_configured' });
  try {
    const r = await applyEvents(list);
    return send(res, 200, { ok: true, received: list.length, ...r });
  } catch (e) { console.error('email events failed', e.message); return send(res, 502, { ok: false, error: 'store_unavailable' }); }
}

export function emailHandler(req, res, feed) {
  return feed === 'email-events' ? events(req, res) : contacts(req, res);
}
