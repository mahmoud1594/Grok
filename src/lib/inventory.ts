import trelloExport from '../data/trello-dubai.json' with { type: 'json' }
import portalPinFile from '../data/portal-pins.json' with { type: 'json' }
import projectMediaFile from '../data/project-media.json' with { type: 'json' }
import cardFilesFile from '../data/card-files.json' with { type: 'json' }
import pinOverrideFile from '../data/pin-overrides.json' with { type: 'json' }
import { LIST_CENTROIDS, PLACE_CENTROIDS, matchProjectAnchor } from '../data/communities'
import { classifyPayment, paymentBucketCounts } from './payment-plan'
import type { Bedroom, LayoutPrice, MaterialKind, MaterialLink, Project, ProjectPhoto } from '../types'

interface TrelloCard {
  listName: string
  name: string
  desc: string
  url: string
  labels: string[]
}

export interface TrelloExport {
  board: string
  boardUrl: string
  exportedAt: string
  note?: string
  cards: TrelloCard[]
}

export interface InventorySnapshot {
  projects: Project[]
  exportedAt: string
  boardName: string
  boardUrl: string
  cardCount: number
  pinCount: number
}

const trello = trelloExport as TrelloExport
const SKIP_LIST = 'WHAT IS THE UPDATE'

function field(desc: string, label: string): string | null {
  const match = desc.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i'))
  return match ? match[1].trim() : null
}

function lineValue(desc: string, label: string): string | null {
  const match = desc.match(new RegExp(`^${label}:\\s*(.+)`, 'im'))
  return match ? match[1].trim() : null
}

function isMissing(value: string | null): boolean {
  if (!value) return true
  // Short tokens need a word boundary so Nakheel / Nad are not treated as "na".
  return /^(n\/a\b|na\b|none\b|not stated|not in\b|not on\b|pending\b|tba\b|unknown\b)/i.test(value.trim())
}

function parseSingleAed(text: string): number | null {
  if (/\d(?:\.\d+)?\s*[–—-]\s*\d/.test(text)) return null
  const match = text.match(/AED\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i)
  if (!match) return null
  const amount = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = (match[2] ?? '').toLowerCase()
  const scaled = unit === 'm' || unit === 'million' ? amount * 1_000_000 : unit === 'k' ? amount * 1_000 : amount
  return Math.round(scaled)
}

function layoutLines(desc: string): string[] {
  const lines = desc.split('\n')
  const start = lines.findIndex((line) => /starting prices by layout/i.test(line))
  if (start < 0) return []
  const rows: string[] = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) {
      if (rows.length > 0) break
      continue
    }
    if (line.startsWith('-')) {
      rows.push(line.replace(/^-\s*/, ''))
      continue
    }
    if (rows.length > 0) break
  }
  return rows
}

function parseLayouts(desc: string): LayoutPrice[] {
  return layoutLines(desc).map((row) => {
    const splitAt = row.indexOf(':')
    const label = (splitAt >= 0 ? row.slice(0, splitAt) : row).trim()
    const text = (splitAt >= 0 ? row.slice(splitAt + 1) : row).trim()
    return { label, text, amountAed: parseSingleAed(text) }
  })
}

function bedroomsFromText(text: string): Bedroom[] {
  const found = new Set<Bedroom>()
  if (/studio/i.test(text)) found.add('studio')
  const unit = '(?:BR|bed(?:room)?s?)'
  const range = text.match(new RegExp(`(\\d)\\s*[–—-]\\s*(\\d)\\s*${unit}`, 'i'))
  if (range) {
    const from = Number(range[1])
    const to = Number(range[2])
    for (let bed = from; bed <= to; bed += 1) found.add(bed >= 4 ? 4 : (bed as Bedroom))
  }
  for (const match of text.matchAll(new RegExp(`(\\d)\\s*${unit}\\b`, 'gi'))) {
    const bed = Number(match[1])
    if (bed > 0) found.add(bed >= 4 ? 4 : (bed as Bedroom))
  }
  return [...found]
}

function uniqueBedrooms(groups: Bedroom[][]): Bedroom[] {
  const order: Bedroom[] = ['studio', 1, 2, 3, 4]
  const found = new Set<Bedroom>(groups.flat())
  return order.filter((bed) => found.has(bed))
}

function parseHandoverYear(handover: string | null): number | null {
  if (!handover || isMissing(handover)) return null
  const years = [...handover.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]))
  const unique = [...new Set(years)]
  return unique.length === 1 ? unique[0] : null
}

