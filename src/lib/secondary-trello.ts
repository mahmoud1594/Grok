import { resolveCommunity } from '../data/secondary'
import { readBearer } from './session'
import { UNITS, unitTrelloHref, type Unit } from './units'

/** One card from GET /api/secondary. Descriptions are never sent. */
export interface SecondaryCard {
  id: string
  title: string
  unitCode: string | null
  unitType: string | null
  bedrooms: number | null
  listName: string
  community: string | null
  sold: boolean
  url: string | null
  labels: { name: string; color: string | null }[]
  coverUrl: string | null
  lat: number | null
  lng: number | null
}

export interface SecondaryFeed {
  cards: SecondaryCard[]
  fetchedAt: string | null
  boardUrl: string
  stale: boolean
}

export const SECONDARY_BOARD_URL = 'https://trello.com/b/MGYdwKGJ/secondary'

export async function fetchSecondaryFeed(signal?: AbortSignal): Promise<SecondaryFeed> {
  const token = readBearer()
  const response = await fetch('/api/secondary', {
    method: 'GET',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  })
  if (response.status === 401) throw new Error('Sign in again to load the Trello Secondary board.')
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    cards?: SecondaryCard[]
    fetchedAt?: string
    board?: { url?: string }
    stale?: boolean
  }
  if (!response.ok || !body.ok) {
    const reason = body.error === 'trello_not_configured' ? 'Trello is not connected on the server.' : 'Trello did not answer.'
    throw new Error(`${reason} (${response.status})`)
  }
  return {
    cards: Array.isArray(body.cards) ? body.cards : [],
    fetchedAt: body.fetchedAt ?? null,
    boardUrl: body.board?.url ?? SECONDARY_BOARD_URL,
    stale: Boolean(body.stale),
  }
}

/** Trello card -> the Unit shape the Secondary map already renders. No owner, phone or price fields. */
export function cardToUnit(card: SecondaryCard): Unit {
  const community = resolveCommunity(card.community, card.title)
  return {
    id: `trello-${card.id}`,
    unitId: card.unitCode,
    ownerName: null,
    phone: null,
    community: community?.label ?? card.community ?? null,
    project: card.unitType,
    unitNumber: card.unitCode,
    purpose: null,
    askingPriceAed: null,
    pocketListing: null,
    pocketListingDetails: null,
    dldHistory: null,
    notes: null,
    trelloUrl: unitTrelloHref(card.url),
    source: 'trello',
    title: card.title,
    listName: card.listName,
    sold: card.sold,
    labels: card.labels,
    coverUrl: card.coverUrl && card.coverUrl.startsWith('/api/secondary') ? card.coverUrl : card.coverUrl?.startsWith('https://') ? card.coverUrl : null,
    bedrooms: card.bedrooms,
    unitType: card.unitType,
    pointLat: card.lat,
    pointLng: card.lng,
  }
}

function idKey(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Trello cards first. A Units sheet row (units.json) with the same unit ID or the same Trello card link fills
 * the card's empty fields. Sheet rows that match no card are kept as they are, so the old feed still works.
 */
export function mergeWithSheet(cards: SecondaryCard[], sheet: Unit[] = UNITS): Unit[] {
  const units = cards.map(cardToUnit)
  const used = new Set<string>()
  for (const unit of units) {
    const match = sheet.find(
      (row) =>
        !used.has(row.id) &&
        ((unit.unitId && idKey(row.unitId) === idKey(unit.unitId)) || (unit.trelloUrl && row.trelloUrl && row.trelloUrl.startsWith(unit.trelloUrl))),
    )
    if (!match) continue
    used.add(match.id)
    for (const field of ['ownerName', 'phone', 'project', 'purpose', 'askingPriceAed', 'pocketListing', 'pocketListingDetails', 'dldHistory', 'notes'] as const) {
      if (unit[field] == null && match[field] != null) unit[field] = match[field]
    }
    if (!unit.community && match.community) unit.community = match.community
  }
  const rest = sheet.filter((row) => !used.has(row.id)).map((row) => ({ ...row, source: 'sheet' as const }))
  return [...units, ...rest]
}
