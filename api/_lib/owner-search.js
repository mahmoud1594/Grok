// Server-only owner phone search for the Listings Check tab. Never imported by the browser bundle.
// Data: a SQLite index of owner rows (name, phone, unit, community, land, source file).
// Where it comes from, first match wins:
//   1. OWNER_PHONES_DB_PATH                    absolute path to an uncompressed index (local dev)
//   2. api/_lib/owner-phones.sqlite(.gz)       shipped with the deploy (NOT in git, see .gitignore)
//   3. OWNER_PHONES_INDEX_URL / OWNER_DB_INDEX_URL   private https URL to .sqlite or .sqlite.gz,
//                                              downloaded once per instance into /tmp
// The slim format (scripts/build-owner-phone-index.py) has a phone_keys table; the full
// listing-check owner index (owners.phone only) also works through a slower LIKE fallback.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED = path.join(HERE, 'owner-phones.sqlite')
const BUNDLED_GZ = path.join(HERE, 'owner-phones.sqlite.gz')
const CACHE = path.join(os.tmpdir(), 'mdxb-owner-phones.sqlite')
const MAX_LIMIT = 100

let db = null
let dbInfo = null
let opening = null

/** +971 50 123 4567, 00971501234567, 0501234567, 501234567 -> 501234567. Other countries keep their code. */
export function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('971')) d = d.slice(3)
  return d.replace(/^0+/, '')
}

const reverse = (s) => s.split('').reverse().join('')

function isSqlite(buf) {
  return buf.length > 16 && buf.subarray(0, 15).toString('utf8') === 'SQLite format 3'
}

function writeCache(buf) {
  const data = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf
  if (!isSqlite(data)) throw new Error('owner index is not a SQLite file')
  const tmp = `${CACHE}.${process.pid}.part`
  fs.writeFileSync(tmp, data, { mode: 0o600 })
  fs.renameSync(tmp, CACHE)
  return CACHE
}

async function resolveFile() {
  const envPath = String(process.env.OWNER_PHONES_DB_PATH || '').trim()
  if (envPath && fs.existsSync(envPath)) return { file: envPath, source: 'env-path' }
  if (fs.existsSync(BUNDLED)) return { file: BUNDLED, source: 'bundled' }
  if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 1000) return { file: CACHE, source: 'tmp-cache' }
  if (fs.existsSync(BUNDLED_GZ)) return { file: writeCache(fs.readFileSync(BUNDLED_GZ)), source: 'bundled-gz' }
  const url = String(process.env.OWNER_PHONES_INDEX_URL || process.env.OWNER_DB_INDEX_URL || '').trim()
  if (url && /^https:\/\//i.test(url)) {
    const r = await fetch(url, { redirect: 'follow' })
    if (!r.ok) throw new Error(`owner index download failed (${r.status})`)
    return { file: writeCache(Buffer.from(await r.arrayBuffer())), source: 'remote-url' }
  }
  return null
}

async function openDb() {
  if (db) return db
  if (!opening) {
    opening = (async () => {
      const found = await resolveFile()
      if (!found) return null
      const { DatabaseSync } = await import('node:sqlite')
      const handle = new DatabaseSync(found.file, { readOnly: true })
      const tables = new Set(handle.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name))
      const rows = handle.prepare('SELECT COUNT(*) AS c FROM owners').get().c
      dbInfo = { source: found.source, slim: tables.has('phone_keys'), rows }
      db = handle
      return db
    })().finally(() => {
      opening = null
    })
  }
  return opening
}

export async function ownerDbStatus() {
  try {
    const handle = await openDb()
    if (!handle) return { ok: true, available: false, error: 'owner_db_not_configured' }
    return { ok: true, available: true, rows: dbInfo.rows, source: dbInfo.source }
  } catch (error) {
    return { ok: true, available: false, error: 'owner_db_unavailable', detail: String(error?.message || error).slice(0, 200) }
  }
}

function toResult(r, matchType) {
  return {
    owner_name: r.name || '',
    owner_mobile: r.phone || '',
    owner_email: r.email || '',
    unit_number: r.unit || '',
    building: r.building || '',
    cluster: r.cluster || '',
    land_no: r.land || '',
    source_file: path.basename(String(r.source_file || '')),
    match_type: matchType,
  }
}

/** Phone (7+ digits, any of the formats above) or owner name (2+ letters). */
export async function searchOwners(query, limit = 50) {
  const q = String(query || '').trim().slice(0, 80)
  const max = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT)
  const handle = await openDb()
  if (!handle) return { ok: false, available: false, error: 'owner_db_not_configured', results: [] }

  const digits = normPhone(q)
  const phoneLike = /^[\d\s+\-().]+$/.test(q)
  const out = []
  const seen = new Set()
  const add = (r, type) => {
    if (out.length >= max || seen.has(r.id)) return
    seen.add(r.id)
    out.push(toResult(r, type))
  }

  if (phoneLike) {
    if (digits.length < 7) return { ok: false, available: true, error: 'phone_too_short', query: q, results: [] }
    const rev = reverse(digits)
    if (dbInfo.slim) {
      // exact number first, then numbers ending in what was typed (partial or other country prefix)
      for (const r of handle.prepare('SELECT o.* FROM phone_keys k JOIN owners o ON o.id = k.owner_id WHERE k.rev_key = ? LIMIT ?').all(rev, max)) add(r, 'phone')
      if (out.length < max) {
        // digits only, so GLOB can use the rev_key index (LIKE would scan)
        for (const r of handle.prepare('SELECT o.* FROM phone_keys k JOIN owners o ON o.id = k.owner_id WHERE k.rev_key GLOB ? LIMIT ?').all(`${rev}*`, max)) add(r, 'phone')
      }
    } else {
      const tail = digits.length >= 9 ? digits.slice(-9) : digits
      for (const r of handle.prepare('SELECT * FROM owners WHERE phone LIKE ? LIMIT ?').all(`%${tail}%`, max)) add(r, 'phone')
    }
  } else {
    const tokens = (q.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 5)
    if (!tokens.length) return { ok: false, available: true, error: 'query_too_short', query: q, results: [] }
    const where = tokens.map(() => 'name_norm LIKE ?').join(' AND ')
    for (const r of handle.prepare(`SELECT * FROM owners WHERE ${where} AND phone <> '' LIMIT ?`).all(...tokens.map((t) => `%${t}%`), max)) add(r, 'name')
  }
  return { ok: true, available: true, query: q, count: out.length, results: out }
}