function parseUnits(note: string | null): number | null {
  if (!note || isMissing(note)) return null
  if (/\d\s*[–—-]\s*\d/.test(note)) return null
  const match = note.match(/~?\s*(\d{1,4})\s*(residential|residences|units|apts|apartments|plots)?/i)
  if (!match) return null
  const count = Number(match[1])
  if (!Number.isFinite(count) || count <= 0 || count > 5000) return null
  return count
}

function parseLatLng(desc: string): { lat: number; lng: number } | null {
  const match =
    desc.match(/\*\*Coords:\*\*\s*(-?\d+(?:\.\d+)?)\s*[,/]\s*(-?\d+(?:\.\d+)?)/i) ??
    desc.match(/^Coords:\s*(-?\d+(?:\.\d+)?)\s*[,/]\s*(-?\d+(?:\.\d+)?)/im) ??
    desc.match(/Lat\s*\/\s*Lng:\s*(-?\d+(?:\.\d+)?)\s*[,/]\s*(-?\d+(?:\.\d+)?)/i)
  if (!match) return null
  let lat = Number(match[1])
  let lng = Number(match[2])
  if (lat > 40 && lng < 40) {
    const swap = lat
    lat = lng
    lng = swap
  }
  if (lat < 24.5 || lat > 25.6 || lng < 54.7 || lng > 55.7) return null
  return { lat, lng }
}

interface Anchor {
  lat: number
  lng: number
  clusterKey: string
  exact: boolean
  pinNote: string
}

function locate(listName: string, area: string | null, desc: string, title: string): Anchor {
  const exact = parseLatLng(desc)
  if (exact) {
    return {
      ...exact,
      clusterKey: `exact:${exact.lat.toFixed(5)},${exact.lng.toFixed(5)}`,
      exact: true,
      pinNote: /coords:/i.test(desc)
        ? 'Pin coordinates are the Coords line on the Trello card.'
        : 'Pin coordinates are the Lat/Lng line on the Trello card.',
    }
  }
  const named = matchProjectAnchor(title)
  if (named) {
    return {
      lat: named.lat,
      lng: named.lng,
      clusterKey: named.clusterKey,
      exact: false,
      pinNote: named.pinNote,
    }
  }
  const haystack = `${area ?? ''} ${listName}`.toLowerCase()
  const place = PLACE_CENTROIDS.find((entry) => haystack.includes(entry.match))
  const fallback = LIST_CENTROIDS[listName]
  const base = place ?? fallback
  if (!base) throw new Error(`No Dubai centroid for list “${listName}”`)
  return {
    lat: base.lat,
    lng: base.lng,
    clusterKey: place ? `place:${place.match}` : `list:${listName}`,
    exact: false,
    pinNote: place
      ? 'Spaced a short distance around the community so each card can be selected. Not the plot.'
      : `The card does not name a plot. Spaced a short distance around the “${listName}” list so each card can be selected.`,
  }
}

function fanAround(anchor: Anchor, count: number): { lat: number; lng: number }[] {
  const step = 0.00115
  const golden = Math.PI * (3 - Math.sqrt(5))
  const points: { lat: number; lng: number }[] = []
  for (let order = 0; order < count; order += 1) {
    if (count === 1) {
      points.push({ lat: anchor.lat, lng: anchor.lng })
      continue
    }
    const angle = order * golden
    let radius = step * Math.sqrt(order + 0.45)
    let lat = anchor.lat + Math.sin(angle) * radius
    let lng = anchor.lng + Math.cos(angle) * radius * 1.12
    let guard = 0
    while ((lat < 24.75 || lat > 25.45 || lng < 54.9 || lng > 55.55) && guard < 10) {
      radius *= 0.7
      lat = anchor.lat + Math.sin(angle) * radius
      lng = anchor.lng + Math.cos(angle) * radius * 1.12
      guard += 1
    }
    points.push({ lat, lng })
  }
  return points
}

function materialKind(label: string): MaterialKind {
  const text = label.toLowerCase()
  if (/floor\s*plan/.test(text)) return 'floor-plan'
  if (/master\s*plan/.test(text)) return 'masterplan'
  if (/fact\s*sheet|factsheet/.test(text)) return 'fact-sheet'
  if (/payment\s*plan/.test(text)) return 'payment-plan'
  if (/price\s*list|inventory|availability|sales[- ]offer|quotation/.test(text)) return 'price-list'
  if (/\.xlsx|\.xls/.test(text)) return 'price-list'
  if (/brochure/.test(text) || /\.pdf/.test(text)) return 'brochure'
  return 'file'
}

