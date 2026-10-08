// node --test scripts/email-contacts.test.mjs — EmailContacts import cleaning/sorting, webhook events, webhook auth.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { cleanEmail, cleanPhone, cleanPlace, cleanBuilding, mapHeader, planImport, normaliseEvents, planEvents, webhookAuth, rowsFromSheet, rowToSheet, EMAIL_COLUMNS } from '../api/_lib/email-contacts.js'

const HEAD = ['owner_name', 'phone', 'email', 'area', 'project_or_building']

test('cleans emails, phones and place names', () => {
  assert.equal(cleanEmail(' Owner@Example.COM '), 'owner@example.com')
  assert.equal(cleanEmail('a@b.co; c@d.com'), 'a@b.co')
  assert.equal(cleanEmail('mailto:<x@y.ae>'), 'x@y.ae')
  assert.equal(cleanEmail('not an email'), '')
  assert.equal(cleanEmail(''), '')
  assert.equal(cleanPhone('050 123 4567'), '+971501234567')
  assert.equal(cleanPhone('971501234567 / 971509999999'), '+971501234567')
  assert.equal(cleanPhone('n/a'), '')
  assert.equal(cleanPlace('BUSINESS BAY'), 'Business Bay')
  assert.equal(cleanPlace('  downtown   dubai '), 'Downtown Dubai')
  assert.equal(cleanPlace('DAMAC Maison The Distinction'), 'DAMAC Maison The Distinction')
  assert.deepEqual(mapHeader(HEAD), { community: 3, building: 4, name: 0, phone: 1, email: 2 })
  assert.deepEqual(mapHeader(['Name', 'Mobile', 'E-mail', 'Community', 'Tower']), { community: 3, building: 4, name: 0, phone: 1, email: 2 })
})

test('drops rows without email, keeps rows without phone, sorts by community then building', () => {
  const rows = [
    ['Zed', '', 'zed@x.com', 'Downtown Dubai', 'Burj Vista 1'],
    ['Amy', '0501234567', 'AMY@x.com', 'Business Bay', 'Tower 10'],
    ['Bob', '0501234567', '', 'Business Bay', 'Tower 2'],
    ['Cat', '971501112244', 'cat@x.com', 'Business Bay', 'Tower 2'],
    ['Amy again', '', 'amy@x.com', 'BUSINESS BAY', 'tower 10'],
    ['Dan', '', 'dan@x.com', 'Downtown Dubai', ''],
    ['Eve', 'junk', 'eve@x.com', 'Downtown Dubai', 'Act One'],
  ]
  const { rows: out, stats } = planImport(HEAD, rows)
  assert.deepEqual(out.map((r) => r[2]), ['Cat', 'Amy', 'Eve', 'Zed', 'Dan']) // Tower 2 before Tower 10 (numeric), blank building last
  assert.equal(stats.received, 7)
  assert.equal(stats.no_email, 1)
  assert.equal(stats.duplicates, 1)
  assert.equal(stats.written, 5)
  assert.equal(stats.no_phone, 3)
  assert.deepEqual(stats.communities, { 'Business Bay': 2, 'Downtown Dubai': 3 })
  assert.deepEqual(out[0], ['Business Bay', 'Tower 2', 'Cat', '+971501112244', 'cat@x.com', '', '', '', '', ''])
  assert.equal(out[1][4], 'amy@x.com')
})

test('building cells are cut down to the tower name', () => {
  const cases = {
    'list: Bellevue': 'Bellevue',
    '1204, Westburry Tower, Business Bay': 'Westburry Tower',
    'Business Bay, Westburry Tower, Flat 1016': 'Westburry Tower',
    'Door # 3203,Westburry Tower,Al Abraj Street': 'Westburry Tower',
    'Bussiness Central Rbc/5/501': 'Business Central',
    'Park Central PCRES/10/A1001': 'Park Central',
    'Bbet Tower C; Bbet Zone-2 Podium': 'Bbet Tower C',
    'Bbet Zone-2 Podium G24+G24A': 'Bbet Zone-2 Podium',
    'Bbet Tower B Go1; Bbet Tower B Go4': 'Bbet Tower B',
    'Bayswater; Dg 77 - Apartment': 'Bayswater',
    'Windsor Manor Retail2': 'Windsor Manor',
    'Coral Tower_CA': 'Coral Tower',
    '1 BHK Apt # 2604,Al Noujoum Tower,Down Town Burj Khalifa Dub': 'Burj Al Nujoom',
    'Burj Al Nujoom 2709': 'Burj Al Nujoom',
    'One By Omnyat': 'One by Omniyat',
    'Downtown Views': 'Downtown Views',
    '29 Blvd T1': '29 Blvd T1',
    'Burj Khalifa Zone 3': 'Burj Khalifa Zone 3',
    'Residences_E1': 'Residences_E1',
    '': '',
  }
  for (const [raw, want] of Object.entries(cases)) assert.equal(cleanBuilding(raw), want, raw)
  const { rows } = planImport(HEAD, [['A', '', 'a@x.com', 'Downtown Dubai', 'BURJ VISTA Tower 1'], ['B', '', 'b@x.com', 'Downtown Dubai', 'BURJ VISTA Tower 1'],
    ['C', '', 'c@x.com', 'Downtown Dubai', 'Burj Vista Tower 1']])
  assert.deepEqual(rows.map((r) => r[1]), ['BURJ VISTA Tower 1', 'BURJ VISTA Tower 1', 'BURJ VISTA Tower 1'])
})

