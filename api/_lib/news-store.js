// WhatsApp project news, one card per project. Backends:
//   "kv"   Upstash Redis / Vercel KV over its REST API (KV_REST_API_URL + KV_REST_API_TOKEN,
//          or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). No extra npm dependency.
//   "sheets" a "News" tab (NEWS_TAB) in the Leads spreadsheet (or NEWS_SHEET_ID), through the same service account
//          as Leads. Used when no KV store is connected. The Leads tab is never read or written here.
//   "mock" a JSON file (NEWS_MOCK_FILE, default /tmp/news-mock.json) for dev and previews. Never used in production.
// Keys: news:cards (hash key -> card JSON), news:msgs:<key> (list, newest pushed first), news:seen:<id> (dedupe, 90 days).
import crypto from 'crypto';
import fs from 'fs';
import { canonicalDeveloper, projectKey } from './developers.js';
import { accessToken } from './leads-store.js';

const MAX_PER_CARD = Number(process.env.NEWS_MAX_PER_CARD) || 300;
const SEEN_TTL_S = 90 * 24 * 3600;
const MAX_BATCH = 100;
const MAX_TEXT = 8000;
const MAX_MEDIA = 20;

function kvCreds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function backend() {
  const b = (process.env.NEWS_BACKEND || '').toLowerCase();
  if (b) return b;
  if (kvCreds()) return 'kv';
  if (sheetId() && process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_KEY) return 'sheets';
  return process.env.VERCEL_ENV === 'production' ? 'unconfigured' : 'mock';
}

function sheetId() {
  return process.env.NEWS_SHEET_ID || process.env.LEADS_SHEET_ID || '';
}

// ---------- sanitising ----------

const HIDDEN = '[number hidden]';
const INTL = /(?:\+|\b00)\s?\d(?:[\s().-]?\d){7,14}/g;
const LOCAL = /\b[059]\d(?:[\s-]?\d){7,13}\b/g;
const WA_LINK = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?\d+[^\s]*/gi;

/** Removes phone numbers (and wa.me links that carry one) from free text. */
export function redactPhones(value) {
  return String(value ?? '')
    .replace(WA_LINK, HIDDEN)
    .replace(INTL, HIDDEN)
    .replace(LOCAL, HIDDEN);
}

function clean(value, max) {
  return redactPhones(String(value ?? '').replace(/\u0000/g, '').trim()).slice(0, max);
}

function senderLabel(value) {
  const text = clean(value, 80);
  if (text.includes(HIDDEN) || /\d{5,}/.test(text.replace(/[\s().+-]/g, ''))) return 'Hidden';
  return text;
}

const IMAGE = /\.(?:jpe?g|png|gif|webp|avif|heic)(?:$|[?#])/i;
const VIDEO = /\.(?:mp4|mov|webm|3gp|m4v)(?:$|[?#])/i;

function mediaKind(url, mime) {
  const type = String(mime || '').toLowerCase();
  if (type.startsWith('image/') || IMAGE.test(url)) return 'image';
  if (type.startsWith('video/') || VIDEO.test(url)) return 'video';
  return 'file';
}

function mediaName(url, name) {
  const given = clean(name, 160);
  if (given) return given;
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return last.slice(0, 160) || 'Attachment';
  } catch {
    return 'Attachment';
  }
}

function parseMedia(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out = [];
  for (const item of list.slice(0, MAX_MEDIA)) {
    const url = typeof item === 'string' ? item.trim() : String(item?.url ?? '').trim();
    if (!url || url.length > 2000) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'https:') continue;
    const mime = typeof item === 'object' ? item?.mime || item?.type : '';
    out.push({ url: parsed.href, kind: mediaKind(parsed.href, mime), name: mediaName(parsed.href, typeof item === 'object' ? item?.name : '') });
  }
  return out;
}

function parseTimestamp(raw) {
  if (raw == null || raw === '') return new Date().toISOString();
  let ms;
  if (typeof raw === 'number' || /^\d+(?:\.\d+)?$/.test(String(raw).trim())) {
    const n = Number(raw);
    ms = n < 1e12 ? n * 1000 : n;
  } else {
    ms = Date.parse(String(raw));
  }
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  if (year < 2015 || ms > Date.now() + 24 * 3600e3) return null;
  return date.toISOString();
}

/** Validates one ingest item. Returns { message } or { error }. */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'item_not_object' };
  const project = clean(raw.project, 160);
  if (!project) return { error: 'project_required' };
  const developer = canonicalDeveloper(clean(raw.developer, 120));
  const text = clean(raw.text, MAX_TEXT);
  const media = parseMedia(raw.media_urls ?? raw.media);
  if (!text && media.length === 0) return { error: 'text_or_media_required' };
  const timestamp = parseTimestamp(raw.timestamp);
  if (!timestamp) return { error: 'bad_timestamp' };
  const group = clean(raw.group, 120);
  const sender = senderLabel(raw.sender_hidden);
  const key = projectKey(developer, project);
  const external = raw.id != null ? String(raw.id).slice(0, 200) : '';
  const id = crypto
    .createHash('sha256')
    .update(external ? `ext|${external}` : [key, timestamp, group, text, media.map((m) => m.url).join(' ')].join('|'))
    .digest('hex')
    .slice(0, 24);
  return {
    message: { id, key, developer, project, group, sender, text, media, timestamp, received_at: new Date().toISOString() },
  };
}