function materialsIn(desc: string): MaterialLink[] {
  const seen = new Set<string>()
  const links: MaterialLink[] = []
  function add(label: string, url: string) {
    const clean = url.replace(/[.,]+$/, '')
    if (seen.has(clean)) return
    seen.add(clean)
    const name = label.trim().replace(/\.$/, '') || 'File'
    links.push({ label: name, url: clean, kind: materialKind(name) })
  }
  for (const match of desc.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    add(match[1], match[2])
  }
  const sourceFile = desc.match(/^Source file:\s*(.+)$/im)?.[1]?.trim()
  for (const match of desc.matchAll(/https?:\/\/[^\s)]+/g)) {
    if (seen.has(match[0].replace(/[.,]+$/, ''))) continue
    const label = sourceFile && /drive\.google\.com/.test(match[0]) ? sourceFile : 'Google Drive file'
    add(label, match[0])
  }
  return links
}

interface CardFilesFile {
  byProjectId: Record<string, MaterialLink[]>
}

const cardFiles = cardFilesFile as CardFilesFile

function filesOnCard(id: string, fromDescription: MaterialLink[]): MaterialLink[] {
  const seen = new Set(fromDescription.map((link) => link.url))
  const extra = (cardFiles.byProjectId[id] ?? []).filter((link) => link.url && !seen.has(link.url))
  return [...fromDescription, ...extra]
}

function serviceChargeIn(desc: string): string | null {
  const match = desc.match(/service\s*charge\s*:?\s*(~?\s*AED\s*[\d.,]+\s*(?:\/\s*sq\.?\s*ft)?)/i)
  if (!match) return null
  return match[1].replace(/\s+/g, ' ').trim()
}

function sizeSummary(desc: string): string | null {
  const amounts: number[] = []
  for (const match of desc.matchAll(/([\d,]+(?:\.\d+)?)\s*sq\.?\s*ft/gi)) {
    const amount = Number(match[1].replace(/,/g, ''))
    if (amount >= 200 && amount <= 20_000) amounts.push(amount)
  }
  if (amounts.length === 0) return null
  const format = (amount: number) => Math.round(amount).toLocaleString('en-US')
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  if (Math.round(min) === Math.round(max)) return `${format(min)} sq ft`
  return `${format(min)}–${format(max)} sq ft`
}

function dateTokens(text: string): string[] {
  const tokens: string[] = []
  const dates =
    /Q([1-4])\s*(20\d{2})|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(20\d{2})|\b(20\d{2})\b/gi
  for (const match of text.matchAll(dates)) {
    if (match[1] && match[2]) tokens.push(`Q${match[1]} ${match[2]}`)
    else if (match[3] && match[4]) tokens.push(`${match[3].slice(0, 3)} ${match[4]}`)
    else if (match[5]) tokens.push(match[5])
    if (tokens.length === 2) break
  }
  return tokens
}

function completionOnLine(line: string): string | null {
  const match = line.match(
    /completion\s*(?:[:\-]|is)?\s*~?\s*(?:(Q[1-4])\s*(20\d{2})|(20\d{2})\s*Q([1-4])|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(20\d{2})|(20\d{2}))/i,
  )
  if (!match) return null
  if (match[1] && match[2]) return `Q${match[1]} ${match[2]}`
  if (match[3] && match[4]) return `Q${match[4]} ${match[3]}`
  if (match[5] && match[6]) return `${match[5].slice(0, 3)} ${match[6]}`
  return match[7] ?? null
}

function cleanHandover(raw: string | null, desc: string): string | null {
  if (raw && !isMissing(raw)) {
    const tokens = dateTokens(raw)
    if (tokens.length > 0) return tokens.join(' / ')
  }
  for (const line of desc.split('\n')) {
    const trimmed = line.trim()
    if (/^(last update|\*\*update)\b/i.test(trimmed)) continue
    if (/payment|post-handover|\bPHPP\b/i.test(trimmed)) continue
    const dated = completionOnLine(trimmed)
    if (dated) return dated
  }
  return null
}

