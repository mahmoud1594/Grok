import type { ExpressionSpecification, Map as MlMap, StyleSpecification } from 'maplibre-gl'

export type BasemapId = 'street' | 'satellite'

/** Light vector basemap. OpenStreetMap data via OpenFreeMap. No API key. */
export const STREET_STYLE = 'https://tiles.openfreemap.org/styles/positron'

/**
 * Esri World Imagery. Public raster tiles, no API key.
 * Tile order is {z}/{y}/{x}, which is different from OSM.
 */
export function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution:
          'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },
    },
    layers: [{ id: 'satellite-base', type: 'raster', source: 'satellite' }],
  }
}

export function basemapStyle(id: BasemapId): string | StyleSpecification {
  return id === 'satellite' ? satelliteStyle() : STREET_STYLE
}

/**
 * OpenFreeMap Positron prints Latin plus Arabic when a name has a non-Latin form.
 * Noto Sans on that style does not draw Arabic, so Dubai labels look broken.
 * English only: name_en, then name:en, then the Latin name. Never the Arabic field.
 */
export const ENGLISH_LABEL: ExpressionSpecification = [
  'coalesce',
  ['get', 'name_en'],
  ['get', 'name:en'],
  ['get', 'name:latin'],
]

export function applyEnglishLabels(map: MlMap) {
  const layers = map.getStyle().layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    const field = layer.layout?.['text-field']
    if (field == null) continue
    const serialized = JSON.stringify(field)
    if (serialized.includes('"ref"') && !serialized.includes('name')) continue
    map.setLayoutProperty(layer.id, 'text-field', ENGLISH_LABEL)
  }
}

export function firstSymbolLayerId(map: MlMap): string | undefined {
  return (map.getStyle().layers ?? []).find((layer) => layer.type === 'symbol')?.id
}
