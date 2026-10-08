// Leads store shared by www (/api/lead) and crm (/api/leads).
// Backend "sheets": Google Sheets API via a service account (no extra deps; RS256 JWT with node:crypto).
// Backend "mock": a JSON file (seeded from leads-seed.json), for previews and tests. Never used in production.
// Env: LEADS_BACKEND=sheets|mock, LEADS_SHEET_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_KEY (PEM, \n escapes ok),
//      LEADS_TAB (default "Leads"), LEADS_MOCK_FILE (default /tmp/leads-mock.json).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COLUMNS = ['lead_id','created_at','source','name','phone','email','interest','project_or_community','budget_aed','beds',
  'country_program','message','status','owner','next_action_date','notes','utm_source','utm_campaign','page_url','consent',
  'bitrix_id','deal_url','updated_at','comment'];
const STATUSES = ['new','contacted','qualified','viewing','won','lost'];
const EDITABLE = ['name','comment','status','owner','next_action_date','notes','phone','email','interest','project_or_community','budget_aed','beds'];
const backend = () => (process.env.LEADS_BACKEND || (process.env.LEADS_SHEET_ID ? 'sheets' : 'mock')).toLowerCase();
const tab = () => process.env.LEADS_TAB || 'Leads';

function dubaiNow() { // ISO with +04:00
  const d = new Date(Date.now() + 4 * 3600e3);
  return d.toISOString().replace(/\.\d+Z$/, '+04:00');
}
function newId() { return crypto.randomUUID(); }
function rowToObj(r) { const o = {}; COLUMNS.forEach((c, i) => { o[c] = r[i] == null ? '' : String(r[i]); }); return o; }
function objToRow(o) { return COLUMNS.map((c) => (o[c] == null ? '' : String(o[c]))); }
function hasLeadHeader(rows) {
  return rows.length > 0 && String((rows[0] && rows[0][0]) || '').trim().toLowerCase() === 'lead_id';
}
function rowsToLeads(values) {
  const rows = Array.isArray(values) ? values : [];
  return rows.slice(hasLeadHeader(rows) ? 1 : 0).filter((r) => r && String(r[0] || '').trim()).map(rowToObj);
}
function leadRowNumber(columnA, id) {
  const rows = Array.isArray(columnA) ? columnA : [];
  const start = hasLeadHeader(rows) ? 1 : 0;
  const i = rows.slice(start).findIndex((r) => r && r[0] === id);
  return i < 0 ? 0 : i + start + 1;
}

/* ---------- Google auth ---------- */
let tok = null;
async function accessToken() {
  if (tok && tok.exp > Date.now() + 60e3) return tok.value;
  const email = process.env.GOOGLE_SA_EMAIL, key = (process.env.GOOGLE_SA_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('GOOGLE_SA_EMAIL / GOOGLE_SA_KEY not set');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }) });
  const j = await r.json(); if (!r.ok) throw new Error('google token: ' + (j.error_description || j.error || r.status));
  tok = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return tok.value;
}
async function gapi(method, p, body) {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + process.env.LEADS_SHEET_ID + p;
  const r = await fetch(url, { method, headers: { authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('sheets ' + r.status + ': ' + ((j.error && j.error.message) || ''));
  return j;
}
const lastCol = () => String.fromCharCode(64 + COLUMNS.length); // 24 cols -> X; comment is the last column
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
  if (backend() === 'mock') leads = mockLoad();
  else {
    const j = await gapi('GET', '/values/' + rng('A1:' + lastCol()));
    leads = rowsToLeads(j.values);
  }
  cache = { leads, at: Date.now() };
  return { leads, cachedAt: cache.at, cached: false };
}

async function appendLead(o) {
  const lead = { ...o, lead_id: newId(), created_at: dubaiNow(), updated_at: dubaiNow(), status: o.status || 'new' };
  if (backend() === 'mock') { const rows = mockLoad(); rows.unshift(rowToObj(objToRow(lead))); mockSave(rows); }
  else await gapi('POST', '/values/' + rng('A1:' + lastCol()) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [objToRow(lead)] });
  cache = null; return lead;
}

async function updateLead(id, patch) {
  const clean = {}; for (const k of EDITABLE) if (k in patch) clean[k] = String(patch[k] ?? '').slice(0, k === 'comment' ? 4000 : 2000);
  if ('name' in clean) clean.name = clean.name.trim().slice(0, 200);
  if ('status' in clean && !STATUSES.includes(clean.status)) throw Object.assign(new Error('bad status'), { code: 400 });
  if (!Object.keys(clean).length) throw Object.assign(new Error('nothing to update'), { code: 400 });
  clean.updated_at = dubaiNow();
  if (backend() === 'mock') {
    const rows = mockLoad(); const i = rows.findIndex((r) => r.lead_id === id);
    if (i < 0) throw Object.assign(new Error('not found'), { code: 404 });
    rows[i] = { ...rows[i], ...clean }; mockSave(rows); cache = null; return rows[i];
  }
  const ids = await gapi('GET', '/values/' + rng('A1:A'));
  const rowNo = leadRowNumber(ids.values, id);
  if (!rowNo) throw Object.assign(new Error('not found'), { code: 404 });
  const cur = await gapi('GET', '/values/' + rng('A' + rowNo + ':' + lastCol() + rowNo));
  const merged = { ...rowToObj((cur.values || [[]])[0]), ...clean };
  await gapi('PUT', '/values/' + rng('A' + rowNo + ':' + lastCol() + rowNo) + '?valueInputOption=RAW', { values: [objToRow(merged)] });
  cache = null; return merged;
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

module.exports = { bulkImport,  COLUMNS, STATUSES, EDITABLE, backend, listLeads, appendLead, updateLead, dubaiNow };