function paymentSource(desc: string): string | null {
  const line = lineValue(desc, 'Payment plan') ?? lineValue(desc, 'Payment')
  if (line && !isMissing(line)) return line
  for (const row of desc.split('\n')) {
    if (/(?:payment\s*plan|\bplan)\s*[:~]?\s*~?\s*\d{1,2}\s*\/\s*\d{1,2}/i.test(row)) {
      return row.replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim()
    }
  }
  return null
}

interface ProjectMediaFile {
  byProjectId: Record<string, ProjectPhoto[]>
}

const projectMedia = projectMediaFile as ProjectMediaFile

function photosFor(id: string, name: string): ProjectPhoto[] {
  const photos = projectMedia.byProjectId[id] ?? []
  return photos
    .filter((photo) => photo.src && photo.thumb)
    .map((photo) => ({
      src: photo.src,
      thumb: photo.thumb,
      alt: photo.alt?.trim() || `${name} photo`,
    }))
}

function plainNotes(desc: string): string {
  return desc
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cardId(url: string, fallback: string): string {
  const match = url.match(/\/c\/([^/]+)/)
  return match?.[1] ?? fallback
}

function parseCard(card: TrelloCard, index: number): { project: Project; anchor: Anchor } {
  const parts = card.name.split(/\s+[–—]\s+/)
  const name = parts[0]?.trim() || card.name.trim()
  const developerField = field(card.desc, 'Developer / Project')
  const developerFromField = developerField?.split(/\s+\/\s+/)[0]?.trim() ?? null
  const developerFromTitle = parts.length >= 3 ? parts[1].trim() : null
  const developer = developerFromField || developerFromTitle
  const area = field(card.desc, 'Area')
  const propertyType = field(card.desc, 'Type')
  const layouts = parseLayouts(card.desc)
  const layoutAmounts = layouts.map((layout) => layout.amountAed).filter((amount): amount is number => amount != null)
  const titlePrice = parseSingleAed(parts.slice(2).join(' '))
  const startingPriceAed = layoutAmounts.length > 0 ? Math.min(...layoutAmounts) : titlePrice
  const payment = classifyPayment(paymentSource(card.desc))
  const handoverRaw =
    lineValue(card.desc, 'Handover') ??
    lineValue(card.desc, 'Handover / completion') ??
    lineValue(card.desc, 'Completion')
  const handover = cleanHandover(handoverRaw, card.desc)
  const psfRaw = lineValue(card.desc, 'PSF')
  const unitsNote = lineValue(card.desc, 'Units/stock note')
  const id = cardId(card.url, `card-${index}`)
  const point = locate(card.listName, area, card.desc, `${name} ${developer ?? ''}`)
  const materials = filesOnCard(id, materialsIn(card.desc))
  const bedroomSource = [
    card.name,
    card.desc,
    propertyType ?? '',
    unitsNote ?? '',
    ...materials.map((link) => link.label),
  ]
  return {
    project: {
    id,
    name,
    developer: developer && !isMissing(developer) ? developer : null,
    community: card.listName,
    area,
    lng: point.lng,
    lat: point.lat,
    pinNote: point.pinNote,
    startingPriceAed,
    layouts,
    bedrooms: uniqueBedrooms(bedroomSource.map(bedroomsFromText)),
    paymentPlan: payment.label,
    paymentBucket: payment.bucket,
    postHandover: payment.postHandover,
    paymentPlanNotes: payment.notes,
    handover,
    handoverYear: parseHandoverYear(handover),
    unitsAvailable: parseUnits(unitsNote),
    unitsNote: unitsNote && !isMissing(unitsNote) ? unitsNote : null,
    propertyType,
    source: 'our_listings',
    notes: plainNotes(card.desc),
    trelloUrl: card.url,
    labels: card.labels,
    materials,
    photos: photosFor(id, name),
    sizes: sizeSummary(card.desc),
    serviceCharge: serviceChargeIn(card.desc),
    psf: psfRaw && !isMissing(psfRaw) ? psfRaw : null,
    },
    anchor: point,
  }
}

function spreadInventory(drafts: { project: Project; anchor: Anchor }[]): Project[] {
  const groups = new Map<string, number[]>()
  drafts.forEach((draft, index) => {
    if (draft.anchor.exact) return
    const indexes = groups.get(draft.anchor.clusterKey) ?? []
    indexes.push(index)
    groups.set(draft.anchor.clusterKey, indexes)
  })
  for (const indexes of groups.values()) {
    const ordered = [...indexes].sort((a, b) => drafts[a].project.id.localeCompare(drafts[b].project.id))
    const points = fanAround(drafts[ordered[0]].anchor, ordered.length)
    ordered.forEach((index, order) => {
      drafts[index].project.lat = points[order].lat
      drafts[index].project.lng = points[order].lng
      drafts[index].project.pinNote = drafts[index].anchor.pinNote
    })
  }
  return drafts.map((draft) => draft.project)
}

export function parseInventoryExport(raw: TrelloExport): InventorySnapshot {
  if (!raw || !Array.isArray(raw.cards)) {
    throw new Error('Inventory refresh did not include cards.')
  }
  const inventoryCards = raw.cards.filter((card) => card.listName.trim().toUpperCase() !== SKIP_LIST)
  const projects = spreadInventory(inventoryCards.map(parseCard))
  if (projects.length !== inventoryCards.length) {
    throw new Error('Inventory parser dropped a Trello card')
  }
  if (projects.some((project) => project.community.toUpperCase() === SKIP_LIST)) {
    throw new Error('Update-list cards were included as pins')
  }
  const withPortal = applyPinOverrides(applyPortalPins(projects))
  for (const project of withPortal) {
    if (project.startingPriceAed != null && project.startingPriceAed < 100_000) {
      throw new Error(`Price looks unscaled for ${project.name}: ${project.startingPriceAed}`)
    }
    if (project.lat == null || project.lng == null) continue
    if (project.lat < 24.7 || project.lat > 25.5 || project.lng < 54.85 || project.lng > 55.6) {
      throw new Error(`Pin outside Dubai for ${project.name}`)
    }
  }
  return {
    projects: withPortal,
    exportedAt: raw.exportedAt,
    boardName: raw.board,
    boardUrl: raw.boardUrl,
    cardCount: raw.cards.length,
    pinCount: withPortal.filter((project) => project.lat != null && project.lng != null).length,
  }
}

interface PortalPin {
  project_name: string
  developer: string
  district_area: string
  property_type: string
  price_from_aed: number
  handover: string | null
  lat: number | null
  lng: number | null
  portal_id: string
  portal_url: string
}

const PORTAL_PINS = portalPinFile as PortalPin[]
const LOCATION_TBD = 'Location TBD. No portal coordinates, so this project is not pinned on the map.'

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 2 && !['the', 'at', 'by', 'and', 'for'].includes(word))
}

