import unitsExport from '../data/units.json' with { type: 'json' }
import { WHATSAPP_E164, formatAed } from './format'
import { formatLeadPhone } from './leads'
import { whatsappDigits } from './phone'
import { BRAND } from './brand'

export interface Unit {
  id: string
  unitId: string | null
  ownerName: string | null
  phone: string | null
  community: string | null
  project: string | null
  unitNumber: string | null
  purpose: string | null
  askingPriceAed: string | null
  pocketListing: string | null
  pocketListingDetails: string | null
  dldHistory: string | null
  notes: string | null
  trelloUrl: string | null
  /** Where the row came from. Sheet rows (units.json) have no source set. */
  source?: 'trello' | 'sheet'
  /** Trello card title (Secondary board). */
  title?: string | null
  /** Trello list the card sits in, e.g. "The Oasis" or "SOLD". */
  listName?: string | null
  /** Card is in the SOLD list or carries a SOLD label. */
  sold?: boolean
  labels?: { name: string; color: string | null }[]
  /** Same-origin cover image URL (proxied by /api/secondary), when the card has one. */
  coverUrl?: string | null
  bedrooms?: number | null
  unitType?: string | null
  /** Exact point from the card (title or Google Maps link). Wins over the community point. */
  pointLat?: number | null
  pointLng?: number | null
}

interface RawUnit {
  unitId?: string
  ownerName?: string
  phone?: string
  community?: string
  project?: string
  unitNumber?: string
  purpose?: string
  askingPriceAed?: string
  pocketListing?: string
  pocketListingDetails?: string
  dldHistory?: string
  notes?: string
  trelloUrl?: string
}

interface UnitsExport {
  source?: string
  sheetId?: string
  sheetUrl?: string
  tab?: string
  exportedAt?: string
  units?: RawUnit[]
}

const feed = unitsExport as UnitsExport

export const UNITS_SOURCE = feed.source ?? 'Secondary Units sheet'

export type UnitAudience = 'all' | 'pocket' | 'owners'

/** Pocket listings are Yes. Owners are No or blank. Any other value stays in All only. */
export function matchesAudience(unit: Unit, audience: UnitAudience): boolean {
  if (audience === 'all') return true
  const flag = pocketFlag(unit.pocketListing)
  if (audience === 'pocket') return flag === 'yes'
  return !unit.pocketListing || flag === 'no'
}

export const UNITS_SHEET_URL = feed.sheetUrl ?? ''
export const UNITS_TAB = feed.tab ?? 'Units'
export const UNITS_EXPORTED_AT = feed.exportedAt ?? ''

function blank(value: string | undefined): string | null {
  const text = value?.trim() ?? ''
  return text ? text : null
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

function parseUnit(raw: RawUnit, index: number): Unit {
  const phoneText = blank(raw.phone)
  return {
    id: blank(raw.unitId) || `unit-${index}`,
    unitId: blank(raw.unitId),
    ownerName: blank(raw.ownerName),
    phone: phoneText ? digitsOnly(phoneText) : null,
    community: blank(raw.community),
    project: blank(raw.project),
    unitNumber: blank(raw.unitNumber),
    purpose: blank(raw.purpose),
    askingPriceAed: blank(raw.askingPriceAed),
    pocketListing: blank(raw.pocketListing),
    pocketListingDetails: blank(raw.pocketListingDetails),
    dldHistory: blank(raw.dldHistory),
    notes: blank(raw.notes),
    trelloUrl: unitTrelloHref(raw.trelloUrl),
  }
}

/** Keep only https://trello.com card (/c/) or board (/b/) links. */
export function unitTrelloHref(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  if (!text) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host !== 'trello.com' && host !== 'www.trello.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if ((parts[0] !== 'c' && parts[0] !== 'b') || !parts[1]) return null
  return url.toString()
}

export const UNITS: Unit[] = (feed.units ?? []).map(parseUnit)

export const UNIT_COMMUNITIES = Array.from(
  new Set(UNITS.map((unit) => unit.community).filter((community): community is string => Boolean(community))),
).sort((a, b) => a.localeCompare(b))

export function formatAskingPrice(raw: string | null): string | null {
  if (!raw) return null
  const numeric = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  if (!numeric) return raw
  const amount = Number(numeric)
  if (!Number.isFinite(amount)) return raw
  return formatAed(amount)
}

export function pocketFlag(value: string | null): 'yes' | 'no' | null {
  if (!value) return null
  const text = value.trim().toLowerCase()
  if (text === 'yes' || text === 'y') return 'yes'
  if (text === 'no' || text === 'n') return 'no'
  return null
}

export function formatUnitPhone(phone: string): string {
  return formatLeadPhone(phone)
}

export function unitWhatsappHref(unit: Unit): string | null {
  const phone = whatsappDigits(unit.phone)
  if (!phone || phone === WHATSAPP_E164) return null
  const subject = unit.project ?? unit.community ?? unit.unitNumber ?? 'your unit'
  const line = unit.ownerName
    ? `Hello ${unit.ownerName}, this is ${BRAND} following up on ${subject}.`
    : `Hello, this is ${BRAND} following up on ${subject}.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(line)}`
}

export function unitMatches(unit: Unit, query: string, community: string, purpose: string, pocket: string): boolean {
  if (community && unit.community !== community) return false
  if (purpose && (unit.purpose ?? '').toLowerCase() !== purpose.toLowerCase()) return false
  if (pocket) {
    const flag = pocketFlag(unit.pocketListing)
    if (pocket === 'yes' && flag !== 'yes') return false
    if (pocket === 'no' && flag !== 'no') return false
  }
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    unit.unitId,
    unit.ownerName,
    unit.phone,
    unit.community,
    unit.project,
    unit.unitNumber,
    unit.purpose,
    unit.askingPriceAed,
    unit.pocketListing,
    unit.pocketListingDetails,
    unit.dldHistory,
    unit.notes,
    unit.trelloUrl,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}
