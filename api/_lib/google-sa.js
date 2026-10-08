// Google service-account access tokens for any scope (RS256 JWT with node:crypto, no extra deps).
// Uses the same GOOGLE_SA_EMAIL / GOOGLE_SA_KEY env as the Leads store. Tokens are cached per scope.
import crypto from 'crypto';

const cache = new Map();
function cleanKey(k) { k = String(k || '').trim().replace(/\r/g, ''); if (/^(["']).*\1$/s.test(k)) k = k.slice(1, -1); return k.replace(/\\n/g, '\n'); }
export function saConfigured(env = process.env) { return !!(String(env.GOOGLE_SA_EMAIL || '').trim() && String(env.GOOGLE_SA_KEY || '').trim()); }
export function saEmail(env = process.env) { return String(env.GOOGLE_SA_EMAIL || '').trim().replace(/^["']|["']$/g, ''); }

export async function saToken(scope) {
  const hit = cache.get(scope);
  if (hit && hit.exp > Date.now() + 60e3) return hit.value;
  const email = saEmail(), key = cleanKey(process.env.GOOGLE_SA_KEY);
  if (!email || !key) throw Object.assign(new Error('GOOGLE_SA_EMAIL / GOOGLE_SA_KEY not set'), { code: 'sa_not_configured' });
  const now = Math.floor(Date.now() / 1000);
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }), signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('google token: ' + (j.error_description || j.error || r.status));
  cache.set(scope, { value: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}
