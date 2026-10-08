/**
 * Download verified Trello developer-logo attachments and write small local PNGs.
 * Reads TRELLO_KEY and TRELLO_TOKEN from the environment or a gitignored .env.
 * Never writes those values into the client bundle or into trello-dubai.json.
 *
 * Sources are the attachment ids already confirmed on the Dubai board.
 * A slug is published only after the download is a real image file on disk.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcesPath = resolve(root, 'scripts/developer-logo-sources.json')
const creditsPath = resolve(root, 'scripts/developer-logo-credits.json')
const outDir = resolve(root, 'public/assets/developer-logos')
const manifestPath = resolve(root, 'src/data/developer-logos.json')
const ifAvailable = process.argv.includes('--if-available')

function loadServerEnv() {
  const path = resolve(root, '.env')
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

function isImage(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return true
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true
  const head = buf.subarray(0, 240).toString('utf8').trimStart().toLowerCase()
  return head.startsWith('<svg') || head.startsWith('<?xml')
}

function optimizePng(sourcePath, destPath) {
  const script = `
from PIL import Image
src, dest = ${JSON.stringify(sourcePath)}, ${JSON.stringify(destPath)}
image = Image.open(src)
image.thumbnail((64, 64), Image.Resampling.LANCZOS)
if image.mode not in ('RGB', 'RGBA'):
    image = image.convert('RGBA')
image.save(dest, 'PNG', optimize=True)
`
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8' })
  return result.status === 0
}

async function downloadAttachment(row, key, token) {
  const url = new URL(
    `https://api.trello.com/1/cards/${row.cardObjectId}/attachments/${row.attachmentId}/download/${encodeURIComponent(row.fileName)}`,
  )
  url.searchParams.set('key', key)
  url.searchParams.set('token', token)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${row.slug} download failed (${response.status})`)
  }
  const buf = Buffer.from(await response.arrayBuffer())
  if (!isImage(buf)) throw new Error(`${row.slug} download was not an image`)
  return buf
}

function savedSlugs() {
  if (!existsSync(outDir)) return new Set()
  return new Set(
    readdirSync(outDir)
      .filter((name) => name.endsWith('.png'))
      .map((name) => name.slice(0, -4)),
  )
}

function writeManifest(present, trelloSlugs = new Set()) {
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'))
  const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : { developers: {} }
  const byDeveloper = {}
  for (const [developer, credit] of Object.entries(credits.developers ?? {})) {
    if (credit && present.has(credit.slug)) byDeveloper[developer] = credit.slug
  }
  const byCard = {}
  const counts = new Map()
  for (const row of sources) {
    if (!trelloSlugs.has(row.slug) || !present.has(row.slug)) continue
    byCard[row.shortLink] = row.slug
    if (!row.developer) continue
    if (!counts.has(row.developer)) counts.set(row.developer, new Map())
    const bag = counts.get(row.developer)
    bag.set(row.slug, (bag.get(row.slug) ?? 0) + 1)
  }
  for (const [developer, bag] of counts) {
    const ranked = [...bag.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) byDeveloper[developer] = ranked[0][0]
  }
  const body = `${JSON.stringify({ byCard, byDeveloper }, null, 2)}\n`
  writeFileSync(manifestPath, body)
  return { cards: Object.keys(byCard).length, developers: Object.keys(byDeveloper).length, slugs: present.size }
}

async function main() {
  loadServerEnv()
  const key = process.env.TRELLO_KEY
  const token = process.env.TRELLO_TOKEN
  if (!key || !token) {
    const present = savedSlugs()
    const summary = writeManifest(present, new Set())
    if (ifAvailable) {
      console.log(
        `Developer logos: no TRELLO_KEY/TRELLO_TOKEN. Kept ${summary.slugs} local file(s). trello-dubai.json was not changed.`,
      )
      return
    }
    console.error('Set TRELLO_KEY and TRELLO_TOKEN to download developer logos. No files were invented.')
    process.exitCode = 1
    return
  }

  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'))
  mkdirSync(outDir, { recursive: true })
  const seen = new Set()
  const downloaded = new Set()
  let saved = 0
  for (const row of sources) {
    if (seen.has(row.slug)) continue
    seen.add(row.slug)
    const dest = resolve(outDir, `${row.slug}.png`)
    try {
      const buf = await downloadAttachment(row, key, token)
      const raw = resolve(outDir, `.${row.slug}.download`)
      writeFileSync(raw, buf)
      if (!optimizePng(raw, dest)) {
        if (buf[0] === 0x89 && buf.length < 180_000) writeFileSync(dest, buf)
        else throw new Error(`${row.slug} could not be optimized`)
      }
      downloaded.add(row.slug)
      saved += 1
      console.log(`saved ${row.slug}.png`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'download failed'
      console.error(message)
    }
  }
  const summary = writeManifest(savedSlugs(), downloaded)
  console.log(`Developer logos: saved ${saved} file(s), ${summary.cards} cards, ${summary.developers} developers.`)
}

await main()
