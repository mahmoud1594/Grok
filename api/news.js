// GET  /api/news — signed-in CRM users. Every project card with its WhatsApp messages, newest first.
// POST /api/news — the WhatsApp reader. Needs NEWS_INGEST_TOKEN as "Authorization: Bearer <token>" or "X-Ingest-Token".
//      Body: one message, an array, or { messages: [...] }. Payload is documented in README.md (News ingest).
import crypto from 'crypto';
import { requireAuth, setCors, handleOptions, readBody } from './_lib/auth.js';
import { backend, board, ingest, normalizeItem, parseIngestBody } from './_lib/news-store.js';

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
};

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function ingestToken(req) {
  const header = req.headers['x-ingest-token'];
  if (header) return String(Array.isArray(header) ? header[0] : header).trim();
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export function ingestAuthorized(req) {
  const expected = (process.env.NEWS_INGEST_TOKEN || '').trim();
  if (expected.length < 16) return { ok: false, code: 503, error: 'ingest_not_configured' };
  const given = ingestToken(req);
  if (!given || !crypto.timingSafeEqual(digest(given), digest(expected))) return { ok: false, code: 401, error: 'unauthorized' };
  return { ok: true };
}

async function handlePost(req, res) {
  const auth = ingestAuthorized(req);
  if (!auth.ok) return send(res, auth.code, { ok: false, error: auth.error });
  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
    if (typeof body === 'string') body = JSON.parse(body || 'null');
  } catch {
    return send(res, 400, { ok: false, error: 'bad_json' });
  }
  const parsed = parseIngestBody(body);
  if (parsed.error) return send(res, 400, { ok: false, error: parsed.error });
  const messages = [];
  const rejected = [];
  parsed.items.forEach((item, index) => {
    const result = normalizeItem(item);
    if (result.error) rejected.push({ index, error: result.error });
    else messages.push(result.message);
  });
  if (messages.length === 0) return send(res, 400, { ok: false, error: 'no_valid_messages', rejected });
  try {
    const results = await ingest(messages);
    return send(res, 200, {
      ok: true,
      backend: backend(),
      accepted: results.filter((row) => row.status !== 'duplicate').length,
      duplicates: results.filter((row) => row.status === 'duplicate').length,
      results,
      rejected,
    });
  } catch (e) {
    console.error('news ingest failed', e.message);
    return send(res, 502, { ok: false, error: 'store_unavailable' });
  }
}

async function handleGet(req, res) {
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  try {
    const cards = await board({ limit: 100 });
    return send(res, 200, { ok: true, backend: backend(), fetchedAt: new Date().toISOString(), cards });
  } catch (e) {
    console.error('news read failed', e.message);
    return send(res, 502, { ok: false, error: 'store_unavailable' });
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return send(res, 405, { ok: false, error: 'method_not_allowed' });
}
