import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const file = path.join(os.tmpdir(), `news-${process.pid}.json`)
process.env.NEWS_BACKEND = 'mock'
process.env.NEWS_MOCK_FILE = file

const store = await import('../api/_lib/news-store.js')
const { DEVELOPERS: SERVER_DEVELOPERS, canonicalDeveloper, projectKey } = await import('../api/_lib/developers.js')
const { DEVELOPERS: CLIENT_DEVELOPERS } = await import('../src/lib/developers.ts')
const { default: news, ingestAuthorized } = await import('../api/news.js')
const { calendarEmbedUrl, followUpRequest, buildFollowUpEvent, followUpEventId } = await import('../api/calendar.js')
const { normalizeLinks } = await import('../api/whatsapp-links.js')

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
    json() {
      return JSON.parse(this.body)
    },
  }
}

test('client and server share the same 11 developers', () => {
  assert.deepEqual(CLIENT_DEVELOPERS, SERVER_DEVELOPERS)
  assert.equal(SERVER_DEVELOPERS.length, 11)
})

test('developer names are folded onto the 11', () => {
  assert.equal(canonicalDeveloper('Emaar Properties'), 'Emaar')
  assert.equal(canonicalDeveloper('H&H Development'), 'H&H')
  assert.equal(canonicalDeveloper('Meraas and Brookfield Properties'), 'Meraas')
  assert.equal(canonicalDeveloper('NAKHEEL'), 'Nakheel')
  assert.equal(canonicalDeveloper('Sobha Realty'), 'Sobha Realty')
  assert.equal(projectKey('Emaar Properties', 'Creek Haven'), projectKey('emaar', 'Creek  Haven'))
})

test('phone numbers are removed from text and the sender', () => {
  const { message } = store.normalizeItem({
    developer: 'Emaar',
    project: 'Valia',
    group: 'Emaar Brokers +971 50 123 4567',
    sender_hidden: '+971501234567',
    text: 'Call me on 0501234567 or +44 7700 900123, wa.me/971501234567. From AED 2,978,000 on 2026-09-17 15:30.',
    timestamp: '2026-10-01T10:00:00Z',
  })
  assert.equal(message.sender, 'Hidden')
  assert.doesNotMatch(message.group, /\d{5,}/)
  assert.doesNotMatch(message.text, /050|7700|971501/)
  assert.match(message.text, /AED 2,978,000/)
  assert.match(message.text, /2026-09-17 15:30/)
})

test('media keeps https links only and sorts images from files', () => {
  const { message } = store.normalizeItem({
    project: 'Kanyon',
    text: '',
    media_urls: ['https://cdn.example.com/a.jpg', 'http://x.example.com/b.png', 'javascript:alert(1)', 'https://cdn.example.com/plan.pdf'],
  })
  assert.deepEqual(
    message.media.map((item) => item.kind),
    ['image', 'file'],
  )
  assert.equal(message.media[1].name, 'plan.pdf')
})

test('bad items are rejected', () => {
  assert.equal(store.normalizeItem({ text: 'hi' }).error, 'project_required')
  assert.equal(store.normalizeItem({ project: 'X' }).error, 'text_or_media_required')
  assert.equal(store.normalizeItem({ project: 'X', text: 'y', timestamp: 'nope' }).error, 'bad_timestamp')
  assert.equal(store.normalizeItem({ project: 'X', text: 'y', timestamp: 1759312800 }).message.timestamp, '2025-10-01T10:00:00.000Z')
})

test('ingest groups messages per project, newest first, and skips duplicates', async () => {
  const items = [
    { developer: 'Beyond', project: 'Soulever', group: 'Beyond VIP', text: 'Old price list', timestamp: '2026-09-01T08:00:00Z' },
    { developer: 'Beyond', project: 'Soulever', group: 'Beyond VIP', text: 'New price list', timestamp: '2026-09-02T08:00:00Z' },
    { developer: 'Emaar', project: 'Brand New Tower', group: 'Emaar Launches', text: 'EOI open', timestamp: '2026-09-03T08:00:00Z' },
  ]
  const first = await store.ingest(items.map((item) => store.normalizeItem(item).message))
  assert.deepEqual(
    first.map((row) => row.status),
    ['new_card', 'added', 'new_card'],
  )
  const again = await store.ingest([store.normalizeItem(items[0]).message])
  assert.equal(again[0].status, 'duplicate')
  const cards = await store.board()
  assert.equal(cards.length, 2)
  assert.equal(cards[0].project, 'Brand New Tower')
  const soulever = cards.find((card) => card.project === 'Soulever')
  assert.equal(soulever.count, 2)
  assert.deepEqual(
    soulever.messages.map((m) => m.text),
    ['New price list', 'Old price list'],
  )
  fs.unlinkSync(file)
})

