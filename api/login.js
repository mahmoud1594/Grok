import {
  checkLogin,
  AUTH_CONFIGURED,
  makeToken,
  setSessionCookies,
  setCors,
  handleOptions,
  readBody,
  json,
} from './_lib/auth.js'

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  if (!AUTH_CONFIGURED) return json(res, 503, { ok: false, error: 'Sign-in is not configured' });
  try {
    let body = req.body;
    if (!body || (typeof body === 'object' && !Object.keys(body).length)) {
      body = await readBody(req);
    } else if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { body = {}; }
    }
    const user = String(body.username || body.user || '').trim();
    const password = String(body.password || body.pass || '');
    if (!checkLogin(user, password)) {
      return json(res, 401, { ok: false, error: 'Invalid username or password' });
    }
    const token = makeToken(user);
    setSessionCookies(res, token, user, req);
    return json(res, 200, { ok: true, token, user });
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message || 'Bad request' });
  }
};
