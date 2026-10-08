import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { GeoFilter } from '../types'

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthKm = 6371
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * earthKm * Math.asin(Math.sqrt(a))
}

export function normalizeBbox(
  lngA: number,
  latA: number,
  lngB: number,
  latB: number,
): { west: number; south: number; east: number; north: number } {
  return {
    west: Math.min(lngA, lngB),
    east: Math.max(lngA, lngB),
    south: Math.min(latA, latB),
    north: Math.max(latA, latB),
  }
}

export function rectangleRing(west: number, south: number, east: number, north: number): number[][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ]
}

export function circleRing(lng: number, lat: number, radiusKm: number, steps = 64): number[][] {
  const earthKm = 6371
  const lat1 = (lat * Math.PI) / 180
  const lng1 = (lng * Math.PI) / 180
  const angular = radiusKm / earthKm
  const ring: number[][] = []
  for (let step = 0; step <= steps; step += 1) {
    const bearing = (step / steps) * 2 * Math.PI
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    )
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      )
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return ring
}

function polygonFeature(ring: number[][]): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

export function geoFilterCollection(geo: GeoFilter): FeatureCollection {
  if (geo.type === 'none') {
    return { type: 'FeatureCollection', features: [] }
  }
  if (geo.type === 'bbox') {
    return {
      type: 'FeatureCollection',
      features: [polygonFeature(rectangleRing(geo.west, geo.south, geo.east, geo.north))],
    }
  }
  return {
    type: 'FeatureCollection',
    features: [
      polygonFeature(circleRing(geo.lng, geo.lat, geo.km)),
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [geo.lng, geo.lat] },
      },
    ],
  }
}

export function pointInGeo(lat: number, lng: number, geo: GeoFilter): boolean {
  if (geo.type === 'none') return true
  if (geo.type === 'radius') return haversineKm(lat, lng, geo.lat, geo.lng) <= geo.km
  return lng >= geo.west && lng <= geo.east && lat >= geo.south && lat <= geo.north
}
