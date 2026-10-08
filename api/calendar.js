// GET /api/calendar — signed-in CRM users.
//   Default: { configured, embedUrl, events: {enabled, calendars} } — the Google Calendar embed URL from env (not baked into the bundle).
//   ?events=1 (also /api/calendar/events via vercel.json): the next events read server-side with the service account
//   (GOOGLE_SA_EMAIL / GOOGLE_SA_KEY, scope calendar.readonly). This works in any browser, signed into Google or not,
//   but needs (a) the Google Calendar API enabled in the service account's Cloud project and (b) each calendar shared
//   with the service account ("See all event details"). Errors come back as { ok:false, setup:<code>, message } with 200,
//   so the tab can show what to do instead of breaking.
// Env: GOOGLE_CALENDAR_EMBED_URL ("Embed code" src) or GOOGLE_CALENDAR_ID; GOOGLE_CALENDAR_IDS (comma list for events;
//      default = the src calendars of the embed URL, else GOOGLE_CALENDAR_ID).
import crypto from 'crypto';
import { requireAuth, setCors, handleOptions, readBody } from './_lib/auth.js';
import { saToken, saConfigured, saEmail } from './_lib/google-sa.js';
import { agentUrl, calendarTaskPrompt, grokConnected, plannerBotId, sendGrokTask } from './_lib/grok-task.js';

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
};

export function calendarEmbedUrl(env = process.env) {
  const raw = String(env.GOOGLE_CALENDAR_EMBED_URL || '').trim();
  if (raw) {
    const src = raw.match(/src="([^"]+)"/)?.[1] ?? raw;
    let url;
    try {
      url = new URL(src.replace(/&amp;/g, '&'));
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' || !url.pathname.startsWith('/calendar/')) return null;
    if (!url.searchParams.get('ctz')) url.searchParams.set('ctz', 'Asia/Dubai');
    return url.href;
  }
  const id = String(env.GOOGLE_CALENDAR_ID || '').trim();
  if (!id) return null;
  const url = new URL('https://calendar.google.com/calendar/embed');
  url.searchParams.set('src', id);
  url.searchParams.set('ctz', 'Asia/Dubai');
  return url.href;
}

export function calendarIds(env = process.env) {
  const list = String(env.GOOGLE_CALENDAR_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length) return list.slice(0, 10);
  const embed = calendarEmbedUrl(env);
  if (embed) {
    const srcs = new URL(embed).searchParams.getAll('src').map((s) => s.trim()).filter(Boolean);
    if (srcs.length) return srcs.slice(0, 10);
  }
  const id = String(env.GOOGLE_CALENDAR_ID || '').trim();
  return id ? [id] : [];
}

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const isHoliday = (id) => /#holiday@group\.v\.calendar\.google\.com$/.test(id);

function classify(status, message) {
  const m = String(message || '');
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m)) return 'api_disabled';
  if (status === 404 || (status === 403 && /forbidden|not have permission|insufficient/i.test(m))) return 'not_shared';
  return 'error';
}

