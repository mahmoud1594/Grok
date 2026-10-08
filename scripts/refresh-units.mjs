import { access, copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SHEET_ID = '1-53TnNTQos0kkaUgo8ewT8QZfQlTDdSswTM6w_O9Z_8'
const SHEET_NAME = 'Map CRM - Secondary Units (Pocket & Owners)'
const LEADS_SHEET_ID = '1UzHKQiuYcC_OUVOcJoEGs02QqRMLy1nLRo5VNHKovr4'
const STALE_SHEET_ID = '1hL6wKsMS_Lcw01JgoJKqTqR-NhxOO7u7JD-Q1MThKLQ'
const TAB = 'Units'
const SOURCE = 'Secondary Units sheet'
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`
const BOX_JSON = resolve('/workspace/secondary-units/map-crm/units.json')
const BOX_CSV = resolve('/workspace/secondary-units/map-crm/units.csv')
const OUTPUT = resolve('src/data/units.json')
const IF_AVAILABLE = process.argv.includes('--if-available')
const RANGE = `${TAB}!A1:M`

const UNIT_KEYS = [
  ['unitid', 'unitId'],
  ['ownername', 'ownerName'],
  ['phone', 'phone'],
  ['community', 'community'],
  ['project', 'project'],
  ['unitnumber', 'unitNumber'],
  ['purpose', 'purpose'],
  ['askingpriceaed', 'askingPriceAed'],
  ['pocketlisting', 'pocketListing'],
  ['pocketlistingdetails', 'pocketListingDetails'],
  ['dldhistory', 'dldHistory'],
  ['notes', 'notes'],
  ['trellourl', 'trelloUrl'],
]

const API_KEY_MESSAGE = `GOOGLE_SHEETS_API_KEY only works for public sheets. "${SHEET_NAME}" is private, so an API key cannot read it.
Use GOOGLE_ACCESS_TOKEN (OAuth) or place units.json / units.csv at /workspace/secondary-units/map-crm/.
src/data/units.json was not changed.`

function instructions() {
  console.log(`Units were not refreshed, so src/data/units.json was left as-is.

The Units tab and the Secondary map read that file. The browser never calls Google Sheets.
Bitrix leads stay on their own sheet and are not a units source.

To refresh:

1. Private sheet "${SHEET_NAME}":
   ${SHEET_URL}
   Single tab ${TAB}. Header row A1:M1 must start with unitId, then ownerName, phone, community, project, unitNumber, purpose, askingPriceAed, pocketListing, pocketListingDetails, dldHistory, notes, and optional trelloUrl.
   Columns match by header name, ignoring case. An export without trelloUrl still loads. Only https://trello.com/c/ and /b/ links are kept. Anything else is stored blank.
2. Export that tab and save it as ${BOX_JSON}
   or as CSV at ${BOX_CSV}.
   A JSON snapshot keeps source, sheetId, sheetUrl, tab, exportedAt, and units[].
   Leave unknown cells empty. Do not add units that are not on the sheet.
3. Run npm run refresh-units, then npm run dev.

Or pull the named tab on this machine only (the tab is resolved by the range name, not a gid):
   GOOGLE_ACCESS_TOKEN=your_oauth_token npm run refresh-units
   That token can read this private sheet. GOOGLE_SHEETS_API_KEY cannot, because it only works for public sheets.
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
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function emptyUnit() {
  return {
    unitId: '',
    ownerName: '',
    phone: '',
    community: '',
    project: '',
    unitNumber: '',
    purpose: '',
    askingPriceAed: '',
    pocketListing: '',
    pocketListingDetails: '',
    dldHistory: '',
    notes: '',
    trelloUrl: '',
  }
}

function trelloUrlOrBlank(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  let url
  try {
    url = new URL(text)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:') return ''
  const host = url.hostname.toLowerCase()
  if (host !== 'trello.com' && host !== 'www.trello.com') return ''
  const parts = url.pathname.split('/').filter(Boolean)
  if ((parts[0] !== 'c' && parts[0] !== 'b') || !parts[1]) return ''
  return url.toString()
}

function assertHeader(firstCell) {
  const text = String(firstCell ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
  if (!text.startsWith('unitId')) {
    throw new Error(
      `The Units tab header must start with unitId. The first cell is ${JSON.stringify(text)}. No other tab was read.`,
    )
  }
}

function rowsToUnits(rows) {
  if (!rows.length) {
    throw new Error('The Units tab has no header row. No other tab was read.')
  }
  assertHeader(rows[0][0])
  const header = rows[0].map((cell) => normalizeHeader(cell))
  const units = []
  for (const row of rows.slice(1)) {
    const record = emptyUnit()
    let any = false
    for (const [key, label] of UNIT_KEYS) {
      const index = header.indexOf(key)
      const raw = index >= 0 ? String(row[index] ?? '').trim() : ''
      const value = label === 'trelloUrl' ? trelloUrlOrBlank(raw) : raw
      record[label] = value
      if (value) any = true
    }
    if (any) units.push(record)
  }
  return units
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const input = String(text ?? '').replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row.push(cell)
      cell = ''
      if (row.some((value) => String(value).trim())) rows.push(row)
      row = []
      continue
    }
    cell += char
  }
  if (cell.length || row.length) {
    row.push(cell)
    if (row.some((value) => String(value).trim())) rows.push(row)
  }
  return rows
}

function assertFeed(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.units)) {
    throw new Error('The units file has no units array.')
  }
  const id = payload.sheetId
  if (id === LEADS_SHEET_ID || id === STALE_SHEET_ID) {
    throw new Error('That units file points at the leads sheet or a retired sheet. Refresh was not written.')
  }
  if (id && id !== SHEET_ID) {
    throw new Error('That units file is not the Secondary Units sheet. Refresh was not written.')
  }
  return payload
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') return false
    throw error
  }
}

