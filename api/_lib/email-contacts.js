// Email contacts (owner lists with emails, Phase 1: Business Bay + Downtown) in the EmailContacts tab of the
// MahmoudDXB Leads sheet. The Leads tab is never touched. Pure planning here (unit-tested), Sheet I/O below.
// Tracking columns are filled by the email webhook (opens, clicks, unsubscribes, bounces, sends).
// Unsubscribes, spam complaints and bounces also go to the shared StopList tab (channel "email"), and an import
// never brings an address back: StopList emails stay marked as unsubscribed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { gapi, normPhone, dubaiNow, backend } from './leads-store.js';
import { readStops, ensureStopTab, stopRng, stopRow, toDubaiIso } from './broadcast-intake.js';

export const EMAIL_TAB = 'EmailContacts';
export const EMAIL_COLUMNS = ['Community', 'Building', 'Name', 'Phone', 'Email', 'Opened', 'Clicked', 'Unsubscribed', 'Bounced', 'Last sent'];
const C = Object.fromEntries(EMAIL_COLUMNS.map((c, i) => [c, i]));
const TRACK = ['Opened', 'Clicked', 'Unsubscribed', 'Bounced', 'Last sent'];
const LAST = String.fromCharCode(64 + EMAIL_COLUMNS.length); // J
export const MAX_IMPORT = 40000, MAX_EVENTS = 1000;

