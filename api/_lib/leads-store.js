// Leads store shared by www (/api/lead) and crm (/api/leads).
// Backend "sheets": Google Sheets API via a service account (no extra deps; RS256 JWT with node:crypto).
// Backend "mock": a JSON file (seeded from leads-seed.json), for previews and tests. Never used in production.
// Env: LEADS_BACKEND=sheets|mock, LEADS_SHEET_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_KEY (PEM, \n escapes ok),
//      LEADS_TAB (default "Leads"), LEADS_MOCK_FILE (default /tmp/leads-mock.json).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { airtableConfigured, appendAirtableLead, deleteAirtableLead, listAirtableLeads, updateAirtableLead } from './airtable-leads.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COLUMNS = ['lead_id','created_at','source','name','phone','email','interest','project_or_community','budget_aed','beds',
  'country_program','message','status','owner','next_action_date','notes','utm_source','utm_campaign','page_url','consent',
  'bitrix_id','deal_url','updated_at','comment']; // 24 columns A–X; comment (X) is the last column
const STATUSES = ['new','contacted','qualified','viewing','won','lost','archived'];
// CRM edits are limited to the working fields plus the lead's display name and the CRM comment.
// Contact and source fields (phone, email, budget, ...) only change in the Sheet itself.
const EDITABLE = ['status','owner','next_action_date','notes','comment','name'];
const MAX_NOTES = 2000, MAX_COMMENT = 4000, MAX_NAME = 120;
// Plain text only: no control characters (incl. newlines/tabs) and no HTML/markup characters.
const plainName = (v) => !/[\u0000-\u001f\u007f<>{}\\`]/.test(v);
const noCtl = (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const OWNERS = () => ['', ...String(process.env.LEADS_OWNERS || 'Mahmoud').split(',').map((x) => x.trim()).filter(Boolean)];
const validDate = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const t = new Date(d + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === d; };
// One phone format everywhere: +<country><number>. UAE local forms (05x..., 5x... 9 digits, 00971...) become +971.
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = '971' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '971' + d;
  else if (/^9710\d{9}$/.test(d)) d = '971' + d.slice(4);
  return '+' + d;
}
// Mock when the Sheet env is missing (preview), but never silently in production: there it must be configured.
// Production never uses mock, even if LEADS_BACKEND=mock is set by mistake.
const backend = () => {
  const prod = process.env.VERCEL_ENV === 'production';
  const configured = !!(process.env.LEADS_SHEET_ID && process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_KEY);
  const b = (process.env.LEADS_BACKEND || '').toLowerCase();
  if (b === 'mock' && !prod) return 'mock';
  if (airtableConfigured() && b !== 'sheets') return 'airtable';
  if (configured) return 'sheets';
  return prod ? 'unconfigured' : 'mock';
};
const TIMEOUT_MS = 8000;
const timed = () => AbortSignal.timeout(TIMEOUT_MS);
function cleanKey(k) { k = String(k || '').trim().replace(/\r/g, ''); if (/^(["']).*\1$/s.test(k)) k = k.slice(1, -1); return k.replace(/\\n/g, '\n'); }
const tab = () => process.env.LEADS_TAB || 'Leads';

function dubaiNow() { // ISO with +04:00
  const d = new Date(Date.now() + 4 * 3600e3);
  return d.toISOString().replace(/\.\d+Z$/, '+04:00');
}
function newId() { return crypto.randomUUID(); }
// Formula-injection guard: we write with valueInputOption=RAW (never evaluated), and additionally prefix risky
// leading characters with ' so a value stays inert if someone later re-enters or copies it in Sheets.
// A plain international phone (+9715...) is safe text and kept as-is.
const RISKY = /^[=+\-@\t\r]/;
const guard = (c, v) => { v = v == null ? '' : String(v); if (!RISKY.test(v)) return v; if (c === 'phone' && /^\+\d{7,15}$/.test(v)) return v; return "'" + v; };
const unguard = (v) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);
function rowToObj(r) { const o = {}; COLUMNS.forEach((c, i) => { o[c] = r[i] == null ? '' : unguard(String(r[i])); }); return o; }
function objToRow(o) { return COLUMNS.map((c) => guard(c, o[c])); }

/* ---------- Google auth ---------- */
let tok = null;
async function accessToken() {
  if (tok && tok.exp > Date.now() + 60e3) return tok.value;
  const email = String(process.env.GOOGLE_SA_EMAIL || '').trim().replace(/^["']|["']$/g, ''), key = cleanKey(process.env.GOOGLE_SA_KEY);
  if (!email || !key) throw new Error('GOOGLE_SA_EMAIL / GOOGLE_SA_KEY not set');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }), signal: timed() });
  const j = await r.json(); if (!r.ok) throw new Error('google token: ' + (j.error_description || j.error || r.status));
  tok = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return tok.value;
}
async function gapi(method, p, body) {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + process.env.LEADS_SHEET_ID + p;
  const r = await fetch(url, { method, headers: { authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: timed() });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('sheets ' + r.status + ': ' + ((j.error && j.error.message) || ''));
  return j;
}
const lastCol = () => String.fromCharCode(64 + COLUMNS.length); // 24 cols -> X (comment)
// Row 1 is a header only when A1 is lead_id. A sheet that starts with a lead is read from row 1.
function hasLeadHeader(rows) { return rows.length > 0 && String((rows[0] && rows[0][0]) || '').trim().toLowerCase() === 'lead_id'; }
function rowsToLeads(values) { const rows = Array.isArray(values) ? values : []; return rows.slice(hasLeadHeader(rows) ? 1 : 0).filter((r) => r && String(r[0] || '').trim()).map(rowToObj); }
function leadRowNumber(columnA, id) { const rows = Array.isArray(columnA) ? columnA : []; const start = hasLeadHeader(rows) ? 1 : 0;
  const i = rows.slice(start).findIndex((r) => r && r[0] === id); return i < 0 ? 0 : i + start + 1; }
const rng = (a) => encodeURIComponent("'" + tab() + "'!" + a);

/* ---------- mock ---------- */
function mockFile() { return process.env.LEADS_MOCK_FILE || '/tmp/leads-mock.json'; }
function mockLoad() {
  const f = mockFile();
  if (!fs.existsSync(f)) {
    const seedPath = [process.env.LEADS_SEED_FILE, path.join(__dirname, 'leads-seed.json')].filter(Boolean).find((p) => fs.existsSync(p));
    fs.writeFileSync(f, seedPath ? fs.readFileSync(seedPath) : '[]');
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
function mockSave(rows) { fs.writeFileSync(mockFile(), JSON.stringify(rows, null, 1)); }

/* ---------- cache (crm reads) ---------- */
let cache = null; const TTL = 60e3;

async function listLeads({ fresh = false } = {}) {
  if (!fresh && cache && cache.at > Date.now() - TTL) return { leads: cache.leads, cachedAt: cache.at, cached: true };
  let leads;
  if (backend() === 'unconfigured') throw new Error('leads store not configured');
  if (backend() === 'airtable') leads = await listAirtableLeads();
  else if (backend() === 'mock') leads = mockLoad();
  else {
    const j = await gapi('GET', '/values/' + rng('A1:' + lastCol()));
    leads = rowsToLeads(j.values);
  }
  cache = { leads, at: Date.now() };
  return { leads, cachedAt: cache.at, cached: false };
}

async function appendLead(o) {
  if (backend() === 'unconfigured') throw new Error('leads store not configured');
  const lead = { ...o, lead_id: newId(), created_at: dubaiNow(), updated_at: dubaiNow(), status: o.status || 'new' };
  if (backend() === 'airtable') { const saved = await appendAirtableLead(lead); cache = null; return saved; }
  if (backend() === 'mock') { const rows = mockLoad(); rows.unshift(rowToObj(objToRow(lead))); mockSave(rows); }
  else await gapi('POST', '/values/' + rng('A1:' + lastCol()) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [objToRow(lead)] });
  cache = null; return lead;
}

async function updateLead(id, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Object.assign(new Error('bad body'), { code: 400 });
  if ('next_action' in patch && !('next_action_date' in patch)) patch = { ...patch, next_action_date: patch.next_action };
  const clean = {}; for (const k of EDITABLE) if (k in patch) clean[k] = String(patch[k] ?? '').trim();
  const bad = (m) => Object.assign(new Error(m), { code: 400 });
  if (!Object.keys(clean).length) throw bad('nothing to update');
  if ('status' in clean && !STATUSES.includes(clean.status)) throw bad('bad status');
  if ('owner' in clean && !OWNERS().includes(clean.owner)) throw bad('bad owner');
  if ('next_action_date' in clean && clean.next_action_date && !validDate(clean.next_action_date)) throw bad('bad date');
  if ('notes' in clean && (clean.notes.length > MAX_NOTES || !noCtl(clean.notes))) throw bad('bad notes');
  if ('comment' in clean && (clean.comment.length > MAX_COMMENT || !noCtl(clean.comment))) throw bad('bad comment');
  if ('name' in clean && (!clean.name || clean.name.length > MAX_NAME || !plainName(clean.name))) throw bad('bad name');
  clean.updated_at = dubaiNow();
  if (backend() === 'unconfigured') throw new Error('leads store not configured');
  if (backend() === 'airtable') { const saved = await updateAirtableLead(id, clean); cache = null; return saved; }
  if (backend() === 'mock') {
    const rows = mockLoad(); const i = rows.findIndex((r) => r.lead_id === id);
    if (i < 0) throw Object.assign(new Error('not found'), { code: 404 });
    rows[i] = { ...rows[i], ...clean }; mockSave(rows); cache = null; return rows[i];
  }
  // Find the row, then re-read it and confirm its lead_id right before writing, so a Sheet that was sorted or
  // edited in between can never get the wrong row overwritten. One retry, then 409.
  for (let attempt = 0; attempt < 2; attempt++) {
    const ids = await gapi('GET', '/values/' + rng('A1:A'));
    const rowNo = leadRowNumber(ids.values, id);
    if (!rowNo) throw Object.assign(new Error('not found'), { code: 404 });
    const a1 = 'A' + rowNo + ':' + lastCol() + rowNo;
    const cur = await gapi('GET', '/values/' + rng(a1));
    const row = (cur.values || [[]])[0] || [];
    if (row[0] !== id) continue;
    const merged = { ...rowToObj(row), ...clean };
    await gapi('PUT', '/values/' + rng(a1) + '?valueInputOption=RAW', { values: [objToRow(merged)] });
    cache = null; return merged;
  }
  throw Object.assign(new Error('row moved, please retry'), { code: 409 });
}

async function sheetNumericId() {
  const meta = await gapi('GET', '?fields=sheets.properties');
  const found = (meta.sheets || []).find((sheet) => sheet.properties && sheet.properties.title === tab());
  if (!found) throw new Error('leads tab not found');
  return found.properties.sheetId;
}

async function deleteLead(id) {
  if (!id) throw Object.assign(new Error('bad id'), { code: 400 });
  if (backend() === 'unconfigured') throw new Error('leads store not configured');
  if (backend() === 'airtable') { const removed = await deleteAirtableLead(id); cache = null; return removed; }
  if (backend() === 'mock') {
    const rows = mockLoad();
    const index = rows.findIndex((row) => row.lead_id === id);
    if (index < 0) throw Object.assign(new Error('not found'), { code: 404 });
    const [removed] = rows.splice(index, 1);
    mockSave(rows);
    cache = null;
    return { lead_id: removed.lead_id };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const ids = await gapi('GET', '/values/' + rng('A1:A'));
    const rowNo = leadRowNumber(ids.values, id);
    if (!rowNo) throw Object.assign(new Error('not found'), { code: 404 });
    const cur = await gapi('GET', '/values/' + rng('A' + rowNo + ':A' + rowNo));
    const cell = ((cur.values || [[]])[0] || [])[0];
    if (cell !== id) continue;
    await gapi('POST', ':batchUpdate', {
      requests: [{ deleteDimension: { range: { sheetId: await sheetNumericId(), dimension: 'ROWS', startIndex: rowNo - 1, endIndex: rowNo } } }],
    });
    cache = null;
    return { lead_id: id };
  }
  throw Object.assign(new Error('row moved, please retry'), { code: 409 });
}

// one-time import (e.g. Bitrix): keeps given created_at/lead_id, skips rows whose bitrix_id already exists
async function bulkImport(list) {
  const { leads } = await listLeads({ fresh: true });
  const have = new Set(leads.map((l) => l.bitrix_id).filter(Boolean));
  const add = list.filter((l) => !l.bitrix_id || !have.has(String(l.bitrix_id)))
    .map((l) => rowToObj(objToRow({ lead_id: newId(), created_at: dubaiNow(), status: 'new', ...l, updated_at: dubaiNow() })));
  if (!add.length) return { added: 0, skipped: list.length };
  if (backend() === 'mock') mockSave([...add, ...leads]);
  else await gapi('POST', '/values/' + rng('A1:' + lastCol()) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: add.map(objToRow) });
  cache = null; return { added: add.length, skipped: list.length - add.length };
}

// Same person, several rows (form re-submits, Bitrix + website): keep the newest row per phone,
// attach duplicate_count and duplicate_ids. Rows without a phone are kept as they are.
function dedupeByPhone(leads) {
  const key = (p) => normPhone(p).slice(1);
  const byPhone = new Map(), out = [];
  const sorted = [...leads].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const l of sorted) {
    const k = key(l.phone);
    if (k.length < 7) { out.push({ ...l, duplicate_count: 0, duplicate_ids: [] }); continue; }
    const first = byPhone.get(k);
    if (first) { first.duplicate_count++; first.duplicate_ids.push(l.lead_id); continue; }
    const row = { ...l, duplicate_count: 0, duplicate_ids: [] }; byPhone.set(k, row); out.push(row);
  }
  return out;
}

function clearCache() { cache = null; }
export { clearCache, objToRow, rowToObj, gapi, rng, lastCol, newId, normPhone, rowsToLeads, leadRowNumber, MAX_NAME, MAX_COMMENT, MAX_NOTES, OWNERS, dedupeByPhone, bulkImport,  COLUMNS, STATUSES, EDITABLE, backend, listLeads, appendLead, updateLead, deleteLead, dubaiNow, accessToken };
