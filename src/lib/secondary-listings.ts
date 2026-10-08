import { PROJECTS } from '../data/projects'
import { SECONDARY_COMMUNITIES } from '../data/secondary'
import type { GeoFilter } from '../types'
import { pointInGeo } from './geo'
import { matchesAudience, pocketFlag, type Unit, type UnitAudience } from './units'

export interface PlacedUnit {
  unit: Unit
  lat: number | null
  lng: number | null
}

export interface SecondaryFilters {
  search: string
  community: string
  purpose: string
  pocket: string
  audience: UnitAudience
  priceMin: string
  priceMax: string
  /** SOLD cards stay hidden unless this is on. */
  showSold?: boolean
}

interface Point {
  lat: number
  lng: number
}

function norm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001
}

function uniquePoint(points: Point[]): Point | null {
  if (points.length === 0) return null
  const first = points[0]
  return points.every((point) => samePoint(point, first)) ? first : null
}

function addPoint(index: Map<string, Point[]>, key: string, point: Point) {
  if (!key) return
  const list = index.get(key) ?? []
  list.push(point)
  index.set(key, list)
}

const projectNames = new Map<string, Point[]>()
const projectCommunities = new Map<string, Point[]>()
const namedPlaces = new Map<string, Point | 'ambiguous'>()

function putNamed(key: string, point: Point) {
  if (!key) return
  const existing = namedPlaces.get(key)
  if (!existing) namedPlaces.set(key, point)
  else if (existing === 'ambiguous' || !samePoint(existing, point)) namedPlaces.set(key, 'ambiguous')
}

for (const project of PROJECTS) {
  if (project.lat == null || project.lng == null) continue
  const point = { lat: project.lat, lng: project.lng }
  addPoint(projectNames, norm(project.name), point)
  addPoint(projectCommunities, norm(project.community), point)
}

for (const community of SECONDARY_COMMUNITIES) {
  if (community.lat == null || community.lng == null) continue
  const point = { lat: community.lat, lng: community.lng }
  putNamed(norm(community.label), point)
  if (community.title) putNamed(norm(community.title), point)
  for (const alias of community.aliases ?? []) putNamed(norm(alias), point)
}

function namedPoint(key: string): Point | null {
  const value = namedPlaces.get(key)
  if (!value || value === 'ambiguous') return null
  return value
}

/** Pin only when a project or community name matches one verified point already in the app. */
export function placeUnit(unit: Unit): PlacedUnit {
  if (unit.pointLat != null && unit.pointLng != null) return { unit, lat: unit.pointLat, lng: unit.pointLng }
  if (unit.source === 'trello') {
    // Trello cards: the community decides the point (card types like "Tierra" are not project names).
    const communityKey = unit.community ? norm(unit.community) : ''
    const point = communityKey ? namedPoint(communityKey) : null
    return { unit, lat: point?.lat ?? null, lng: point?.lng ?? null }
  }
  const projectKey = unit.project ? norm(unit.project) : ''
  const communityKey = unit.community ? norm(unit.community) : ''
  const point =
    (projectKey ? uniquePoint(projectNames.get(projectKey) ?? []) ?? namedPoint(projectKey) : null) ??
    (communityKey ? uniquePoint(projectCommunities.get(communityKey) ?? []) ?? namedPoint(communityKey) : null)
  return { unit, lat: point?.lat ?? null, lng: point?.lng ?? null }
}

/** ~330 m between neighbours on a sunflower spiral, so cards in one community do not stack on one dot. */
const JITTER_STEP_DEG = 0.003
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function jitterPoint(lat: number, lng: number, index: number): Point {
  if (index === 0) return { lat, lng }
  const r = JITTER_STEP_DEG * Math.sqrt(index)
  const a = index * GOLDEN_ANGLE
  return { lat: lat + r * Math.sin(a), lng: lng + (r * Math.cos(a)) / Math.cos((lat * Math.PI) / 180) }
}

export function placeUnits(units: Unit[]): PlacedUnit[] {
  const rows = units.map(placeUnit)
  const seen = new Map<string, number>()
  return rows.map((row) => {
    if (row.lat == null || row.lng == null) return row
    if (row.unit.pointLat != null && row.unit.pointLng != null) return row
    const k = `${row.lat.toFixed(5)},${row.lng.toFixed(5)}`
    const index = seen.get(k) ?? 0
    seen.set(k, index + 1)
    const point = jitterPoint(row.lat, row.lng, index)
    return { ...row, lat: point.lat, lng: point.lng }
  })
}

export function askingAmount(unit: Unit): number | null {
  if (!unit.askingPriceAed) return null
  const numeric = unit.askingPriceAed.replace(/,/g, '').replace(/[^\d.]/g, '')
  if (!numeric) return null
  const amount = Number(numeric)
  return Number.isFinite(amount) ? amount : null
}

function numberOrNull(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const amount = Number(text)
  return Number.isFinite(amount) ? amount : null
}

export function matchesSecondaryFilters(row: PlacedUnit, filters: SecondaryFilters): boolean {
  const { unit } = row
  if (unit.sold && !filters.showSold) return false
  if (!matchesAudience(unit, filters.audience ?? 'all')) return false
  if (filters.community && unit.community !== filters.community) return false
  if (filters.purpose && (unit.purpose ?? '').toLowerCase() !== filters.purpose.toLowerCase()) return false
  if (filters.pocket) {
    const flag = pocketFlag(unit.pocketListing)
    if (filters.pocket === 'yes' && flag !== 'yes') return false
    if (filters.pocket === 'no' && flag !== 'no') return false
  }
  let min = numberOrNull(filters.priceMin)
  let max = numberOrNull(filters.priceMax)
  if (min != null && max != null && min > max) {
    const swap = min
    min = max
    max = swap
  }
  if (min != null || max != null) {
    const amount = askingAmount(unit)
    if (amount == null) return false
    if (min != null && amount < min) return false
    if (max != null && amount > max) return false
  }
  const needle = filters.search.trim().toLowerCase()
  if (!needle) return true
  const haystack = [unit.title, unit.listName, unit.ownerName, unit.community, unit.project, unit.unitNumber, unit.notes, unit.unitId, ...(unit.labels ?? []).map((l) => l.name)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

export function splitPlaced(rows: PlacedUnit[], geo: GeoFilter): { pinned: PlacedUnit[]; unpinned: PlacedUnit[] } {
  const pinned: PlacedUnit[] = []
  const unpinned: PlacedUnit[] = []
  for (const row of rows) {
    if (row.lat == null || row.lng == null) {
      unpinned.push(row)
      continue
    }
    if (pointInGeo(row.lat, row.lng, geo)) pinned.push(row)
  }
  return { pinned, unpinned }
}