const ALIASES = {
  community: ['community', 'area', 'area_name', 'master_community', 'district', 'location'],
  building: ['project_or_building', 'building', 'building_name', 'tower', 'project', 'project_name', 'property'],
  name: ['owner_name', 'name', 'owner', 'full_name', 'client_name', 'contact_name'],
  phone: ['phone', 'mobile', 'phone_number', 'mobile_number', 'contact_number', 'tel'],
  email: ['email', 'e_mail', 'email_address', 'mail'],
};
const headerKey = (h) => String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const text = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[a-z]{2,}$/i;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** First valid address in a cell ("a@x.com; b@y.com" → a@x.com), lower-cased; '' when none. */
export function cleanEmail(v) {
  for (const part of String(v ?? '').split(/[\s,;/|]+/)) {
    const e = part.trim().replace(/^mailto:/i, '').replace(/^[<("']+|[>)"'.]+$/g, '').toLowerCase();
    if (e.length <= 254 && EMAIL.test(e)) return e;
  }
  return '';
}

/** First phone in a cell, as +<digits>; '' when there is no usable number. */
export function cleanPhone(v) {
  for (const part of String(v ?? '').split(/[,;/|]+/)) {
    if (part.replace(/\D/g, '').length < 7) continue;
    const p = normPhone(part);
    if (/^\+\d{8,15}$/.test(p)) return p;
  }
  return '';
}

/** "BUSINESS BAY" / "business bay" → "Business Bay"; mixed case is kept as written. */
export function cleanPlace(v) {
  const s = text(v, 120);
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

const PLACE_PART = /^(business bay|down ?town( dubai)?|down ?town burj khalifa.*|dubai|uae|united arab emirates|burj khalifa community|(al )?abraj street|fountain street|je?ba[lb]? ali|p\.?\s*o\.?\s*box\b.*)$/i;
const UNIT_PART = /^((\d+\s*bhk\s*)?(apt|apartment|appartment|flat|unit|office|door|shop|villa)\b.*|.*#.*|\d+(st|nd|rd|th)\s+floor|[a-z]?\d+[a-z]?|[a-z]|\.?\s*\d+)$/i;
const BUILDING_ALIASES = [
  [/n[aeiou]{1,2}j[aeiou]{1,2}m/i, 'Burj Al Nujoom'],
  [/^westbur+y\b/i, 'Westburry Tower'],
  [/^one by omn?i?y?at\b/i, 'One by Omniyat'],
  [/^bus+iness central\b/i, 'Business Central'],
  [/^suburbia\b/i, 'Suburbia'],
  [/^bayswater( tower)?$/i, 'Bayswater'],
];

/**
 * Owner-list building cell → tower name: drops "list:" prefixes, everything after ";", unit codes (RBC/5/501, G24+G24A,
 * Go1, "Dg 77 - Apartment", Retail2), comma parts that are a unit or the area/city, and folds known spelling variants.
 */
export function cleanBuilding(v) {
  const raw = text(v, 200).replace(/^list:\s*/i, '').split(';')[0];
  const parts = raw.split(',').map((p) => p.replace(/^[\s:.\-]+|[\s.\-]+$/g, '').trim()).filter(Boolean);
  let s = parts.find((p) => !UNIT_PART.test(p) && !PLACE_PART.test(p)) || parts[0] || '';
  s = s.replace(/_ca$/i, '')
    .replace(/\s+[a-z]{2,6}\/\w+(\/\w+)?$/i, '')
    .replace(/\s+(g|f|go|fo)\s?\d+[a-z]?(\s*\+\s*\w+)*(\s*\/\s*\w*)?$/i, '')
    .replace(/\s*-\s*apartment\b.*$/i, '').replace(/\s*\bdg\s*\d+\b/i, '')
    .replace(/\s*-?\s*retail\s*-?\s*\d+$/i, '')
    .replace(/^\d{3,}[a-z]?\s+(?=[a-z])/i, '').replace(/\s+\d{3,}[a-z]?$/, '')
    .replace(/[\s,\-/.]+$/, '').replace(/\s+/g, ' ').trim();
  const alias = BUILDING_ALIASES.find(([re]) => re.test(s));
  return cleanPlace(alias ? alias[1] : s);
}

/** Header row → { community, building, name, phone, email } column indexes (-1 when absent). */
export function mapHeader(columns) {
  const keys = (columns || []).map(headerKey);
  const out = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    let i = -1;
    for (const n of names) { i = keys.indexOf(n); if (i >= 0) break; }
    out[field] = i;
  }
  return out;
}

const guard = (v, col) => (/^[=+\-@]/.test(v) && !(col === C.Phone && /^\+\d{7,15}$/.test(v)) ? "'" + v : v);
const unguard = (v) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

/** Sheet values → { rows (10 strings each, blank rows kept so indexes match), firstRow (sheet row of rows[0]) }. */
export function rowsFromSheet(values) {
  const rows = Array.isArray(values) ? values : [];
  const start = rows.length && String(rows[0][0] ?? '').trim() === EMAIL_COLUMNS[0] && String(rows[0][C.Email] ?? '').trim() === 'Email' ? 1 : 0;
  return { rows: rows.slice(start).map((r) => EMAIL_COLUMNS.map((_, i) => unguard(String((r && r[i]) ?? '')))), firstRow: start + 1 };
}
export const rowToSheet = (r) => r.map((v, i) => guard(String(v ?? ''), i));

/** Email StopList rows → Map(email → { at, reason }). */
export function emailStops(stops) {
  const out = new Map();
  for (const s of stops || []) {
    if (String(s.channel).toLowerCase() !== 'email') continue;
    const e = cleanEmail(s.handle || String(s.contact_key || '').replace(/^email:/, ''));
    if (e && !out.has(e)) out.set(e, { at: s.replied_at || s.added_at || '', reason: s.message || 'unsubscribed' });
  }
  return out;
}

const shortTime = (iso) => String(iso || '').replace('T', ' ').slice(0, 16);

/**
 * Clean + sort an uploaded owner list. Rows without a valid email are dropped; rows without a phone stay with the
 * phone blank. The same email in the same building is kept once. Existing tracking values (by email) are kept, and
 * StopList emails are marked unsubscribed. Sorted by community, then building, then name.
 */
export function planImport(columns, input, { existing = [], stops = [] } = {}) {
  const asArrays = Array.isArray(input) && input.every(Array.isArray);
  const header = asArrays ? columns : Object.keys(Object.assign({}, ...(input || []).slice(0, 50)));
  const idx = mapHeader(header);
  if (idx.email < 0) throw Object.assign(new Error('no email column'), { code: 400, error: 'no_email_column' });
  const keys = (header || []).map((h) => h);
  const cell = (r, i) => (i < 0 ? '' : asArrays ? r[i] : r[keys[i]]);

  const track = new Map();
  for (const r of existing) {
    const t = track.get(r[C.Email]) || TRACK.map(() => '');
    TRACK.forEach((col, k) => { const v = r[C[col]] || ''; if (v > t[k]) t[k] = v; });
    track.set(r[C.Email], t);
  }
  const stopped = emailStops(stops);

  const stats = { received: 0, no_email: 0, duplicates: 0, written: 0, unique_emails: 0, no_phone: 0, unsubscribed: 0 };
  const seen = new Set(), out = [];
  for (const r of input || []) {
    if (!r || typeof r !== 'object') continue;
    stats.received++;
    const email = cleanEmail(cell(r, idx.email));
    if (!email) { stats.no_email++; continue; }
    const community = cleanPlace(cell(r, idx.community));
    const building = cleanBuilding(cell(r, idx.building));
    const k = email + '|' + community.toLowerCase() + '|' + building.toLowerCase();
    if (seen.has(k)) { stats.duplicates++; continue; }
    seen.add(k);
    const t = track.get(email) || TRACK.map(() => '');
    const stop = stopped.get(email);
    const slot = stop && stop.reason === 'bounced' ? 3 : 2; // TRACK index of Bounced / Unsubscribed
    if (stop && !t[slot]) t[slot] = shortTime(stop.at) || shortTime(dubaiNow());
    out.push([community, building, text(cell(r, idx.name), 160), cleanPhone(cell(r, idx.phone)), email, ...t]);
  }
  // One spelling per building ("BURJ VISTA Tower 1" / "Burj Vista Tower 1"): the most common one wins.
  const spell = new Map(), placeKey = (r) => r[0].toLowerCase() + '|' + r[1].toLowerCase();
  for (const r of out) { const m = spell.get(placeKey(r)) || new Map(); m.set(r[1], (m.get(r[1]) || 0) + 1); spell.set(placeKey(r), m); }
  const best = new Map([...spell].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
  for (const r of out) r[1] = best.get(placeKey(r));
  out.sort((a, b) => (!a[0] - !b[0]) || collator.compare(a[0], b[0]) || (!a[1] - !b[1]) || collator.compare(a[1], b[1])
    || collator.compare(a[2], b[2]) || a[4].localeCompare(b[4]));
  stats.written = out.length;
  stats.unique_emails = new Set(out.map((r) => r[C.Email])).size;
  stats.no_phone = out.filter((r) => !r[C.Phone]).length;
  stats.unsubscribed = out.filter((r) => r[C.Unsubscribed] || r[C.Bounced]).length;
  const communities = {};
  for (const r of out) communities[r[0] || '(none)'] = (communities[r[0] || '(none)'] || 0) + 1;
  return { rows: out, stats: { ...stats, communities } };
}

/* ---------- webhook events ---------- */

const KINDS = [[/spam|complain|abuse/, 'complaint'], [/unsub|opt.?out/, 'unsubscribe'], [/bounce|dropped|undeliver|failed/, 'bounce'],
  [/click/, 'click'], [/open/, 'open'], [/sent|deliver|processed/, 'sent']];
export const KIND_COLUMN = { open: 'Opened', click: 'Clicked', unsubscribe: 'Unsubscribed', complaint: 'Unsubscribed', bounce: 'Bounced', sent: 'Last sent' };
const STOP_KINDS = new Set(['unsubscribe', 'complaint', 'bounce']);

/**
 * Provider payload → [{ kind, email, at, campaign }]. Understands MailerLite ({ type, subscriber } or { events: [...] }),
 * Brevo/SendGrid style ({ event, email, timestamp } or arrays of them), Mailgun ({ "event-data": {...} }) and
 * Resend ({ type, data: { to: [...] } }). Unknown event types are skipped.
 */
export function normaliseEvents(body) {
  const list = Array.isArray(body) ? body : body && Array.isArray(body.events) ? body.events : body && typeof body === 'object' ? [body] : [];
  const out = [];
  for (const raw of list.slice(0, MAX_EVENTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw['event-data'] && typeof raw['event-data'] === 'object' ? raw['event-data'] : raw;
    const d = e.data && typeof e.data === 'object' ? e.data : {};
    const type = String(e.type || e.event || e.event_type || d.type || d.event || '').toLowerCase();
    const kind = (KINDS.find(([re]) => re.test(type)) || [])[1];
    if (!kind) continue;
    const to = Array.isArray(d.to) ? d.to[0] : d.to;
    const email = cleanEmail((e.subscriber && e.subscriber.email) || (d.subscriber && d.subscriber.email) || e.email || e.recipient || d.email || d.recipient || to);
    if (!email) continue;
    // Only trust a payload time that carries a zone or is epoch; zoneless provider times fall back to "now".
    const when = String(e.created_at || e.timestamp || e.date || e.ts || d.created_at || d.timestamp || '').trim();
    const zoned = /^\d{10,13}$/.test(when) || /(Z|[+-]\d{2}:?\d{2})$/.test(when);
    const at = shortTime((zoned && toDubaiIso(when)) || dubaiNow());
    const campaign = text((e.campaign && (e.campaign.name || e.campaign.id)) || (d.campaign && (d.campaign.name || d.campaign.id)) || e.campaign_name || e.tag || d.subject || '', 80);
    out.push({ kind, email, at, campaign });
  }
  return out;
}

/**
 * Events + current sheet rows → cell updates and StopList additions (no I/O). Opened/Clicked/Bounced/Last sent keep
 * the latest time; Unsubscribed keeps the first. Every row with the email is updated.
 */
export function planEvents(events, rows, stops = []) {
  const byEmail = new Map();
  rows.forEach((r, i) => { const e = r[C.Email]; if (!e) return; if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e).push(i); });
  const cells = new Map(), stopped = emailStops(stops), addStops = [], results = { matched: 0, unmatched: 0, stop_added: 0 };
  for (const ev of events) {
    const col = C[KIND_COLUMN[ev.kind]];
    const hits = byEmail.get(ev.email) || [];
    if (hits.length) results.matched++; else results.unmatched++;
    for (const i of hits) {
      const k = i + ':' + col, cur = cells.has(k) ? cells.get(k) : rows[i][col] || '';
      cells.set(k, col === C.Unsubscribed ? (cur || ev.at) : (ev.at > cur ? ev.at : cur));
    }
    if (STOP_KINDS.has(ev.kind) && !stopped.has(ev.email)) {
      const name = hits.length ? rows[hits[0]][C.Name] : '';
      stopped.set(ev.email, { at: ev.at, reason: ev.kind });
      addStops.push({ replied_at: ev.at.replace(' ', 'T') + ':00+04:00', channel: 'email', phone: '', handle: ev.email, name,
        campaign: ev.campaign || 'email', message: ev.kind === 'complaint' ? 'spam complaint' : ev.kind === 'bounce' ? 'bounced' : 'unsubscribed', contact_key: 'email:' + ev.email });
      results.stop_added++;
    }
  }
  const updates = [...cells].map(([k, value]) => { const [i, col] = k.split(':').map(Number); return { index: i, col, value }; })
    .filter((u) => u.value !== (rows[u.index][u.col] || ''));
  return { updates, addStops, results };
}

/** Webhook auth against EMAIL_WEBHOOK_SECRET: MailerLite "Signature" (HMAC-SHA256 of the raw body, hex),
 *  or "Authorization: Bearer <secret>", or ?token=<secret> for tools that only take a URL. null = not configured.
 *  MailerLite issues short secrets, which are fine for the HMAC; the bearer/token forms need 24+ characters. */
export function webhookAuth(req, raw, env = process.env) {
  const secret = String(env.EMAIL_WEBHOOK_SECRET || '').trim();
  if (secret.length < 8) return null;
  const longSecret = secret.length >= 24;
  const eq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
  const h = req.headers || {};
  const sig = String(h.signature || h['x-mailerlite-signature'] || '').trim().toLowerCase();
  if (sig && eq(sig, crypto.createHmac('sha256', secret).update(raw || '').digest('hex'))) return true;
  const auth = String(h.authorization || '');
  if (longSecret && auth.startsWith('Bearer ') && eq(auth.slice(7).trim(), secret)) return true;
  const token = new URL(req.url || '/', 'http://x').searchParams.get('token');
  if (longSecret && token && eq(token, secret)) return true;
  return false;
}

/* ---------- storage ---------- */

const rngE = (a) => encodeURIComponent("'" + EMAIL_TAB + "'!" + a);
const mockFile = () => process.env.EMAIL_CONTACTS_MOCK_FILE || '/tmp/email-contacts-mock.json';
const mockLoad = () => { try { return JSON.parse(fs.readFileSync(mockFile(), 'utf8')); } catch { return { rows: null, stops: [] }; } };
const mockSave = (m) => fs.writeFileSync(mockFile(), JSON.stringify(m));

let cache = null; const TTL = 60e3;

async function sheetTab() {
  const j = await gapi('GET', '?fields=sheets.properties(sheetId,title,gridProperties.rowCount)');
  const p = (j.sheets || []).map((s) => s.properties).find((s) => s.title === EMAIL_TAB);
  return p || null;
}

async function loadRows() {
  if (backend() === 'mock') { const m = mockLoad(); return { rows: m.rows || [], firstRow: 2, exists: !!m.rows }; }
  try {
    const j = await gapi('GET', '/values/' + rngE('A1:' + LAST));
    return { ...rowsFromSheet(j.values), exists: true };
  } catch (e) {
    if (/Unable to parse range|400/.test(e.message)) return { rows: [], firstRow: 2, exists: false };
    throw e;
  }
}

async function loadStops() {
  if (backend() === 'mock') return mockLoad().stops || [];
  return (await readStops()) || [];
}

/** Rows for the CRM tab plus the email unsubscribe list. 60 s cache, fresh=true bypasses. */
export async function readContacts({ fresh = false } = {}) {
  if (backend() === 'unconfigured') throw new Error('store not configured');
  if (!fresh && cache && cache.at > Date.now() - TTL) return cache.value;
  const [{ rows, exists }, stops] = await Promise.all([loadRows(), loadStops()]);
  const unsubscribes = [...emailStops(stops)].map(([email, s]) => ({ email, at: shortTime(s.at), reason: s.reason }));
  const value = { rows: rows.filter((r) => r[C.Email]), exists, unsubscribes, cachedAt: new Date().toISOString() };
  cache = { at: Date.now(), value };
  return value;
}

/** Replace the EmailContacts tab with the cleaned, sorted upload. dryRun → stats only. */
export async function importContacts(columns, input, { dryRun = false } = {}) {
  if (backend() === 'unconfigured') throw new Error('store not configured');
  const [{ rows: existing }, stops] = await Promise.all([loadRows(), loadStops()]);
  const plan = planImport(columns, input, { existing: existing.filter((r) => r[C.Email]), stops });
  if (dryRun) return { dry_run: true, stats: plan.stats };
  if (backend() === 'mock') { mockSave({ ...mockLoad(), rows: plan.rows }); cache = null; return { stats: plan.stats }; }
  const need = plan.rows.length + 1;
  const tab = await sheetTab();
  if (!tab) {
    await gapi('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: EMAIL_TAB, gridProperties: { rowCount: need + 500, columnCount: EMAIL_COLUMNS.length, frozenRowCount: 1 } } } }] });
  } else if ((tab.gridProperties && tab.gridProperties.rowCount || 0) < need) {
    await gapi('POST', ':batchUpdate', { requests: [{ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { rowCount: need + 500 } }, fields: 'gridProperties.rowCount' } }] });
  }
  await gapi('POST', '/values/' + rngE('A1:' + LAST) + ':clear', {});
  await gapi('PUT', '/values/' + rngE('A1:' + LAST + '1') + '?valueInputOption=RAW', { values: [EMAIL_COLUMNS] });
  const CHUNK = 4000;
  for (let i = 0; i < plan.rows.length; i += CHUNK) {
    const part = plan.rows.slice(i, i + CHUNK).map(rowToSheet);
    await gapi('PUT', '/values/' + rngE('A' + (i + 2) + ':' + LAST + (i + 1 + part.length)) + '?valueInputOption=RAW', { values: part });
  }
  cache = null;
  return { stats: plan.stats };
}

/** Apply webhook events to the tracking columns and the StopList. */
export async function applyEvents(events) {
  if (backend() === 'unconfigured') throw new Error('store not configured');
  const [{ rows, firstRow }, stops] = await Promise.all([loadRows(), loadStops()]);
  const plan = planEvents(events, rows, stops);
  if (backend() === 'mock') {
    const m = mockLoad();
    for (const u of plan.updates) rows[u.index][u.col] = u.value;
    mockSave({ ...m, rows: m.rows ? rows : m.rows, stops: [...(m.stops || []), ...plan.addStops.map((s) => ({ ...s, added_at: dubaiNow() }))] });
  } else {
    if (plan.updates.length) {
      await gapi('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: plan.updates.map((u) => ({
        range: "'" + EMAIL_TAB + "'!" + String.fromCharCode(65 + u.col) + (u.index + firstRow), values: [[u.value]] })) });
    }
    if (plan.addStops.length) {
      if ((await readStops()) === null) await ensureStopTab();
      await gapi('POST', '/values/' + stopRng('A1:I') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: plan.addStops.map(stopRow) });
    }
  }
  cache = null;
  return { ...plan.results, cells_updated: plan.updates.length };
}
