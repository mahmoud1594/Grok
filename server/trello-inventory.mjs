import { readFileSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const BOARD = 'HdegR3Aa'
const OUTPUT = resolve('src/data/trello-dubai.json')
const SKIP_LIST = 'WHAT IS THE UPDATE'

export const SETUP_INSTRUCTIONS = `Set TRELLO_KEY and TRELLO_TOKEN on the server, then try again.

1. Create a key at https://trello.com/power-ups/admin
2. Authorize read access:
   https://trello.com/1/authorize?expiration=30days&name=MahmoudDXB&scope=read&response_type=token&key=YOUR_KEY
3. Put the two values in the environment that runs Node (a gitignored .env next to package.json, or the shell):
   TRELLO_KEY=your_key
   TRELLO_TOKEN=your_token
4. Refresh with the Map button, or run: npm run refresh-inventory

Use those exact names. Do not prefix them with VITE_. The browser must not receive a Trello key.
The saved file src/data/trello-dubai.json is unchanged. No cards were invented.
Sign in on this site. This app does not keep a second password.`

function loadServerEnv() {
  const path = resolve('.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const name = trimmed.slice(0, eq).trim()
    if (name !== 'TRELLO_KEY' && name !== 'TRELLO_TOKEN') continue
    if (process.env[name]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[name] = value
  }
}

function dubaiStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+04:00`
}

export async function pullDubaiBoard(key, token) {
  const auth = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`
  const boardResponse = await fetch(`https://api.trello.com/1/boards/${BOARD}?fields=name,url,shortLink&${auth}`)
  if (!boardResponse.ok) {
    throw new Error(`Trello board request failed (${boardResponse.status}).`)
  }
  const board = await boardResponse.json()
  if (board.shortLink && board.shortLink !== BOARD) {
    throw new Error('Trello returned a board other than Dubai. The saved inventory was not changed.')
  }

  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD}/lists?cards=open&card_fields=name,desc,url,labels&fields=name&filter=open&${auth}`,
  )
  if (!listsResponse.ok) {
    throw new Error(`Trello list request failed (${listsResponse.status}).`)
  }
  const lists = await listsResponse.json()
  if (!Array.isArray(lists)) {
    throw new Error('Trello did not return lists. The saved inventory was not changed.')
  }

  const cards = []
  for (const list of lists) {
    for (const card of list.cards ?? []) {
      cards.push({
        listName: list.name,
        name: card.name ?? '',
        desc: card.desc ?? '',
        url: card.url ?? '',
        labels: (card.labels ?? []).map((label) => label.name).filter(Boolean),
      })
    }
  }
  if (cards.length === 0) {
    throw new Error('Trello returned no cards. The saved inventory was not changed.')
  }

  const pinCount = cards.filter((card) => String(card.listName).trim().toUpperCase() !== SKIP_LIST).length
  return {
    board: board.name ?? 'Dubai',
    boardUrl: board.url ?? 'https://trello.com/b/HdegR3Aa/dubai',
    exportedAt: dubaiStamp(),
    note: 'Skip list WHAT IS THE UPDATE for inventory pins; area lists only. Dubai board only.',
    cardCount: cards.length,
    pinCount,
    cards,
  }
}

export async function refreshInventoryFile(options = {}) {
  const requireWrite = options.requireWrite !== false
  loadServerEnv()
  const key = process.env.TRELLO_KEY
  const token = process.env.TRELLO_TOKEN
  if (!key || !token) {
    return {
      ok: false,
      status: 503,
      body: {
        error: 'Trello credentials are not set, so nothing was written.',
        instructions: SETUP_INSTRUCTIONS,
      },
    }
  }
  let payload
  try {
    payload = await pullDubaiBoard(key, token)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trello refresh failed.'
    return {
      ok: false,
      status: 502,
      body: {
        error: `${message} The saved inventory was not changed.`,
        instructions: SETUP_INSTRUCTIONS,
      },
    }
  }
  try {
    await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`)
  } catch (error) {
    if (requireWrite) {
      const message = error instanceof Error ? error.message : 'could not write the file'
      return {
        ok: false,
        status: 500,
        body: {
          error: `Pulled the Dubai board but could not write src/data/trello-dubai.json (${message}). The previous file was left in place.`,
          instructions: SETUP_INSTRUCTIONS,
        },
      }
    }
  }
  return { ok: true, status: 200, body: payload }
}
