// node --test scripts/broadcast-intake.test.mjs — broadcast reply intake: validation, idempotency, STOP routing, auth.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normaliseReply, planBatch, isStopText, toDubaiIso, tokenOk, leadContactKey } from '../api/_lib/broadcast-intake.js'

const C = 'Acres-OwnerMarketUpdate-202610'

test('normalises UAE phones and Dubai time', () => {
  const n = normaliseReply({ channel: 'WA', campaign: C, phone: '050 123 4567', replied_at: '2026-10-03 14:05', message: 'Interested' })
  assert.equal(n.ok, true)
  assert.equal(n.reply.phone, '+971501234567')
  assert.equal(n.reply.channel, 'whatsapp')
  assert.equal(n.reply.replied_at, '2026-10-03T14:05:00+04:00')
  assert.equal(toDubaiIso('2026-10-03T10:05:00Z'), '2026-10-03T14:05:00+04:00')
  assert.equal(n.campaign_format_ok, true)
})

test('rejects bad input', () => {
  assert.equal(normaliseReply({ channel: 'tiktok', campaign: C, phone: '0501234567' }).error, 'bad_channel')
  assert.equal(normaliseReply({ channel: 'whatsapp', phone: '0501234567' }).error, 'missing_campaign')
  assert.equal(normaliseReply({ channel: 'whatsapp', campaign: C, handle: 'x' }).error, 'whatsapp_needs_phone')
  assert.equal(normaliseReply({ channel: 'instagram', campaign: C }).error, 'missing_phone_or_handle')
  assert.equal(normaliseReply({ channel: 'whatsapp', campaign: C, phone: '12' }).error, 'bad_phone')
  assert.equal(normaliseReply({ channel: 'whatsapp', campaign: C, phone: '0501234567', replied_at: 'yesterday-ish' }).error, 'bad_replied_at')
})

test('STOP detection', () => {
  for (const s of ['Stop', 'STOP', 'stop.', 'Unsubscribe', 'الغاء']) assert.equal(isStopText(s), true, s)
  for (const s of ['stop sending me the old price, what is the new one?', 'Interested', '']) assert.equal(isStopText(s), false, s)
})

test('idempotent by contact + campaign; STOP goes to stop list', () => {
  const existing = [{ lead_id: 'L1', phone: '+971501234567', utm_campaign: C, page_url: '' }, { lead_id: 'L2', phone: '', page_url: 'instagram:@some.user', utm_campaign: 'Reel-Launch-202610' }]
  const p = planBatch([
    { channel: 'whatsapp', campaign: C, phone: '0501234567', message: 'again' },
    { channel: 'whatsapp', campaign: 'Other-Theme-202610', phone: '0501234567', message: 'new campaign' },
    { channel: 'whatsapp', campaign: C, phone: '0501112233', message: 'Stop' },
    { channel: 'whatsapp', campaign: C, phone: '0501112244', message: 'please remove', is_stop: true },
    { channel: 'instagram', campaign: 'Reel-Launch-202610', handle: '@Some.User', message: 'price?' },
    { channel: 'instagram', campaign: 'Reel-Launch-202610', handle: 'other.user', message: 'price?' },
    { channel: 'instagram', campaign: 'Reel-Launch-202610', handle: 'OTHER.user', message: 'dup in batch' },
  ], existing, [{ contact_key: '971501112244', campaign: C }])
  assert.deepEqual(p.results.map((r) => r.action), ['duplicate', 'added', 'stop_added', 'stop_duplicate', 'duplicate', 'added', 'duplicate'])
  assert.equal(p.addLeads.length, 2)
  assert.equal(p.addStops.length, 1)
  const ig = p.addLeads[1]
  assert.equal(ig.source, 'instagram')
  assert.equal(ig.page_url, 'instagram:@other.user')
  assert.equal(ig.utm_campaign, 'Reel-Launch-202610')
  assert.equal(ig.utm_source, 'meta_business_suite')
  assert.equal(p.addLeads[0].source, 'whatsapp_broadcast')
  assert.equal(leadContactKey(ig), 'instagram:other.user')
})

test('bearer token check', () => {
  const env = { BROADCAST_INGEST_TOKEN: 'x'.repeat(40) }
  assert.equal(tokenOk({ headers: {} }, {}), null)
  assert.equal(tokenOk({ headers: {} }, env), false)
  assert.equal(tokenOk({ headers: { authorization: 'Bearer nope' } }, env), false)
  assert.equal(tokenOk({ headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }, env), true)
})
