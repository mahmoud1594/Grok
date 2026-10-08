/**
 * Secondary map communities. Points are community centres (OpenStreetMap where it has the community,
 * otherwise the developer / listing-site location). A card is pinned near its community point.
 * This file is not a unit or owner database.
 * Community page URLs use slugify(label), for example /secondary/tilal-al-ghaf. Aliases and titles also resolve.
 * Trello Secondary board (MGYdwKGJ) list names map here through `aliases`.
 */
import { slugify } from '../lib/slug'

export interface SecondaryCommunity {
  id: string
  label: string
  /** Spoken name when the chip label is abbreviated. */
  title?: string
  /** Other names for this community, e.g. the Trello list name. Matched case-insensitively. */
  aliases?: string[]
  lat: number | null
  lng: number | null
}

export const SECONDARY_COMMUNITIES: SecondaryCommunity[] = [
  { id: 'tilal-al-ghaf', label: 'Tilal Al Ghaf', lat: 25.02433, lng: 55.22392 },
  { id: 'the-acres', label: 'The Acres', aliases: ['Acres'], lat: 25.04925, lng: 55.29606 },
  { id: 'the-oasis', label: 'The Oasis', aliases: ['Oasis', 'The Oasis by Emaar'], lat: 24.999, lng: 55.2215 },
  { id: 'grand-polo', label: 'Grand Polo', title: 'Grand Polo Club & Resort', aliases: ['Grand Polo Club'], lat: 24.96592, lng: 55.22794 },
  { id: 'emirates-hills', label: 'Emirates Hills', lat: 25.06399, lng: 55.16458 },
  { id: 'emirates-living', label: 'Emirates Living', aliases: ['The Springs', 'The Meadows', 'The Lakes'], lat: 25.0665, lng: 55.18 },
  { id: 'the-valley', label: 'The Valley', lat: 25.01147, lng: 55.44707 },
  {
    id: 'ar-1',
    label: 'AR 1',
    title: 'Arabian Ranches 1',
    // The Trello list is just "Arabian Ranches"; cards that name 2 or 3 go to AR 2 / AR 3.
    aliases: ['Arabian Ranches', 'AR1', 'Arabian Ranches I'],
    lat: 25.05357,
    lng: 55.27548,
  },
  { id: 'ar-2', label: 'AR 2', title: 'Arabian Ranches 2', aliases: ['AR2', 'Arabian Ranches II'], lat: 25.03483, lng: 55.27192 },
  { id: 'ar-3', label: 'AR 3', title: 'Arabian Ranches 3', aliases: ['AR3', 'Arabian Ranches III'], lat: 25.06516, lng: 55.32279 },
  { id: 'nad-al-sheba-gardens', label: 'Nad Al Sheba Gardens', lat: 25.13228, lng: 55.32244 },
  { id: 'damac-hills', label: 'Damac Hills', aliases: ['DAMAC Hills', 'Damac Hills 1'], lat: 25.0264, lng: 55.2512 },
  { id: 'damac-lagoons', label: 'Damac Lagoons', aliases: ['DAMAC Lagoons'], lat: 25.01922, lng: 55.23612 },
  { id: 'damac-islands', label: 'Damac Islands', aliases: ['DAMAC Islands'], lat: 25.02307, lng: 55.29612 },
  { id: 'dubai-hills', label: 'Dubai Hills', title: 'Dubai Hills Estate', aliases: ['Dubai Hills Estate'], lat: 25.11, lng: 55.25 },
  { id: 'jumeirah-golf-estates', label: 'Jumeirah Golf Estates', aliases: ['JGE'], lat: 25.0219, lng: 55.1981 },
  { id: 'town-square', label: 'Town Square', lat: 25.0076, lng: 55.2878 },
  { id: 'villanova', label: 'Villanova', lat: 25.075, lng: 55.3595 },
  { id: 'the-fields', label: 'The Fields', lat: 25.1221, lng: 55.3421 },
  { id: 'arabella-mudon', label: 'Arabella (Mudon)', title: 'Arabella, Mudon', aliases: ['Arabella', 'Mudon', 'Arabella Mudon'], lat: 25.0204, lng: 55.268 },
  { id: 'rukan', label: 'Rukan', lat: 25.0424, lng: 55.2881 },
]

function key(value: string): string {
  return slugify(value)
}

export function communitySlug(label: string): string {
  return slugify(label)
}

export function communityFromSlug(slug: string): SecondaryCommunity | null {
  const k = key(slug)
  if (!k) return null
  return (
    SECONDARY_COMMUNITIES.find(
      (item) =>
        key(item.label) === k ||
        item.id === k ||
        (item.title ? key(item.title) === k : false) ||
        (item.aliases ?? []).some((alias) => key(alias) === k),
    ) ?? null
  )
}

/** "Arabian Ranches 2", "AR2", "AR-3 ..." inside a card title. */
function arabianRanchesNumber(text: string): 1 | 2 | 3 | null {
  const m = text.match(/\b(?:arabian\s+ranches|ranches|ar)\s*[-#]?\s*(1|2|3|i{1,3})\b/i)
  if (!m) return null
  const v = m[1].toLowerCase()
  if (v === '1' || v === 'i') return 1
  if (v === '2' || v === 'ii') return 2
  return 3
}

/** Villa collections that only exist in one community. Used when a card's list says nothing (e.g. SOLD). */
const TITLE_HINTS: { re: RegExp; id: string }[] = [
  { re: /\b(tierra|palmiera|palace\s+ostra|ostra|mirage|lavita)\b/i, id: 'the-oasis' },
]

/**
 * CRM community for a Trello list name (or a card's previous list) plus its title.
 * Returns null when nothing matches; the card is then listed under "Not on map".
 */
export function resolveCommunity(listOrCommunity: string | null | undefined, title?: string | null): SecondaryCommunity | null {
  const text = title ?? ''
  const base = listOrCommunity ? communityFromSlug(listOrCommunity) : null
  if (base && base.id.startsWith('ar-')) {
    const n = arabianRanchesNumber(text)
    if (n) return SECONDARY_COMMUNITIES.find((item) => item.id === `ar-${n}`) ?? base
  }
  if (base && base.id === 'emirates-living' && /emirates\s+hills/i.test(text)) {
    return SECONDARY_COMMUNITIES.find((item) => item.id === 'emirates-hills') ?? base
  }
  if (base) return base
  for (const hint of TITLE_HINTS) {
    if (hint.re.test(text)) return SECONDARY_COMMUNITIES.find((item) => item.id === hint.id) ?? null
  }
  return null
}