test('POST /api/news needs the ingest token', async () => {
  delete process.env.NEWS_INGEST_TOKEN
  assert.equal(ingestAuthorized({ headers: {} }).code, 503)
  process.env.NEWS_INGEST_TOKEN = 'test-ingest-token-1234567890'
  assert.equal(ingestAuthorized({ headers: { authorization: 'Bearer wrong' } }).code, 401)
  assert.equal(ingestAuthorized({ headers: { 'x-ingest-token': 'test-ingest-token-1234567890' } }).ok, true)

  const res = fakeRes()
  await news(
    {
      method: 'POST',
      headers: { authorization: 'Bearer test-ingest-token-1234567890' },
      body: { developer: 'Nakheel', project: 'Palm Central', group: 'Nakheel', text: 'Sold out phase 1', timestamp: '2026-10-01T09:00:00Z' },
    },
    res,
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().accepted, 1)

  const denied = fakeRes()
  await news({ method: 'POST', headers: {}, body: { project: 'x', text: 'y' } }, denied)
  assert.equal(denied.statusCode, 401)

  const reader = fakeRes()
  await news({ method: 'GET', headers: {} }, reader)
  assert.equal(reader.statusCode, 401)
  fs.rmSync(file, { force: true })
})

test('the calendar URL must be a Google Calendar embed', () => {
  assert.equal(calendarEmbedUrl({}), null)
  assert.equal(calendarEmbedUrl({ GOOGLE_CALENDAR_EMBED_URL: 'https://evil.example.com/calendar/embed' }), null)
  assert.match(
    calendarEmbedUrl({ GOOGLE_CALENDAR_EMBED_URL: '<iframe src="https://calendar.google.com/calendar/embed?src=a%40b.com&amp;ctz=Asia%2FDubai"></iframe>' }),
    /^https:\/\/calendar\.google\.com\/calendar\/embed\?src=a%40b\.com&ctz=Asia%2FDubai$/,
  )
  assert.match(calendarEmbedUrl({ GOOGLE_CALENDAR_ID: 'mahmoud@example.com' }), /src=mahmoud%40example\.com&ctz=Asia%2FDubai/)
})

test('a lead follow-up becomes one 10:00 Dubai calendar event', () => {
  assert.equal(followUpRequest(null).error, 'bad_body')
  assert.equal(followUpRequest({ leadId: 'bad id', date: '2026-10-10' }).error, 'bad_id')
  assert.equal(followUpRequest({ leadId: 'lead-12345678', date: '2026-13-40' }).error, 'bad_date')
  const input = followUpRequest({ leadId: 'lead-12345678', date: '2026-10-10', name: '  Sara\nAli ', project: 'Marina' })
  assert.equal(input.ok, true)
  const event = buildFollowUpEvent(input)
  assert.equal(event.summary, 'Follow up: Sara Ali')
  assert.equal(event.description, 'Marina')
  assert.equal(event.start.dateTime, '2026-10-10T10:00:00')
  assert.equal(event.start.timeZone, 'Asia/Dubai')
  assert.equal(event.end.dateTime, '2026-10-10T10:30:00')
  assert.equal(event.id, followUpEventId('lead-12345678'))
  assert.match(event.id, /^[a-v0-9]{5,}$/)
  assert.equal(event.extendedProperties.private.leadId, 'lead-12345678')
  assert.equal(followUpRequest({ leadId: 'lead-12345678', date: '' }).ok, true)
})

test('saved WhatsApp links become wa.me and invite links only', () => {
  const links = normalizeLinks({
    groups: [
      { name: 'Emaar brokers', url: 'https://chat.whatsapp.com/AbCdEf123' },
      { name: 'Bad', url: 'https://example.com/x' },
    ],
    contacts: [
      { name: 'Ali', phone: '050 123 4567', message: 'Hi' },
      { name: 'No phone', phone: '' },
    ],
  })
  assert.deepEqual(
    links.groups.map((group) => group.href),
    ['https://chat.whatsapp.com/AbCdEf123'],
  )
  assert.deepEqual(
    links.contacts.map((contact) => contact.href),
    ['https://wa.me/971501234567?text=Hi'],
  )
})
