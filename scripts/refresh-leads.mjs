import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SHEET_ID = '1UzHKQiuYcC_OUVOcJoEGs02QqRMLy1nLRo5VNHKovr4'
const STALE_SHEET_ID = '1hL6wKsMS_Lcw01JgoJKqTqR-NhxOO7u7JD-Q1MThKLQ'
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`
const BOX_PATH = resolve('/workspace/bitrix-leads/map-crm/bitrix-leads.json')
const OUTPUT = resolve('src/data/bitrix-leads.json')
const IF_AVAILABLE = process.argv.includes('--if-available')

const LEAD_KEYS = [
  ['bitrixid', 'bitrixId'],
  ['name', 'name'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['dealurl', 'dealUrl'],
  ['projectinterest', 'projectInterest'],
  ['status', 'status'],
  ['assignedat', 'assignedAt'],
  ['sourcechannel', 'sourceChannel'],
  ['comment', 'comment'],
  ['lastactivity', 'lastActivity'],
  ['reminder', 'reminder'],
]

function instructions() {
  console.log(`Bitrix leads were not refreshed, so src/data/bitrix-leads.json was left as-is.

The Leads tab reads that file. The browser never calls Bitrix or Google Sheets.

To refresh:

1. Export the Bitrix leads sheet:
   ${SHEET_URL}
2. Save it as ${BOX_PATH}
   or replace src/data/bitrix-leads.json.
   Keep source, sheetId, sheetUrl, exportedAt, and leads[].
   Each lead uses: bitrixId, name, phone, email, dealUrl, projectInterest, status, assignedAt, sourceChannel, comment, lastActivity, reminder.
   Leave unknown cells empty. Do not add people who are not on the sheet.
3. Run npm run refresh-leads, then npm run dev.

Or pull the sheet on this machine only:
   GOOGLE_SHEETS_API_KEY=your_key npm run refresh-leads
   or GOOGLE_ACCESS_TOKEN=your_token npm run refresh-leads
   Keep those exact names. Vite only copies variables that start with VITE_ into the browser.`)
}

function dubaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function emptyLead() {
  return {
    bitrixId: '',
    name: '',
    phone: '',
    email: '',
    dealUrl: '',
    projectInterest: '',
    status: '',
    assignedAt: '',
    sourceChannel: '',
    comment: '',
    lastActivity: '',
    reminder: '',
  }
}

function assertFeed(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.leads)) {
    throw new Error('The leads file has no leads array.')
  }
  if (payload.sheetId === STALE_SHEET_ID) {
    throw new Error('That leads file uses a retired sheet. Refresh was not written.')
  }
  if (payload.sheetId && payload.sheetId !== SHEET_ID) {
    throw new Error('That leads file is not the live Bitrix sheet. Refresh was not written.')
  }
  return payload
}

async function writeFeed(payload) {
  const feed = assertFeed(payload)
  await writeFile(OUTPUT, `${JSON.stringify(feed, null, 2)}\n`)
  const total = feed.leads.length
  console.log(
    `Wrote ${total} leads to src/data/bitrix-leads.json${feed.exportedAt ? ` (${feed.exportedAt})` : ''}.`,
  )
}

async function copyBox() {
  const raw = await readFile(BOX_PATH, 'utf8')
  assertFeed(JSON.parse(raw))
  await copyFile(BOX_PATH, OUTPUT)
  const feed = JSON.parse(raw)
  const total = feed.leads.length
  console.log(
    `Copied ${total} leads from the live sheet file into src/data/bitrix-leads.json (${feed.sheetId}).`,
  )
}

async function pullSheet(apiKey, accessToken) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A1:L500`)
  const headers = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  else url.searchParams.set('key', apiKey)

  const response = await fetch(url, { headers })
  if (!response.ok) {
    console.error(`Google Sheets request failed (${response.status}). The JSON file was not changed.`)
    process.exit(1)
  }
  const payload = await response.json()
  const rows = payload.values ?? []
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => {
      const key = normalizeHeader(cell)
      return key === 'bitrixid' || key === 'phone' || key === 'name'
    }),
  )
  if (headerIndex < 0) {
    console.error('The sheet has no lead header row. The JSON file was not changed.')
    process.exit(1)
  }
  const header = rows[headerIndex].map((cell) => normalizeHeader(cell))
  const leads = []
  for (const row of rows.slice(headerIndex + 1)) {
    const record = emptyLead()
    let any = false
    for (const [key, label] of LEAD_KEYS) {
      const index = header.indexOf(key)
      const value = index >= 0 ? String(row[index] ?? '').trim() : ''
      record[label] = value
      if (value) any = true
    }
    if (any) leads.push(record)
  }
  await writeFeed({
    source: 'Bitrix Leads',
    sheetId: SHEET_ID,
    sheetUrl: SHEET_URL,
    exportedAt: dubaiDate(),
    badge: 'LIVE · Bitrix leads',
    crmBase: 'https://crm.mpd.ae',
    counts: { total: leads.length, bitrix: leads.length },
    leads,
  })
}

const apiKey = process.env.GOOGLE_SHEETS_API_KEY
const accessToken = process.env.GOOGLE_ACCESS_TOKEN

if (apiKey || accessToken) {
  await pullSheet(apiKey, accessToken)
} else {
  try {
    await copyBox()
  } catch (error) {
    if (IF_AVAILABLE && error && error.code === 'ENOENT') {
      console.log('No box leads file and no sheet credentials. Kept src/data/bitrix-leads.json.')
      process.exit(0)
    }
    if (error && error.code === 'ENOENT') {
      instructions()
      process.exit(IF_AVAILABLE ? 0 : 1)
    }
    console.error(error instanceof Error ? error.message : error)
    console.error('The JSON file was not changed.')
    process.exit(1)
  }
}
