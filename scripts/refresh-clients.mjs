import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SHEET_ID = '1rVIy9tc-a1m-yUpoZcZ9TltdC5uIULUeCFNd5pnWFAg'
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`
const OUTPUT = resolve('src/data/broadcast-replies.json')

const COLUMNS = [
  ['date', 'Date'],
  ['campaign', 'Campaign'],
  ['reply / interest', 'Reply / Interest'],
  ['phone', 'Phone'],
  ['project', 'Project'],
  ['size', 'Size'],
  ['layout (beds)', 'Layout (beds)'],
  ['owner db match', 'Owner DB match'],
  ['comment', 'Comment'],
  ['last message', 'Last message'],
  ['reminder', 'Reminder'],
]

function instructions() {
  console.log(`Google Sheets credentials are not set, so nothing was written.

The Clients tab reads src/data/broadcast-replies.json. The browser never calls Google Sheets.

To refresh:

1. Export the Eazybe Broadcast Replies Tracker:
   ${SHEET_URL}
2. Replace src/data/broadcast-replies.json. Keep source, sheetId, sheetUrl, exportedAt, and clients[].
   Each client uses the sheet columns: Date, Campaign, Reply / Interest, Phone, Project, Size, Layout (beds), Owner DB match, Comment, Last message, Reminder.
   Leave unknown cells empty. Do not add people who are not on the sheet.
3. Run npm run dev.

Or pull the sheet on this machine only:
   GOOGLE_SHEETS_API_KEY=your_key npm run refresh-clients
   or GOOGLE_ACCESS_TOKEN=your_token npm run refresh-clients
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

const apiKey = process.env.GOOGLE_SHEETS_API_KEY
const accessToken = process.env.GOOGLE_ACCESS_TOKEN
if (!apiKey && !accessToken) {
  instructions()
  process.exit(1)
}

const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A1:K500`)
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
const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === 'phone'))
if (headerIndex < 0) {
  console.error('The sheet has no Phone column. The JSON file was not changed.')
  process.exit(1)
}
const header = rows[headerIndex].map((cell) => String(cell).trim().toLowerCase())
const clients = []
for (const row of rows.slice(headerIndex + 1)) {
  const record = {}
  let any = false
  for (const [key, label] of COLUMNS) {
    const index = header.indexOf(key)
    const value = index >= 0 ? String(row[index] ?? '').trim() : ''
    record[label] = value
    if (value) any = true
  }
  if (any) clients.push(record)
}

const file = {
  source: 'Eazybe Broadcast Replies Tracker',
  sheetId: SHEET_ID,
  sheetUrl: SHEET_URL,
  exportedAt: dubaiDate(),
  clients,
}
await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`)
console.log(`Wrote ${clients.length} replies to src/data/broadcast-replies.json (${file.exportedAt}).`)
