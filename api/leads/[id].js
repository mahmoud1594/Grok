// PATCH /api/leads/:id — signed-in CRM users update status / owner / next_action_date / notes / comment / name only (validated in leads-store).
// DELETE /api/leads/:id — signed-in CRM users remove that one row from the sheet.
// vercel.json rewrites /api/leads/:id to this file (/api/leads/[id]?id=:id); without that rule PATCH never reaches it.
import { requireAuth, setCors, handleOptions, readBody } from '../_lib/auth.js';
import { deleteLead, updateLead } from '../_lib/leads-store.js';
const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(body)); };
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop());
    if (!id || id.length > 64) return send(res, 400, { ok: false, error: 'bad_id' });
    try { const lead = await deleteLead(id); return send(res, 200, { ok: true, lead }); }
    catch (e) { const c = e.code || 502; if (c === 502) console.error('lead delete failed', e.message); return send(res, c, { ok: false, error: c === 502 ? 'store_unavailable' : e.message }); }
  }
  const id = (req.query && req.query.id) || decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop());
  let body; try { body = (req.body && typeof req.body === 'object') ? req.body : await readBody(req); if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch { return send(res, 400, { ok: false, error: 'bad_json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { ok: false, error: 'bad_body' });
  if (!id || id.length > 64) return send(res, 400, { ok: false, error: 'bad_id' });
  try { const lead = await updateLead(id, body || {}); return send(res, 200, { ok: true, lead }); }
  catch (e) { const c = e.code || 502; if (c === 502) console.error('lead update failed', e.message); return send(res, c, { ok: false, error: c === 502 ? 'store_unavailable' : e.message }); }
}
