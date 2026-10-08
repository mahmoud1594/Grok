// GET /api/clients — Clients tab rows for signed-in CRM users only. The data lives server-side, not in the public bundle.
import { requireAuth, setCors, handleOptions } from './_lib/auth.js';
import { CLIENTS } from './_lib/clients-data.js';
import { secondaryHandler } from './_lib/secondary-handler.js';
const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(body)); };
export default function handler(req, res) {
  // /api/secondary is rewritten here (feed=secondary): live Trello Secondary board, same sign-in check.
  if (new URL(req.url || '/', 'http://local').searchParams.get('feed') === 'secondary') return secondaryHandler(req, res);
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  return send(res, 200, { ok: true, count: CLIENTS.length, clients: CLIENTS });
}
