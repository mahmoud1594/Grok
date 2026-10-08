// Broadcast reply intake: one contract for WhatsApp (Eazybe / WhatsApp Web), Facebook and Instagram replies.
// Pure parsing/validation here (unit-tested); Sheet I/O in ingestReplies(). Used by POST /api/broadcast-reply.
import crypto from 'crypto';
import { normPhone, objToRow, rowToObj, gapi, rng, lastCol, newId, dubaiNow, clearCache } from './leads-store.js';

export const CHANNELS = { whatsapp: 'whatsapp', wa: 'whatsapp', facebook: 'facebook', fb: 'facebook', messenger: 'facebook', instagram: 'instagram', ig: 'instagram' };
export const SOURCE_BY_CHANNEL = { whatsapp: 'whatsapp_broadcast', facebook: 'facebook', instagram: 'instagram' };
export const TOOL_BY_CHANNEL = { whatsapp: 'eazybe', facebook: 'meta_business_suite', instagram: 'meta_business_suite' };
export const STOP_TAB = 'StopList';
export const STOP_COLUMNS = ['added_at', 'replied_at', 'channel', 'phone', 'handle', 'name', 'campaign', 'message', 'contact_key'];
export const MAX_BATCH = 500, MAX_MESSAGE = 2000, MAX_NAME = 120, MAX_CAMPAIGN = 80, MAX_HANDLE = 80;
// <Project>-<Developer/Theme>-<YYYYMM>, e.g. Acres-OwnerMarketUpdate-202610. Not enforced (warning only).
export const CAMPAIGN_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_&. ]*-[A-Za-z0-9][A-Za-z0-9_&. ]*-20\d{2}(0[1-9]|1[0-2])$/;
const STOP_WORDS = /^(stop|stop all|stop please|please stop|unsubscribe|opt out|optout|remove me|remove|no more|cancel|الغاء|إلغاء|توقف|ستوب)[.! ]*$/i;