test('accepts row objects and rejects a file without an email column', () => {
  const { rows } = planImport(null, [{ owner_name: 'A', email: 'a@x.com', area: 'Business Bay', project_or_building: 'B1', phone: '' }])
  assert.deepEqual(rows[0].slice(0, 5), ['Business Bay', 'B1', 'A', '', 'a@x.com'])
  assert.throws(() => planImport(['name', 'phone'], [['a', '1']]), /no email column/)
})

test('re-import keeps tracking and never brings back an unsubscribed address', () => {
  const existing = [['Business Bay', 'B1', 'A', '', 'a@x.com', '2026-10-01 10:00', '2026-10-01 10:05', '', '', '2026-10-01 09:00']]
  const stops = [{ channel: 'email', handle: 'b@x.com', replied_at: '2026-10-02T08:00:00+04:00', message: 'unsubscribed' },
    { channel: 'email', handle: 'c@x.com', replied_at: '2026-10-03T08:00:00+04:00', message: 'bounced' },
    { channel: 'whatsapp', phone: '+971501234567', handle: '' }]
  const { rows, stats } = planImport(HEAD, [['A', '', 'a@x.com', 'Business Bay', 'B1'], ['B', '', 'b@x.com', 'Business Bay', 'B1'], ['C', '', 'c@x.com', 'Business Bay', 'B1']], { existing, stops })
  assert.deepEqual(rows[0].slice(5), ['2026-10-01 10:00', '2026-10-01 10:05', '', '', '2026-10-01 09:00'])
  assert.equal(rows[1][7], '2026-10-02 08:00')
  assert.deepEqual([rows[2][7], rows[2][8]], ['', '2026-10-03 08:00'])
  assert.equal(stats.unsubscribed, 2)
})

test('formula guard on write, unguard on read, header skipped', () => {
  const sheet = rowToSheet(['Business Bay', '=HYPERLINK("x")', '-Bob', '+971501234567', 'a@x.com', '', '', '', '', ''])
  assert.equal(sheet[1], `'=HYPERLINK("x")`)
  assert.equal(sheet[2], "'-Bob")
  assert.equal(sheet[3], '+971501234567')
  const back = rowsFromSheet([EMAIL_COLUMNS, sheet, []])
  assert.equal(back.firstRow, 2)
  assert.equal(back.rows[0][1], '=HYPERLINK("x")')
  assert.equal(back.rows.length, 2)
})