async function readCalendar(token, id, timeMin, timeMax) {
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '100', timeZone: 'Asia/Dubai' });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`, {
    headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { id, ok: false, setup: classify(r.status, j.error && j.error.message), status: r.status };
  return {
    id, ok: true, summary: j.summary || id,
    events: (j.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({
      id: e.id, calendar: id, title: e.summary || '(busy)', location: e.location || '', allDay: !!(e.start && e.start.date),
      start: (e.start && (e.start.dateTime || e.start.date)) || '', end: (e.end && (e.end.dateTime || e.end.date)) || '',
      link: typeof e.htmlLink === 'string' && e.htmlLink.startsWith('https://www.google.com/calendar/') ? e.htmlLink : '',
    })),
  };
}

const MESSAGES = {
  no_calendars: 'No calendar is configured (GOOGLE_CALENDAR_IDS, GOOGLE_CALENDAR_EMBED_URL or GOOGLE_CALENDAR_ID).',
  sa_not_configured: 'The Google service account is not configured on the CRM.',
  api_disabled: 'The Google Calendar API is not enabled in the service account’s Google Cloud project.',
  not_shared: 'The calendar is not shared with the CRM service account yet.',
  error: 'Google Calendar could not be read right now.',
};

export async function calendarEvents(env = process.env, days = 30) {
  const ids = calendarIds(env);
  const account = saEmail(env);
  if (!ids.length) return { ok: false, setup: 'no_calendars', message: MESSAGES.no_calendars, account };
  if (!saConfigured(env)) return { ok: false, setup: 'sa_not_configured', message: MESSAGES.sa_not_configured, account };
  let token;
  try { token = await saToken(SCOPE); } catch (e) { return { ok: false, setup: 'error', message: MESSAGES.error, account }; }
  const now = new Date();
  const timeMin = new Date(now.getTime() - 12 * 3600e3).toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 3600e3).toISOString();
  const results = await Promise.all(ids.map((id) => readCalendar(token, id, timeMin, timeMax).catch(() => ({ id, ok: false, setup: 'error' }))));
  const own = results.filter((r) => !isHoliday(r.id));
  const okOwn = own.filter((r) => r.ok);
  const calendars = results.map((r) => ({ id: r.id, ok: r.ok, summary: r.summary || r.id, setup: r.setup || null }));
  // Holiday calendars are public, so they can succeed even when Mahmoud's own calendars are not shared yet.
  if (own.length && !okOwn.length) {
    const setup = own.some((r) => r.setup === 'api_disabled') ? 'api_disabled' : own.some((r) => r.setup === 'not_shared') ? 'not_shared' : 'error';
    return { ok: false, setup, message: MESSAGES[setup], account, calendars };
  }
  if (!results.some((r) => r.ok)) {
    const setup = results.some((r) => r.setup === 'api_disabled') ? 'api_disabled' : 'error';
    return { ok: false, setup, message: MESSAGES[setup], account, calendars };
  }
  const events = results.filter((r) => r.ok).flatMap((r) => r.events).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { ok: true, account, calendars, events: events.slice(0, 300), timeMin, timeMax };
}

export function followUpRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad_body' };
  const leadId = String(body.leadId || '').trim();
  const date = String(body.date || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return { ok: false, error: 'bad_id' };
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'bad_date' };
    const t = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== date) return { ok: false, error: 'bad_date' };
  }
  const plain = (v, max) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  return { ok: true, leadId, date, name: plain(body.name, 120), project: plain(body.project, 160) };
}

/** Stable event id so saving the same lead again moves the event instead of adding another. */
export function followUpEventId(leadId) {
  return crypto.createHash('sha256').update(String(leadId)).digest('hex').slice(0, 32);
}

/** 30 minutes at 10:00 Dubai time on the follow-up date. */
export function buildFollowUpEvent({ leadId, date, name, project }) {
  const who = name || 'Lead';
  return {
    id: followUpEventId(leadId),
    summary: `Follow up: ${who}`.slice(0, 200),
    description: project || undefined,
    start: { dateTime: `${date}T10:00:00`, timeZone: 'Asia/Dubai' },
    end: { dateTime: `${date}T10:30:00`, timeZone: 'Asia/Dubai' },
    extendedProperties: { private: { leadId: String(leadId), source: 'crm-follow-up' } },
  };
}

async function gcal(token, method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j };
}

function googleMessage(result) {
  const err = result.body && result.body.error;
  return (err && (err.message || err.status)) || '';
}

async function writeFollowUp(token, calendarId, input) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const eventId = followUpEventId(input.leadId);
  if (!input.date) {
    const removed = await gcal(token, 'DELETE', `${base}/${eventId}`);
    return { ok: removed.ok || removed.status === 404 || removed.status === 410, removed: removed.ok, status: removed.status, detail: googleMessage(removed) };
  }
  const event = buildFollowUpEvent(input);
  const created = await gcal(token, 'POST', base, event);
  if (created.ok) return { ok: true, id: created.body.id || eventId, status: created.status };
  if (created.status !== 409) return { ok: false, status: created.status, detail: googleMessage(created) };
  const updated = await gcal(token, 'PUT', `${base}/${eventId}`, event);
  if (updated.ok) return { ok: true, id: updated.body.id || eventId, status: updated.status };
  return { ok: false, status: updated.status, detail: googleMessage(updated) };
}

export async function upsertFollowUp(env, input) {
  const direct = await upsertWithServiceAccount(env, input);
  if (direct.ok || !grokConnected(env)) return direct;
  const bot = plannerBotId(env);
  const sent = await sendGrokTask(calendarTaskPrompt(input), env, bot).catch(() => false);
  if (!sent) return direct;
  return { ok: true, via: 'planner', removed: !input.date, account: 'mahmoud1594@gmail.com', url: agentUrl(bot) };
}

async function upsertWithServiceAccount(env, input) {
  const ids = calendarIds(env).filter((id) => !isHoliday(id));
  const account = saEmail(env);
  if (!ids.length) return { ok: false, setup: 'no_calendars', message: MESSAGES.no_calendars, account };
  if (!saConfigured(env)) return { ok: false, setup: 'sa_not_configured', message: MESSAGES.sa_not_configured, account };
  let token;
  try { token = await saToken(WRITE_SCOPE); } catch (e) { return { ok: false, setup: 'error', message: MESSAGES.error, account }; }
  let last = { status: 0, detail: '' };
  for (const calendarId of ids) {
    const saved = await writeFollowUp(token, calendarId, input);
    if (saved.ok) return { ok: true, id: saved.id || '', removed: Boolean(saved.removed), account };
    last = saved;
    if (saved.status !== 403 && saved.status !== 404) break;
  }
  const setup = classify(last.status, last.detail);
  const share = account
    ? ` Share this calendar with ${account} as Make changes to events, then set the date again.`
    : ' Share this calendar with the CRM account as Make changes to events, then set the date again.';
  const message = (setup === 'not_shared' || last.status === 403)
    ? `The follow-up was saved on the lead, but Google Calendar refused the event.${share}`
    : (last.detail || MESSAGES[setup] || MESSAGES.error);
  return { ok: false, setup, message, account };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
  if (req.method === 'POST') {
    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : await readBody(req); } catch { return send(res, 400, { ok: false, error: 'bad_json' }); }
    const input = followUpRequest(body);
    if (!input.ok) return send(res, 400, input);
    try { return send(res, 200, await upsertFollowUp(process.env, input)); }
    catch (e) { console.error('follow-up calendar failed', e.message); return send(res, 502, { ok: false, error: 'store_unavailable' }); }
  }
  const sp = new URL(req.url, 'http://x').searchParams;
  if (/^(1|true)$/.test(String((req.query && req.query.events) || sp.get('events') || ''))) {
    const days = Math.min(90, Math.max(1, Number(sp.get('days')) || 30));
    return send(res, 200, await calendarEvents(process.env, days));
  }
  const embedUrl = calendarEmbedUrl();
  return send(res, 200, { ok: true, configured: Boolean(embedUrl), embedUrl, events: { enabled: saConfigured() && calendarIds().length > 0, account: saEmail() } });
}