const strip = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
const plain = (v, max) => strip(v).replace(/[\r\n\t]+/g, ' ').replace(/[<>{}\\`]/g, '').slice(0, max).trim();

export function isStopText(msg) { return STOP_WORDS.test(String(msg || '').trim()); }

export function toDubaiIso(v) {
  const s = String(v ?? '').trim();
  if (!s) return dubaiNow();
  let d;
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.test(s)) d = new Date(s.replace(' ', 'T') + (s.length > 10 ? '' : 'T00:00') + '+04:00'); // no zone → Dubai
  else if (/^\d{10,13}$/.test(s)) d = new Date(Number(s) * (s.length === 10 ? 1000 : 1));
  else d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getTime() + 4 * 3600e3).toISOString().replace(/\.\d+Z$/, '+04:00');
}

const validPhone = (p) => /^\+\d{8,15}$/.test(p);
export function contactKey(r) { return r.phone ? r.phone.slice(1) : r.handle ? `${r.channel}:${r.handle.toLowerCase()}` : ''; }
export const idemKey = (contact, campaign) => contact + '|' + String(campaign || '').trim().toLowerCase();

/** Validate + normalise one reply. Returns { ok:true, reply } or { ok:false, error }. */
export function normaliseReply(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: 'not_an_object' };
  const channel = CHANNELS[String(x.channel || '').trim().toLowerCase()];
  if (!channel) return { ok: false, error: 'bad_channel' };
  const campaign = plain(x.campaign, MAX_CAMPAIGN + 1);
  if (!campaign) return { ok: false, error: 'missing_campaign' };
  if (campaign.length > MAX_CAMPAIGN) return { ok: false, error: 'campaign_too_long' };
  const rawPhone = String(x.phone ?? '').trim();
  const phone = rawPhone.replace(/\D/g, '').length ? normPhone(rawPhone) : '';
  if (rawPhone && !validPhone(phone)) return { ok: false, error: 'bad_phone' };
  const handle = plain(String(x.handle ?? '').replace(/^@+/, ''), MAX_HANDLE + 1);
  if (handle.length > MAX_HANDLE) return { ok: false, error: 'handle_too_long' };
  if (!phone && !handle) return { ok: false, error: 'missing_phone_or_handle' };
  if (channel === 'whatsapp' && !phone) return { ok: false, error: 'whatsapp_needs_phone' };
  const message = strip(x.message).slice(0, MAX_MESSAGE);
  const replied_at = toDubaiIso(x.replied_at);
  if (!replied_at) return { ok: false, error: 'bad_replied_at' };
  const flag = x.is_stop === true || /^(true|1|yes)$/i.test(String(x.is_stop ?? ''));
  const stopDetected = !flag && isStopText(message);
  const reply = { channel, campaign, phone, handle, name: plain(x.name, MAX_NAME), message, replied_at, is_stop: flag || stopDetected, stop_detected: stopDetected };
  reply.contact_key = contactKey(reply);
  return { ok: true, reply, campaign_format_ok: CAMPAIGN_FORMAT.test(campaign) };
}

export function handleRef(r) { return r.handle ? `${r.channel}:@${r.handle}` : ''; }

/** Lead row object (Leads tab A–X) for a reply. */
export function replyToLead(r) {
  const project = r.campaign.split('-')[0].trim();
  return {
    lead_id: newId(), created_at: r.replied_at, source: SOURCE_BY_CHANNEL[r.channel], name: r.name || (r.handle ? '@' + r.handle : ''),
    phone: r.phone, email: '', interest: '', project_or_community: project, budget_aed: '', beds: '', country_program: '',
    message: r.message, status: 'new', owner: '', next_action_date: '', notes: `Broadcast reply (${r.channel}) · ${r.campaign}`,
    utm_source: TOOL_BY_CHANNEL[r.channel], utm_campaign: r.campaign, page_url: handleRef(r), consent: '', bitrix_id: '', deal_url: '',
    updated_at: dubaiNow(), comment: '',
  };
}

/** contact key for an existing Leads row: phone digits, else the social handle stored in page_url. */
export function leadContactKey(l) {
  const d = String(l.phone || '').replace(/\D/g, '');
  if (d.length >= 7) return normPhone(l.phone).slice(1);
  const m = String(l.page_url || '').match(/^(instagram|facebook|whatsapp):@?(.+)$/);
  return m ? `${m[1]}:${m[2].trim().toLowerCase()}` : '';
}

/** Plan a batch against existing leads + stop rows (no I/O). */
export function planBatch(items, leads, stops) {
  const leadKeys = new Set(), leadByKey = new Map(), stopKeys = new Set();
  for (const l of leads) { const k = leadContactKey(l); if (!k) continue; leadKeys.add(idemKey(k, l.utm_campaign)); if (!leadByKey.has(k)) leadByKey.set(k, l.lead_id); }
  for (const s of stops) if (s.contact_key) stopKeys.add(idemKey(s.contact_key, s.campaign));
  const results = [], addLeads = [], addStops = [];
  items.forEach((x, i) => {
    const n = normaliseReply(x);
    if (!n.ok) { results.push({ i, action: 'invalid', error: n.error }); return; }
    const r = n.reply, key = idemKey(r.contact_key, r.campaign);
    const base = { i, contact: r.phone || handleRef(r), campaign: r.campaign, ...(n.campaign_format_ok ? {} : { warning: 'campaign_format' }) };
    if (r.is_stop) {
      if (stopKeys.has(key)) { results.push({ ...base, action: 'stop_duplicate' }); return; }
      stopKeys.add(key);
      addStops.push(r);
      results.push({ ...base, action: 'stop_added', ...(r.stop_detected ? { stop_detected: true } : {}), ...(leadByKey.has(r.contact_key) ? { existing_lead_id: leadByKey.get(r.contact_key) } : {}) });
      return;
    }
    if (leadKeys.has(key)) { results.push({ ...base, action: 'duplicate' }); return; }
    leadKeys.add(key);
    const lead = replyToLead(r);
    addLeads.push(lead);
    results.push({ ...base, action: 'added', lead_id: lead.lead_id, ...(leadByKey.has(r.contact_key) ? { also_in_leads: leadByKey.get(r.contact_key) } : {}) });
    if (!leadByKey.has(r.contact_key)) leadByKey.set(r.contact_key, lead.lead_id);
  });
  return { results, addLeads, addStops };
}

export function stopRow(r) { return [dubaiNow(), r.replied_at, r.channel, r.phone, r.handle, r.name, r.campaign, r.message.replace(/[\r\n]+/g, ' ').slice(0, 500), r.contact_key]
  .map((v) => (/^[=+\-@]/.test(String(v)) && !/^\+\d{7,15}$/.test(String(v)) ? "'" + v : String(v))); }

export const stopRng = (a) => encodeURIComponent("'" + STOP_TAB + "'!" + a);

export async function readStops() {
  try {
    const j = await gapi('GET', '/values/' + stopRng('A1:I'));
    const rows = j.values || [];
    return rows.slice(rows.length && rows[0][0] === 'added_at' ? 1 : 0).map((r) => Object.fromEntries(STOP_COLUMNS.map((c, i) => [c, String(r[i] ?? '').replace(/^'/, '')])));
  } catch (e) {
    if (/Unable to parse range|400/.test(e.message)) return null; // tab missing
    throw e;
  }
}

export async function ensureStopTab() {
  await gapi('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: STOP_TAB } } }] });
  await gapi('PUT', '/values/' + stopRng('A1:I1') + '?valueInputOption=RAW', { values: [STOP_COLUMNS] });
}

/** Read Sheet, plan, append. dryRun → no writes. */
export async function ingestReplies(items, { dryRun = false } = {}) {
  const lj = await gapi('GET', '/values/' + rng('A1:' + lastCol()));
  const rows = lj.values || [];
  const leads = rows.slice(rows.length && String(rows[0][0]).trim() === 'lead_id' ? 1 : 0).filter((r) => r && r[0]).map(rowToObj);
  let stops = await readStops();
  const missingStopTab = stops === null; if (missingStopTab) stops = [];
  const plan = planBatch(items, leads, stops);
  if (!dryRun) {
    if (plan.addLeads.length) {
      await gapi('POST', '/values/' + rng('A1:' + lastCol()) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: plan.addLeads.map(objToRow) });
      clearCache();
    }
    if (plan.addStops.length) {
      if (missingStopTab) await ensureStopTab();
      await gapi('POST', '/values/' + stopRng('A1:I') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: plan.addStops.map(stopRow) });
    }
  }
  const counts = {}; for (const r of plan.results) counts[r.action] = (counts[r.action] || 0) + 1;
  return { counts, results: plan.results };
}

/** Constant-time Bearer check against BROADCAST_INGEST_TOKEN. */
export function tokenOk(req, env = process.env) {
  const want = String(env.BROADCAST_INGEST_TOKEN || '').trim();
  if (want.length < 24) return null; // not configured
  const h = String(req.headers.authorization || req.headers.Authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!got) return false;
  const a = crypto.createHash('sha256').update(got).digest(), b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}