function portalMatchScore(projectName: string, recordName: string): number {
  const card = nameTokens(projectName)
  const record = nameTokens(recordName)
  if (card.length === 0 || record.length === 0) return 0
  const cardInRecord = card.every((token) => record.includes(token))
  const recordInCard = record.every((token) => card.includes(token))
  if (!cardInRecord && !recordInCard) return 0
  return Math.min(card.length, record.length)
}

function bestPortalIndex(projectName: string, used: Set<number>): number {
  let best = -1
  let bestScore = 0
  let ties = 0
  PORTAL_PINS.forEach((record, index) => {
    if (used.has(index)) return
    const score = portalMatchScore(projectName, record.project_name)
    if (score > bestScore) {
      best = index
      bestScore = score
      ties = 1
      return
    }
    if (score > 0 && score === bestScore) ties += 1
  })
  return ties === 1 ? best : -1
}

function projectFromPortal(record: PortalPin): Project {
  const placed = record.lat != null && record.lng != null
  return {
    id: `portal-${record.portal_id}`,
    name: record.project_name,
    developer: record.developer,
    community: record.district_area,
    area: record.district_area,
    lat: placed ? record.lat : null,
    lng: placed ? record.lng : null,
    pinNote: placed ? 'Pin coordinates are the portal listing.' : LOCATION_TBD,
    startingPriceAed: record.price_from_aed,
    layouts: [],
    bedrooms: bedroomsFromText(`${record.property_type} ${record.project_name}`),
    paymentPlan: null,
    paymentBucket: null,
    postHandover: false,
    paymentPlanNotes: null,
    handover: record.handover && !isMissing(record.handover) ? cleanHandover(record.handover, '') : null,
    handoverYear: parseHandoverYear(record.handover && !isMissing(record.handover) ? cleanHandover(record.handover, '') : null),
    unitsAvailable: null,
    unitsNote: null,
    propertyType: record.property_type,
    source: 'our_listings',
    notes: '',
    trelloUrl: record.portal_url,
    labels: [],
    materials: [],
    photos: [],
    sizes: null,
    serviceCharge: null,
    psf: null,
  }
}

