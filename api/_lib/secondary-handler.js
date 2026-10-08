// Served as GET /api/secondary (vercel.json rewrite -> /api/clients?feed=secondary; the Hobby plan caps a deployment at 12 functions).
// GET /api/secondary — live Trello "Secondary" board (MGYdwKGJ) cards for the Secondary map. Signed-in CRM users only.
// GET /api/secondary?cover=<cardId> — that card's cover image, proxied so the Trello token never reaches the browser.
// Returns titles, parsed unit code/type, list/community, card link, labels, cover, sold flag. Never card descriptions.
import { requireAuth, setCors, handleOptions } from './auth.js';
import { readSecondaryBoard, readCoverImage, trelloCreds, SECONDARY_BOARD_URL } from './secondary-trello.js';

const FRESH_MS = 300 * 1000; // s-maxage=300 equivalent
const STALE_MS = 3600 * 1000; // serve stale up to 1h while refreshing
// Per-instance cache. Not a shared CDN cache on purpose: a CDN copy would be served to signed-out visitors without the auth check.
let cache = null; // { at, body }
let inflight = null;

const send = (res, code, body, cacheControl = 'private, no-store') => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Vary', 'Cookie, Authorization');
  res.end(JSON.stringify(body));
};

function refresh(creds) {
  if (!inflight) {
    inflight = readSecondaryBoard(creds)
      .then((data) => {
        cache = { at: Date.now(), body: { ok: true, source: 'trello', fetchedAt: new Date().toISOString(), count: data.cards.length, ...data } };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function secondaryHandler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  const creds = trelloCreds();
  if (!creds) return send(res, 503, { ok: false, error: 'trello_not_configured', hint: 'Set TRELLO_KEY and TRELLO_TOKEN (server-only) on the Vercel project.', boardUrl: SECONDARY_BOARD_URL });

  const url = new URL(req.url || '/', 'http://local');
  const cover = url.searchParams.get('cover');
  if (cover) {
    try {
      const img = await readCoverImage(cover, creds);
      if (img.status !== 200) return send(res, img.status, { ok: false, error: 'cover_unavailable' });
      res.statusCode = 200;
      res.setHeader('Content-Type', img.type);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.end(img.body);
    } catch (err) {
      const code = err && (err.status === 404 || err.status === 400) ? 404 : 502;
      return send(res, code, { ok: false, error: 'cover_unavailable' });
    }
  }

  const age = cache ? Date.now() - cache.at : Infinity;
  const browserCache = 'private, max-age=60, stale-while-revalidate=300';
  if (cache && age < FRESH_MS) return send(res, 200, { ...cache.body, cached: true }, browserCache);
  if (cache && age < STALE_MS) {
    refresh(creds).catch(() => {});
    return send(res, 200, { ...cache.body, cached: true, stale: true }, browserCache);
  }
  try {
    const fresh = await refresh(creds);
    return send(res, 200, { ...fresh.body, cached: false }, browserCache);
  } catch (err) {
    if (cache) return send(res, 200, { ...cache.body, cached: true, stale: true, warning: 'trello_unavailable' }, browserCache);
    const status = err && err.status;
    const error = status === 401 || status === 403 ? 'trello_auth_failed' : status === 429 ? 'trello_rate_limited' : 'trello_unavailable';
    return send(res, 502, { ok: false, error, boardUrl: SECONDARY_BOARD_URL });
  }
}
