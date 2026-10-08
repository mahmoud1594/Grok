// GET /api/whatsapp-links — signed-in CRM users. Saved WhatsApp groups and contacts for the WhatsApp tab.
// The list lives server-side so contact numbers never ship in the bundle. Edit api/_lib/whatsapp-links.json,
// or set WHATSAPP_LINKS_JSON to the same JSON shape to override it without a commit.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, setCors, handleOptions } from './_lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
};

function text(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function digits(value) {
  let out = String(value ?? '').replace(/\D/g, '');
  if (out.startsWith('00')) out = out.slice(2);
  else if (out.startsWith('0')) out = `971${out.slice(1)}`;
  return out.length >= 9 && out.length <= 15 ? out : '';
}

function groupHref(raw) {
  try {
    const url = new URL(String(raw ?? '').trim());
    if (url.protocol !== 'https:') return '';
    if (url.hostname === 'chat.whatsapp.com' && url.pathname.length > 1) return url.href;
    if (url.hostname === 'wa.me' || url.hostname === 'whatsapp.com' || url.hostname.endsWith('.whatsapp.com')) return url.href;
  } catch {
    /* not a URL */
  }
  return '';
}

export function normalizeLinks(raw) {
  const groups = (Array.isArray(raw?.groups) ? raw.groups : [])
    .map((group, index) => ({
      id: `g${index}`,
      name: text(group?.name),
      note: text(group?.note, 200),
      developer: text(group?.developer),
      href: groupHref(group?.url ?? group?.invite),
    }))
    .filter((group) => group.name && group.href);
  const contacts = (Array.isArray(raw?.contacts) ? raw.contacts : [])
    .map((contact, index) => {
      const phone = digits(contact?.phone);
      const message = text(contact?.message, 500);
      return {
        id: `c${index}`,
        name: text(contact?.name),
        note: text(contact?.note, 200),
        href: phone ? `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}` : '',
      };
    })
    .filter((contact) => contact.name && contact.href);
  return { groups, contacts };
}

export function loadLinks(env = process.env) {
  if (env.WHATSAPP_LINKS_JSON) return normalizeLinks(JSON.parse(env.WHATSAPP_LINKS_JSON));
  const file = env.WHATSAPP_LINKS_FILE || path.join(__dirname, '_lib', 'whatsapp-links.json');
  return normalizeLinks(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  try {
    return send(res, 200, { ok: true, ...loadLinks() });
  } catch (e) {
    console.error('whatsapp links failed', e.message);
    return send(res, 500, { ok: false, error: 'links_unreadable' });
  }
}