interface PinOverride {
  name: string
  lat: number | null
  lng: number | null
  pinNote?: string
  outsideDubai?: boolean
}

const pinOverrides = pinOverrideFile as Record<string, PinOverride>

export function normalizeProjectName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function applyOverride(project: Project, entry: PinOverride): Project {
  if (entry.lat == null || entry.lng == null || entry.outsideDubai) {
    return { ...project, lat: null, lng: null, pinNote: 'Abu Dhabi (Al Bahyah)' }
  }
  const note = entry.pinNote?.trim()
  return { ...project, lat: entry.lat, lng: entry.lng, pinNote: note || project.pinNote }
}

/** Audit pins win over a card Coords line and over the list/community fallback. */
function applyPinOverrides(projects: Project[]): Project[] {
  const used = new Set<string>()
  const applied = new Set<number>()
  const next = projects.map((project, index) => {
    const entry = pinOverrides[project.id]
    if (!entry) return project
    used.add(project.id)
    applied.add(index)
    return applyOverride(project, entry)
  })
  const byName = new Map<string, { id: string; entry: PinOverride }[]>()
  for (const [id, entry] of Object.entries(pinOverrides)) {
    if (used.has(id)) continue
    const key = normalizeProjectName(entry.name)
    const list = byName.get(key) ?? []
    list.push({ id, entry })
    byName.set(key, list)
  }
  const pending = new Map<string, number[]>()
  next.forEach((project, index) => {
    if (applied.has(index)) return
    const key = normalizeProjectName(project.name)
    if (!byName.has(key)) return
    const indexes = pending.get(key) ?? []
    indexes.push(index)
    pending.set(key, indexes)
  })
  for (const [key, indexes] of pending) {
    const entries = [...(byName.get(key) ?? [])].sort((a, b) => a.id.localeCompare(b.id))
    const ordered = [...indexes].sort((a, b) => next[a].id.localeCompare(next[b].id))
    if (entries.length === 1 && ordered.length === 1) {
      next[ordered[0]] = applyOverride(next[ordered[0]], entries[0].entry)
      continue
    }
    if (entries.length > 1 && entries.length === ordered.length) {
      ordered.forEach((index, order) => {
        next[index] = applyOverride(next[index], entries[order].entry)
      })
    }
  }
  return next
}

function applyPortalPins(projects: Project[]): Project[] {
  const used = new Set<number>()
  const next = projects.map((project) => {
    const index = bestPortalIndex(project.name, used)
    if (index < 0) return project
    used.add(index)
    const record = PORTAL_PINS[index]
    if (record.lat == null || record.lng == null) {
      return { ...project, lat: null, lng: null, pinNote: LOCATION_TBD }
    }
    if (project.pinNote.startsWith('Pin coordinates are the')) return project
    return { ...project, lat: record.lat, lng: record.lng, pinNote: 'Pin coordinates are the portal listing.' }
  })
  PORTAL_PINS.forEach((record, index) => {
    if (!used.has(index)) next.push(projectFromPortal(record))
  })
  return next
}

export function inventoryCatalog(projects: Project[]) {
  return {
    developers: Array.from(
      new Set(projects.map((project) => project.developer).filter((developer): developer is string => Boolean(developer))),
    ).sort((a, b) => a.localeCompare(b)),
    paymentBuckets: paymentBucketCounts(projects),
    handoverYears: Array.from(
      new Set(projects.map((project) => project.handoverYear).filter((year): year is number => year != null)),
    ).sort((a, b) => a - b),
    suggestions: Array.from(
      new Set(projects.flatMap((project) => [project.name, project.community, project.area ?? ''].filter(Boolean))),
    ).sort((a, b) => a.localeCompare(b)),
  }
}

const boot = parseInventoryExport(trello)
const bootCatalog = inventoryCatalog(boot.projects)
export const PROJECTS = boot.projects
export const INVENTORY_EXPORTED_AT = boot.exportedAt
export const BOARD_URL = boot.boardUrl
export const BOARD_NAME = boot.boardName
export const DEVELOPERS = bootCatalog.developers
export const PAYMENT_BUCKETS = bootCatalog.paymentBuckets
export const HANDOVER_YEARS = bootCatalog.handoverYears
export const SUGGESTIONS = bootCatalog.suggestions
