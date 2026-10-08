import crypto from 'node:crypto'

// No built-in fallbacks: if the login env vars are missing, nobody can sign in and no token verifies.
const SECRET = String(process.env.LISTING_CHECK_SECRET || '').trim();
const USER = String(process.env.LISTING_CHECK_USER || '').trim();
const PASS = String(process.env.LISTING_CHECK_PASS || '').trim();
const AUTH_CONFIGURED = !!(SECRET && USER && PASS);
const SESSION_MS = 12 * 3600 * 1000;
const COOKIE_MAX_AGE = 43200;
const COOKIE_DOMAIN = '.mahmouddxb.com';
const PARENT_DOMAINS = ['askmontaser.ae', 'mahmouddxb.com'];
const TOKEN_COOKIE = 'mdxb_listing_check_token';
const USER_COOKIE = 'mdxb_listing_check_user';

const ALLOWED_ORIGINS = new Set(PARENT_DOMAINS.flatMap((d) => [`https://${d}`, `https://www.${d}`, `https://crm.${d}`]));

function sign(payload) {
  if (!AUTH_CONFIGURED) throw new Error('auth not configured');
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
}

function makeToken(user) {
  const exp = Date.now() + SESSION_MS;
  const payload = `${user}.${exp}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString('base64url');
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [user, expStr, sig] = parts;
    const payload = `${user}.${expStr}`;
    if (!AUTH_CONFIGURED) return null;
    const want = sign(payload);
    if (typeof sig !== 'string' || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    if (Number(expStr) < Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

function getBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim();
  return '';
}

function parseCookies(req) {
  const header = req.headers.cookie || req.headers.Cookie || '';
  const out = {};
  String(header)
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (!k) return;
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    });
  return out;
}

function getAuthToken(req) {
  const bearer = getBearer(req);
  if (bearer) return bearer;
  const cookies = parseCookies(req);
  return cookies[TOKEN_COOKIE] || '';
}

function requireAuth(req) {
  const user = verifyToken(getAuthToken(req));
  if (!user) return null;
  return { user };
}

function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function checkLogin(username, password) {
  if (!AUTH_CONFIGURED) return false;
  return safeEq(String(username || '').trim(), USER) && safeEq(String(password || ''), PASS);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function requestHostname(req) {
  const raw = req?.headers?.host || req?.headers?.['x-forwarded-host'] || '';
  const first = String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim().toLowerCase();
  if (first.startsWith('[')) {
    const end = first.indexOf(']');
    return end === -1 ? first : first.slice(0, end + 1);
  }
  return first.replace(/:\d+$/, '');
}

/** Shared parent domain only for askmontaser.ae / mahmouddxb.com and their subdomains. Other hosts stay host-only. */
function cookieDomainFor(req) {
  const host = requestHostname(req);
  const parent = PARENT_DOMAINS.find((d) => host === d || host.endsWith('.' + d));
  return parent ? '.' + parent : '';
}

function cookiePair(name, value, { httpOnly = false, maxAge = COOKIE_MAX_AGE, domain = '' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (httpOnly) parts.push('HttpOnly');
  if (domain) parts.push(`Domain=${domain}`);
  parts.push('Path=/', 'Secure', 'SameSite=Lax', `Max-Age=${maxAge}`);
  return parts.join('; ');
}

function clearCookiePair(name, { httpOnly = false, domain = '' } = {}) {
  return cookiePair(name, '', { httpOnly, maxAge: 0, domain });
}

function setSessionCookies(res, token, user, req) {
  const domain = cookieDomainFor(req);
  res.setHeader('Set-Cookie', [
    cookiePair(TOKEN_COOKIE, token, { httpOnly: true, domain }),
    cookiePair(USER_COOKIE, user, { httpOnly: false, domain }),
  ]);
}

function clearSessionCookies(res, req) {
  const domain = cookieDomainFor(req);
  const cookies = [
    clearCookiePair(TOKEN_COOKIE, { httpOnly: true }),
    clearCookiePair(USER_COOKIE, { httpOnly: false }),
  ];
  if (domain) {
    cookies.push(
      clearCookiePair(TOKEN_COOKIE, { httpOnly: true, domain }),
      clearCookiePair(USER_COOKIE, { httpOnly: false, domain }),
    );
  }
  res.setHeader('Set-Cookie', cookies);
}

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
}

function handleOptions(req, res) {
  setCors(req, res);
  res.statusCode = 204;
  res.end();
  return true;
}

export {
  makeToken,
  verifyToken,
  getBearer,
  getAuthToken,
  requireAuth,
  checkLogin,
  json,
  readBody,
  USER,
  USER_COOKIE,
  TOKEN_COOKIE,
  SESSION_MS,
  COOKIE_MAX_AGE,
  COOKIE_DOMAIN,
  ALLOWED_ORIGINS,
  AUTH_CONFIGURED,
  requestHostname,
  cookieDomainFor,
  cookiePair,
  setSessionCookies,
  clearSessionCookies,
  setCors,
  handleOptions,
  parseCookies,
}