export function parseIngestBody(body) {
  const items = Array.isArray(body) ? body : Array.isArray(body?.messages) ? body.messages : body ? [body] : [];
  if (items.length === 0) return { error: 'empty_body' };
  if (items.length > MAX_BATCH) return { error: `max_${MAX_BATCH}_messages_per_request` };
  return { items };
}

// ---------- KV ----------

async function kv(commands) {
  const creds = kvCreds();
  if (!creds) throw Object.assign(new Error('kv_unconfigured'), { code: 502 });
  const response = await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw Object.assign(new Error(`kv_http_${response.status}`), { code: 502 });
  const rows = await response.json();
  return rows.map((row) => {
    if (row && row.error) throw Object.assign(new Error(`kv_${row.error}`), { code: 502 });
    return row ? row.result : null;
  });
}

function hashPairs(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    const pairs = [];
    for (let i = 0; i + 1 < result.length; i += 2) pairs.push([result[i], result[i + 1]]);
    return pairs;
  }
  return Object.entries(result);
}

function parseJson(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function mergedCard(existing, message) {
  const base = existing || {
    key: message.key,
    developer: message.developer,
    project: message.project,
    created_at: message.received_at,
    last_at: message.timestamp,
    count: 0,
  };
  return {
    ...base,
    developer: base.developer || message.developer,
    last_at: message.timestamp > base.last_at ? message.timestamp : base.last_at,
    count: (Number(base.count) || 0) + 1,
  };
}

async function kvIngest(messages) {
  const results = [];
  for (const message of messages) {
    const [fresh, current] = await kv([
      ['SET', `news:seen:${message.id}`, '1', 'NX', 'EX', String(SEEN_TTL_S)],
      ['HGET', 'news:cards', message.key],
    ]);
    if (fresh !== 'OK') {
      results.push({ id: message.id, key: message.key, status: 'duplicate' });
      continue;
    }
    const existing = parseJson(current);
    const card = mergedCard(existing, message);
    await kv([
      ['HSET', 'news:cards', message.key, JSON.stringify(card)],
      ['LPUSH', `news:msgs:${message.key}`, JSON.stringify(message)],
      ['LTRIM', `news:msgs:${message.key}`, '0', String(MAX_PER_CARD - 1)],
    ]);
    results.push({ id: message.id, key: message.key, status: existing ? 'added' : 'new_card' });
  }
  return results;
}

async function kvBoard(limit) {
  const [all] = await kv([['HGETALL', 'news:cards']]);
  const cards = hashPairs(all)
    .map(([, value]) => parseJson(value))
    .filter(Boolean);
  if (cards.length === 0) return [];
  const lists = await kv(cards.map((card) => ['LRANGE', `news:msgs:${card.key}`, '0', String(limit - 1)]));
  return cards.map((card, index) => ({
    ...card,
    messages: (lists[index] || []).map(parseJson).filter(Boolean),
  }));
}

// ---------- mock ----------

const mockFile = () => process.env.NEWS_MOCK_FILE || '/tmp/news-mock.json';

function mockRead() {
  try {
    const data = JSON.parse(fs.readFileSync(mockFile(), 'utf8'));
    return { cards: data.cards || {}, msgs: data.msgs || {}, seen: data.seen || {} };
  } catch {
    return { cards: {}, msgs: {}, seen: {} };
  }
}

function mockWrite(data) {
  fs.writeFileSync(mockFile(), JSON.stringify(data));
}

function mockIngest(messages) {
  const data = mockRead();
  const results = [];
  for (const message of messages) {
    if (data.seen[message.id]) {
      results.push({ id: message.id, key: message.key, status: 'duplicate' });
      continue;
    }
    data.seen[message.id] = 1;
    const existing = data.cards[message.key];
    data.cards[message.key] = mergedCard(existing, message);
    data.msgs[message.key] = [message, ...(data.msgs[message.key] || [])].slice(0, MAX_PER_CARD);
    results.push({ id: message.id, key: message.key, status: existing ? 'added' : 'new_card' });
  }
  mockWrite(data);
  return results;
}

function mockBoard(limit) {
  const data = mockRead();
  return Object.values(data.cards).map((card) => ({ ...card, messages: (data.msgs[card.key] || []).slice(0, limit) }));
}

// ---------- Google Sheets ----------

export const SHEET_COLUMNS = ['id', 'key', 'developer', 'project', 'group', 'sender', 'text', 'media', 'timestamp', 'received_at'];
const newsTab = () => process.env.NEWS_TAB || 'News';
const sheetRange = (a1) => encodeURIComponent(`'${newsTab()}'!${a1}`);
const lastSheetCol = String.fromCharCode(64 + SHEET_COLUMNS.length);
let tabReady = false;

async function sheets(method, path, body) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`sheets_${response.status}: ${json?.error?.message || ''}`), { code: 502 });
  return json;
}

