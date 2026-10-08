import { clearSessionCookies, setCors, handleOptions } from './_lib/auth.js'

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Allow', 'POST,OPTIONS');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  clearSessionCookies(res, req);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true }));
};