test('normalises MailerLite, Brevo, Mailgun and Resend payloads', () => {
  const ml = normaliseEvents({ events: [
    { type: 'subscriber.unsubscribed', subscriber: { email: 'A@x.com' } },
    { type: 'campaign.open', subscriber: { email: 'b@x.com' }, campaign: { name: 'Weekly #1' } },
    { type: 'campaign.click', subscriber: { email: 'b@x.com' } },
    { type: 'subscriber.bounced', subscriber: { email: 'c@x.com' } },
    { type: 'subscriber.spam_reported', subscriber: { email: 'd@x.com' } },
    { type: 'subscriber.created', subscriber: { email: 'e@x.com' } },
  ] })
  assert.deepEqual(ml.map((e) => [e.kind, e.email]), [['unsubscribe', 'a@x.com'], ['open', 'b@x.com'], ['click', 'b@x.com'], ['bounce', 'c@x.com'], ['complaint', 'd@x.com']])
  assert.equal(ml[1].campaign, 'Weekly #1')
  assert.match(ml[0].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  const brevo = normaliseEvents([{ event: 'opened', email: 'f@x.com', ts: 1791360000 }, { event: 'delivered', email: 'f@x.com' }])
  assert.deepEqual(brevo.map((e) => e.kind), ['open', 'sent'])
  assert.equal(brevo[0].at, '2026-10-07 12:00')
  assert.equal(normaliseEvents({ 'event-data': { event: 'failed', recipient: 'g@x.com' } })[0].kind, 'bounce')
  assert.equal(normaliseEvents({ 'event-data': { event: 'clicked', recipient: 'g@x.com' } })[0].kind, 'click')
  assert.equal(normaliseEvents({ type: 'email.bounced', data: { to: ['h@x.com'] } })[0].email, 'h@x.com')
  assert.deepEqual(normaliseEvents(null), [])
})

test('plans cell updates and StopList rows', () => {
  const rows = [
    ['Business Bay', 'B1', 'A', '', 'a@x.com', '2026-10-01 10:00', '', '', '', ''],
    ['Downtown Dubai', 'D1', 'A', '', 'a@x.com', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['Business Bay', 'B2', 'B', '', 'b@x.com', '', '', '2026-09-01 09:00', '', ''],
  ]
  const ev = [
    { kind: 'open', email: 'a@x.com', at: '2026-10-07 12:00', campaign: 'W1' },
    { kind: 'open', email: 'a@x.com', at: '2026-10-05 12:00', campaign: 'W1' },
    { kind: 'unsubscribe', email: 'b@x.com', at: '2026-10-07 12:00', campaign: 'W1' },
    { kind: 'unsubscribe', email: 'a@x.com', at: '2026-10-07 12:01', campaign: 'W1' },
    { kind: 'click', email: 'nobody@x.com', at: '2026-10-07 12:00', campaign: '' },
  ]
  const stops = [{ channel: 'email', handle: 'b@x.com', replied_at: '2026-09-01T09:00:00+04:00' }]
  const p = planEvents(ev, rows, stops)
  const cells = p.updates.map((u) => `${u.index}:${EMAIL_COLUMNS[u.col]}=${u.value}`).sort()
  assert.deepEqual(cells, ['0:Opened=2026-10-07 12:00', '0:Unsubscribed=2026-10-07 12:01', '1:Opened=2026-10-07 12:00', '1:Unsubscribed=2026-10-07 12:01'])
  assert.deepEqual(p.addStops.map((s) => [s.handle, s.channel, s.message, s.contact_key]), [['a@x.com', 'email', 'unsubscribed', 'email:a@x.com']])
  assert.deepEqual(p.results, { matched: 4, unmatched: 1, stop_added: 1 })
})

test('webhook auth: not configured, MailerLite signature, bearer, token, wrong', () => {
  const env = { EMAIL_WEBHOOK_SECRET: 'test-secret-0123456789abcdef' }
  const raw = '{"type":"campaign.open"}'
  const sig = crypto.createHmac('sha256', env.EMAIL_WEBHOOK_SECRET).update(raw).digest('hex')
  assert.equal(webhookAuth({ headers: {}, url: '/' }, raw, {}), null)
  assert.equal(webhookAuth({ headers: { signature: sig }, url: '/' }, raw, env), true)
  assert.equal(webhookAuth({ headers: { signature: sig }, url: '/' }, raw + ' ', env), false)
  assert.equal(webhookAuth({ headers: { authorization: 'Bearer ' + env.EMAIL_WEBHOOK_SECRET }, url: '/' }, raw, env), true)
  assert.equal(webhookAuth({ headers: {}, url: '/api/email-events?token=' + env.EMAIL_WEBHOOK_SECRET }, raw, env), true)
  assert.equal(webhookAuth({ headers: { authorization: 'Bearer nope' }, url: '/?token=nope' }, raw, env), false)
  const short = { EMAIL_WEBHOOK_SECRET: 'Ab3dEf9hIj' }
  const shortSig = crypto.createHmac('sha256', short.EMAIL_WEBHOOK_SECRET).update(raw).digest('hex')
  assert.equal(webhookAuth({ headers: { signature: shortSig }, url: '/' }, raw, short), true)
  assert.equal(webhookAuth({ headers: { authorization: 'Bearer Ab3dEf9hIj' }, url: '/?token=Ab3dEf9hIj' }, raw, short), false)
})
