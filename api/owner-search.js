// /api/owner-search — Listings Check owner & phone search. Signed-in CRM users only.
//   GET  -> { ok, available, rows }            (database status)
//   POST { query, limit } -> { ok, results[] } (phone in any format, or owner name)
// Owner phones stay server-side: the data file lives in api/_lib (never served) or a private URL.
import { requireAuth, setCors, handleOptions, readBody } from './_lib/auth.js';
import { ownerDbStatus, searchOwners } from './_lib/owner-search.js';
const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(body)); };
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  try {
    if (req.method === 'GET') return send(res, 200, await ownerDbStatus());
    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : await readBody(req); } catch { return send(res, 400, { ok: false, error: 'bad_json', results: [] }); }
    const query = typeof body?.query === 'string' ? body.query : '';
    if (query.trim().length < 2) return send(res, 400, { ok: false, error: 'query_too_short', results: [] });
    const result = await searchOwners(query, body?.limit);
    const code = result.ok ? 200 : result.available === false ? 503 : 400;
    return send(res, code, result);
  } catch (error) {
    return send(res, 500, { ok: false, error: 'owner_search_failed', results: [] });
  }
}
