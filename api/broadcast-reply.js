// POST /api/broadcast-reply — intake for replies to Mahmoud's broadcasts and posts (WhatsApp via Eazybe/WhatsApp Web,
// Facebook and Instagram via Meta Business Suite). Agents scrape replies and POST them here; rows land in the
// MahmoudDXB Leads sheet (tab Leads) and show in the CRM Leads tab. STOP replies go to the StopList tab instead.
// Auth: Authorization: Bearer <BROADCAST_INGEST_TOKEN> (server-to-server; no cookies, no CORS).
// Body: one reply object, an array of them, or { replies: [...], dry_run: true }. Contract: BROADCAST-INTAKE.md.
// Idempotent: (normalised phone, or channel+handle) + campaign is added once; repeats return "duplicate".
import { tokenOk, ingestReplies, MAX_BATCH } from './_lib/broadcast-intake.js';
import { backend } from './_lib/leads-store.js';

const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 2e6) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, error: 'method_not_allowed' }); }
  const auth = tokenOk(req);
  if (auth === null) return send(res, 503, { ok: false, error: 'intake_not_configured' });
  if (!auth) return send(res, 401, { ok: false, error: 'unauthorized' });
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { ok: false, error: e.code === 413 ? 'too_large' : 'bad_json' }); }
  const dryRun = !!(body && !Array.isArray(body) && (body.dry_run === true || body.dryRun === true));
  const items = Array.isArray(body) ? body : body && Array.isArray(body.replies) ? body.replies : body && typeof body === 'object' ? [body] : null;
  if (!items || !items.length) return send(res, 400, { ok: false, error: 'no_replies' });
  if (items.length > MAX_BATCH) return send(res, 413, { ok: false, error: 'batch_too_large', max: MAX_BATCH });
  if (backend() !== 'sheets') return send(res, 503, { ok: false, error: 'leads_store_not_configured' });
  try {
    const r = await ingestReplies(items, { dryRun });
    return send(res, 200, { ok: true, dry_run: dryRun, received: items.length, ...r });
  } catch (e) {
    console.error('broadcast-reply failed', e.message);
    return send(res, 502, { ok: false, error: 'store_unavailable' });
  }
}
