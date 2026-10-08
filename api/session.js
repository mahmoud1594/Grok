import {
  requireAuth,
  parseCookies,
  USER_COOKIE,
  setCors,
  handleOptions,
} from './_lib/auth.js'

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Allow', 'GET,OPTIONS');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const verified = requireAuth(req);
  if (!verified) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: false, user: null, error: 'Unauthorized — please sign in' }));
    return;
  }

  const cookies = parseCookies(req);
  const user = verified.user || cookies[USER_COOKIE] || null;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, user }));
};