async function writeFeed(units) {
  const feed = {
    source: SOURCE,
    sheetId: SHEET_ID,
    sheetName: SHEET_NAME,
    sheetUrl: SHEET_URL,
    tab: TAB,
    exportedAt: dubaiDate(),
    units,
  }
  assertFeed(feed)
  await writeFile(OUTPUT, `${JSON.stringify(feed, null, 2)}\n`)
  console.log(`Wrote ${units.length} units from ${RANGE} to src/data/units.json (${feed.exportedAt}).`)
}

async function copyBoxJson() {
  const raw = await readFile(BOX_JSON, 'utf8')
  assertFeed(JSON.parse(raw))
  await copyFile(BOX_JSON, OUTPUT)
  const feed = JSON.parse(raw)
  console.log(`Copied ${feed.units.length} units from ${BOX_JSON} into src/data/units.json.`)
}

async function copyBoxCsv() {
  const raw = await readFile(BOX_CSV, 'utf8')
  const units = rowsToUnits(parseCsv(raw))
  await writeFeed(units)
  console.log(`Read ${BOX_CSV}.`)
}

function fail(error) {
  console.error(error instanceof Error ? error.message : error)
  console.error('The JSON file was not changed.')
  process.exit(1)
}

async function pullSheet(accessToken) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}`,
  )
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      if (payload?.error?.message) detail = ` ${payload.error.message}`
    } catch {
      detail = ''
    }
    console.error(
      `Google Sheets request for ${RANGE} failed (${response.status}).${detail} No other tab was read. The JSON file was not changed.`,
    )
    process.exit(1)
  }
  const payload = await response.json()
  const units = rowsToUnits(payload.values ?? [])
  await writeFeed(units)
}

const apiKey = process.env.GOOGLE_SHEETS_API_KEY
const accessToken = process.env.GOOGLE_ACCESS_TOKEN

if (await exists(BOX_JSON)) {
  try {
    await copyBoxJson()
  } catch (error) {
    fail(error)
  }
} else if (await exists(BOX_CSV)) {
  try {
    await copyBoxCsv()
  } catch (error) {
    fail(error)
  }
} else if (accessToken) {
  try {
    await pullSheet(accessToken)
  } catch (error) {
    fail(error)
  }
} else if (apiKey) {
  console.error(API_KEY_MESSAGE)
  process.exit(IF_AVAILABLE ? 0 : 1)
} else if (IF_AVAILABLE) {
  console.log(
    'No file at /workspace/secondary-units/map-crm/units.json or units.csv, and no GOOGLE_ACCESS_TOKEN. Kept src/data/units.json.',
  )
} else {
  instructions()
  process.exit(1)
}
