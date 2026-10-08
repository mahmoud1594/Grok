// GET /api/leads — signed-in CRM users only. Reads the private Leads Sheet (60 s server cache; ?fresh=1 bypasses).
import { requireAuth, setCors, handleOptions } from './_lib/auth.js';
import { listLeads, dedupeByPhone, normPhone, backend } from './_lib/leads-store.js';
import { emailHandler } from './_lib/email-handler.js';
const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(body)); };
export default async function handler(req, res) {
  // Email contacts (?feed=email) and the email webhook (/api/email-events → ?feed=email-events) share this function.
  const feed = new URL(req.url || '/', 'http://local').searchParams.get('feed');
  if (feed === 'email' || feed === 'email-events') return emailHandler(req, res, feed);
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  try {
    const fresh = /^(1|true)$/.test(String((req.query && req.query.fresh) || new URL(req.url, 'http://x').searchParams.get('fresh') || ''));
    const r = await listLeads({ fresh });
    // Same phone format for every row (a Sheet may hold 050..., 0097150..., +97150...), then merge duplicates.
    const leads = dedupeByPhone(r.leads.map((l) => (String(l.phone).replace(/\D/g, '').length >= 7 ? { ...l, phone: normPhone(l.phone) } : l)));
    return send(res, 200, { ok: true, backend: backend(), cachedAt: new Date(r.cachedAt).toISOString(), count: leads.length, rows: r.leads.length, leads });
  } catch (e) { console.error('leads read failed', e.message); return send(res, 502, { ok: false, error: 'store_unavailable' }); }
}
