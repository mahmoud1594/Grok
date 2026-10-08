import type { FilterState, GeoFilter, LayerKey, Project } from '../types'
import { pointInGeo } from './geo'

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  developers: [],
  bedrooms: [],
  paymentPlans: [],
  handoverYears: [],
  priceMin: null,
  priceMax: null,
  layers: {
    our_listings: true,
    has_price: true,
    price_not_on_card: true,
    units_available: false,
  },
}

export function attributeFiltersActive(filters: FilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.developers.length > 0 ||
    filters.bedrooms.length > 0 ||
    filters.paymentPlans.length > 0 ||
    filters.handoverYears.length > 0 ||
    filters.priceMin != null ||
    filters.priceMax != null
  )
}

export function hasStatedUnits(project: Project): boolean {
  return project.unitsAvailable != null && project.unitsAvailable > 0
}

export function matchesBase(project: Project, filters: FilterState, geo: GeoFilter): boolean {
  const query = filters.search.trim().toLowerCase()
  if (query) {
    const haystack = `${project.name} ${project.community} ${project.developer ?? ''} ${project.area ?? ''}`.toLowerCase()
    if (!haystack.includes(query)) return false
  }
  if (
    filters.developers.length > 0 &&
    (project.developer == null || !filters.developers.includes(project.developer))
  ) {
    return false
  }
  if (
    filters.bedrooms.length > 0 &&
    !project.bedrooms.some((bedroom) => filters.bedrooms.includes(bedroom))
  ) {
    return false
  }
  if (filters.paymentPlans.length > 0) {
    const matchesPlan = filters.paymentPlans.some((bucket) =>
      bucket === 'Post-handover plans' ? project.postHandover : project.paymentBucket === bucket,
    )
    if (!matchesPlan) return false
  }
  if (
    filters.handoverYears.length > 0 &&
    (project.handoverYear == null || !filters.handoverYears.includes(project.handoverYear))
  ) {
    return false
  }
  let min = filters.priceMin
  let max = filters.priceMax
  if (min != null && max != null && min > max) {
    const swap = min
    min = max
    max = swap
  }
  if (min != null || max != null) {
    if (project.startingPriceAed == null) return false
    if (min != null && project.startingPriceAed < min) return false
    if (max != null && project.startingPriceAed > max) return false
  }
  if (project.lat == null || project.lng == null) return geo.type === 'none'
  return pointInGeo(project.lat, project.lng, geo)
}

export function inLayer(project: Project, layer: LayerKey): boolean {
  if (layer === 'our_listings') return project.source === 'our_listings'
  if (layer === 'has_price') return project.startingPriceAed != null
  if (layer === 'price_not_on_card') return project.startingPriceAed == null
  if (layer === 'units_available') return hasStatedUnits(project)
  return false
}

export function matchesAll(project: Project, filters: FilterState, geo: GeoFilter): boolean {
  if (!matchesBase(project, filters, geo)) return false
  if (!filters.layers.our_listings) return false
  const priced = project.startingPriceAed != null
  if (priced && !filters.layers.has_price) return false
  if (!priced && !filters.layers.price_not_on_card) return false
  if (filters.layers.units_available && !hasStatedUnits(project)) return false
  return true
}