async function ensureNewsTab() {
  if (tabReady) return;
  const meta = await sheets('GET', '?fields=sheets.properties.title');
  const titles = (meta.sheets || []).map((sheet) => sheet?.properties?.title);
  if (!titles.includes(newsTab())) {
    await sheets('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: newsTab() } } }] });
    await sheets('PUT', `/values/${sheetRange(`A1:${lastSheetCol}1`)}?valueInputOption=RAW`, { values: [SHEET_COLUMNS] });
  }
  tabReady = true;
}

export function messageToRow(message) {
  return SHEET_COLUMNS.map((column) => (column === 'media' ? JSON.stringify(message.media || []) : String(message[column] ?? '')));
}

export function rowToMessage(row) {
  const out = {};
  SHEET_COLUMNS.forEach((column, index) => {
    out[column] = row?.[index] == null ? '' : String(row[index]);
  });
  if (!out.id || !out.key) return null;
  out.media = Array.isArray(parseJson(out.media)) ? parseJson(out.media) : [];
  return out;
}

/** Groups sheet rows into cards, oldest row first so the card keeps the first name it was seen under. */
export function cardsFromMessages(messages, limit) {
  const cards = new Map();
  const ordered = [...messages].sort((a, b) => (a.received_at < b.received_at ? -1 : a.received_at > b.received_at ? 1 : 0));
  for (const message of ordered) {
    const card = mergedCard(cards.get(message.key), message);
    card.messages = [...(cards.get(message.key)?.messages || []), message];
    cards.set(message.key, card);
  }
  return [...cards.values()].map((card) => ({ ...card, messages: [...card.messages].sort(byNewest).slice(0, limit) }));
}

async function sheetMessages() {
  await ensureNewsTab();
  const json = await sheets('GET', `/values/${sheetRange(`A2:${lastSheetCol}`)}`);
  return (json.values || []).map(rowToMessage).filter(Boolean);
}

async function sheetIngest(messages) {
  const existing = await sheetMessages();
  const seen = new Set(existing.map((message) => message.id));
  const keys = new Set(existing.map((message) => message.key));
  const results = [];
  const rows = [];
  for (const message of messages) {
    if (seen.has(message.id)) {
      results.push({ id: message.id, key: message.key, status: 'duplicate' });
      continue;
    }
    seen.add(message.id);
    results.push({ id: message.id, key: message.key, status: keys.has(message.key) ? 'added' : 'new_card' });
    keys.add(message.key);
    rows.push(messageToRow(message));
  }
  if (rows.length) {
    await sheets('POST', `/values/${sheetRange(`A1:${lastSheetCol}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      values: rows,
    });
  }
  return results;
}

async function sheetBoard(limit) {
  return cardsFromMessages(await sheetMessages(), Math.min(limit, MAX_PER_CARD));
}

// ---------- public ----------

function assertConfigured() {
  const b = backend();
  if (b === 'kv' || b === 'sheets' || b === 'mock') return b;
  throw Object.assign(new Error('news_store_unconfigured'), { code: 502 });
}

export async function ingest(messages) {
  const b = assertConfigured();
  if (b === 'kv') return kvIngest(messages);
  if (b === 'sheets') return sheetIngest(messages);
  return mockIngest(messages);
}

function byNewest(a, b) {
  return a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;
}

export async function board({ limit = 100 } = {}) {
  const b = assertConfigured();
  const cards = b === 'kv' ? await kvBoard(limit) : b === 'sheets' ? await sheetBoard(limit) : mockBoard(limit);
  return cards
    .map((card) => ({ ...card, messages: [...card.messages].sort(byNewest) }))
    .sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
}
