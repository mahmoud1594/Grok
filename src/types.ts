export type SourceLayer = 'projects' | 'our_listings' | 'competitor_launches'

export type LayerKey = 'our_listings' | 'has_price' | 'price_not_on_card' | 'units_available'

export type Bedroom = 'studio' | 1 | 2 | 3 | 4

export interface LayoutPrice {
  label: string
  text: string
  amountAed: number | null
}

export type MaterialKind =
  | 'brochure'
  | 'floor-plan'
  | 'payment-plan'
  | 'price-list'
  | 'fact-sheet'
  | 'masterplan'
  | 'file'

export interface MaterialLink {
  label: string
  url: string
  kind: MaterialKind
}

export interface ProjectPhoto {
  src: string
  thumb: string
  alt: string
}

export interface Project {
  id: string
  name: string
  developer: string | null
  community: string
  area: string | null
  lng: number | null
  lat: number | null
  pinNote: string
  startingPriceAed: number | null
  layouts: LayoutPrice[]
  bedrooms: Bedroom[]
  paymentPlan: string | null
  paymentBucket: string | null
  postHandover: boolean
  paymentPlanNotes: string | null
  handover: string | null
  handoverYear: number | null
  unitsAvailable: number | null
  unitsNote: string | null
  propertyType: string | null
  source: SourceLayer
  notes: string
  trelloUrl: string
  labels: string[]
  materials: MaterialLink[]
  photos: ProjectPhoto[]
  sizes: string | null
  serviceCharge: string | null
  psf: string | null
}

export type MapMode = 'pan' | 'draw' | 'radius'

export type GeoFilter =
  | { type: 'none' }
  | { type: 'radius'; lng: number; lat: number; km: number }
  | { type: 'bbox'; west: number; south: number; east: number; north: number }

export interface FilterState {
  search: string
  developers: string[]
  bedrooms: Bedroom[]
  paymentPlans: string[]
  handoverYears: number[]
  priceMin: number | null
  priceMax: number | null
  layers: Record<LayerKey, boolean>
}

export type MenuId = 'developer' | 'bedrooms' | 'payment' | 'handover' | 'price' | null
