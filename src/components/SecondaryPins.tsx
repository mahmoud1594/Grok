import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import type { GeoFilter, MapMode } from '../types'
import { applyEnglishLabels, basemapStyle, firstSymbolLayerId, type BasemapId } from '../lib/basemap'
import { geoFilterCollection, normalizeBbox, rectangleRing } from '../lib/geo'
import type { PlacedUnit } from '../lib/secondary-listings'

export interface SecondaryPinsHandle {
  fit: () => void
  resize: () => void
}

interface SecondaryPinsProps {
  focus?: { lng: number; lat: number } | null
  rows: PlacedUnit[]
  selectedId: string | null
  mode: MapMode
  geo: GeoFilter
  basemap: BasemapId
  onSelect: (id: string | null) => void
  onRadius: (lng: number, lat: number) => void
  onBbox: (bounds: { west: number; south: number; east: number; north: number }) => void
}

function listingsCollection(rows: PlacedUnit[], selectedId: string | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: rows.flatMap((row) => {
      if (row.lat == null || row.lng == null) return []
      return [
        {
          type: 'Feature' as const,
          properties: {
            id: row.unit.id,
            name: row.unit.title ?? row.unit.ownerName ?? row.unit.project ?? row.unit.community ?? 'Unit',
            community: row.unit.community ?? '',
            url: row.unit.trelloUrl ?? '',
            priced: row.unit.askingPriceAed || row.unit.source === 'trello' ? 1 : 0,
            sold: row.unit.sold ? 1 : 0,
            selected: row.unit.id === selectedId ? 1 : 0,
          },
          geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] },
        },
      ]
    }),
  }
}

function styleFont(map: MlMap): string[] {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue
    const font = layer.layout?.['text-font']
    if (Array.isArray(font) && font.length > 0 && typeof font[0] === 'string') return font as string[]
  }
  return ['Noto Sans Regular']
}

const SecondaryPins = forwardRef<SecondaryPinsHandle, SecondaryPinsProps>(function SecondaryPins(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const readyRef = useRef(false)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const clickPopupRef = useRef<maplibregl.Popup | null>(null)
  const fittedRef = useRef(false)
  const propsRef = useRef(props)
  propsRef.current = props

  const sync = () => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const current = propsRef.current
    const source = map.getSource('listings') as GeoJSONSource | undefined
    const geoSource = map.getSource('geo-filter') as GeoJSONSource | undefined
    const collection = listingsCollection(current.rows, current.selectedId)
    source?.setData(collection)
    geoSource?.setData(geoFilterCollection(current.geo))
    const pinVisibility = collection.features.length === 0 ? 'none' : 'visible'
    for (const layerId of ['pin-halo', 'pins', 'listing-clusters', 'listing-count']) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', pinVisibility)
    }
    if (collection.features.length === 0) map.triggerRepaint()
    // Rows arrive after the map loads (live Trello feed): frame them once, unless a community page set the view.
    if (!fittedRef.current && collection.features.length > 0) {
      fittedRef.current = true
      if (!current.focus) {
        const bounds = new maplibregl.LngLatBounds()
        for (const feature of collection.features) bounds.extend(feature.geometry.coordinates as [number, number])
        map.fitBounds(bounds, { padding: { top: 150, right: 80, bottom: 150, left: 80 }, maxZoom: 12, duration: 0 })
      }
    }
  }

  useImperativeHandle(ref, () => ({
    resize() {
      mapRef.current?.resize()
    },
    fit() {
      const map = mapRef.current
      const { rows } = propsRef.current
      if (!map) return
      const bounds = new maplibregl.LngLatBounds()
      let placed = 0
      for (const row of rows) {
        if (row.lat == null || row.lng == null) continue
        bounds.extend([row.lng, row.lat])
        placed += 1
      }
      if (placed === 0) return
      map.fitBounds(bounds, { padding: { top: 140, right: 80, bottom: 120, left: 80 }, maxZoom: 13, duration: 450 })
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const focus = propsRef.current.focus
    const map = new maplibregl.Map({
      container,
      style: basemapStyle(propsRef.current.basemap),
      center: focus ? [focus.lng, focus.lat] : [55.24, 25.1],
      zoom: focus ? 13 : 10.7,
      maxZoom: 17,
      fadeDuration: 0,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right')
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.boxZoom.disable()
    mapRef.current = map

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'pin-popup' })
    popupRef.current = popup
    const clickPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 16, className: 'pin-popup pin-popup-card' })
    clickPopupRef.current = clickPopup

    const openCardPopup = (lngLat: maplibregl.LngLatLike, properties: Record<string, unknown> | null | undefined) => {
      const tip = document.createElement('div')
      tip.className = 'pin-tip'
      const title = document.createElement('strong')
      title.textContent = String(properties?.name ?? '')
      const community = document.createElement('span')
      community.textContent = `${String(properties?.community ?? '')}${Number(properties?.sold) === 1 ? ' · SOLD' : ''}`
      tip.append(title, community)
      const href = String(properties?.url ?? '')
      if (/^https:\/\/(www\.)?trello\.com\//.test(href)) {
        const link = document.createElement('a')
        link.href = href
        link.target = '_blank'
        link.rel = 'noopener'
        link.textContent = 'Open in Trello'
        link.className = 'pin-tip-link'
        tip.append(link)
      }
      popup.remove()
      clickPopup.setLngLat(lngLat).setDOMContent(tip).addTo(map)
    }

    let dead = false
    let dragging = false
    let start: maplibregl.LngLat | null = null
    let onWindowMouseUp: ((event: MouseEvent) => void) | null = null

    const previewBox = (a: maplibregl.LngLat, b: maplibregl.LngLat) => {
      const bounds = normalizeBbox(a.lng, a.lat, b.lng, b.lat)
      const source = map.getSource('geo-filter') as GeoJSONSource | undefined
      source?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [rectangleRing(bounds.west, bounds.south, bounds.east, bounds.north)] },
          },
        ],
      })
    }

    const finishDraw = (lng: number, lat: number) => {
      if (!dragging || !start) return
      dragging = false
      const origin = start
      start = null
      const bounds = normalizeBbox(origin.lng, origin.lat, lng, lat)
      const tiny = Math.abs(bounds.east - bounds.west) < 0.004 && Math.abs(bounds.north - bounds.south) < 0.004
      if (tiny) {
        sync()
        return
      }
      propsRef.current.onBbox(bounds)
    }

    const installOverlays = () => {
      if (dead) return
      map.dragRotate.disable()
      map.touchZoomRotate.disableRotation()
      applyEnglishLabels(map)
      if (!map.getSource('satellite-raster')) {
        map.addSource('satellite-raster', {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        })
        map.addLayer(
          {
            id: 'satellite-raster',
            type: 'raster',
            source: 'satellite-raster',
            layout: { visibility: propsRef.current.basemap === 'satellite' ? 'visible' : 'none' },
          },
          firstSymbolLayerId(map),
        )
      }
      if (!map.getSource('geo-filter')) {
        map.addSource('geo-filter', { type: 'geojson', data: geoFilterCollection(propsRef.current.geo) })
        map.addLayer({
          id: 'geo-fill',
          type: 'fill',
          source: 'geo-filter',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#c45c5c', 'fill-opacity': 0.16 },
        })
        map.addLayer({
          id: 'geo-line-halo',
          type: 'line',
          source: 'geo-filter',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'line-color': '#ffffff', 'line-width': 4 },
        })
        map.addLayer({
          id: 'geo-line',
          type: 'line',
          source: 'geo-filter',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'line-color': '#1d1d1f', 'line-width': 1.5, 'line-dasharray': [1.6, 1.2] },
        })
        map.addLayer({
          id: 'geo-center',
          type: 'circle',
          source: 'geo-filter',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 4, 'circle-color': '#1d1d1f', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
        })
      }
      if (!map.getSource('listings')) {
        map.addSource('listings', {
          type: 'geojson',
          data: listingsCollection(propsRef.current.rows, propsRef.current.selectedId),
          cluster: true,
          clusterRadius: 42,
          clusterMaxZoom: 12,
        })
        map.addLayer({
          id: 'listing-clusters',
          type: 'circle',
          source: 'listings',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#c45c5c',
            'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 12, 24],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })
        map.addLayer({
          id: 'listing-count',
          type: 'symbol',
          source: 'listings',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
            'text-font': styleFont(map),
          },
          paint: { 'text-color': '#ffffff' },
        })
        map.addLayer({
          id: 'pin-halo',
          type: 'circle',
          source: 'listings',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 14, 12],
            'circle-color': '#ffffff',
            'circle-opacity': 0.94,
          },
        })
        map.addLayer({
          id: 'pins',
          type: 'circle',
          source: 'listings',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 10, 8],
            'circle-color': ['case', ['==', ['get', 'sold'], 1], '#b0b0b5', ['==', ['get', 'priced'], 1], '#c45c5c', '#6e6e73'],
            'circle-opacity': ['case', ['==', ['get', 'sold'], 1], 0.75, 1],
            'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1.5],
            'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#1d1d1f', '#ffffff'],
          },
        })
      }
      readyRef.current = true
      sync()
      const bounds = new maplibregl.LngLatBounds()
      let placed = 0
      for (const row of propsRef.current.rows) {
        if (row.lat == null || row.lng == null) continue
        bounds.extend([row.lng, row.lat])
        placed += 1
      }
      if (placed > 0 && !propsRef.current.focus && !fittedRef.current) {
        fittedRef.current = true
        map.fitBounds(bounds, { padding: { top: 150, right: 80, bottom: 150, left: 80 }, maxZoom: 12, duration: 0 })
      }
    }

    let eventsBound = false
    map.on('load', () => {
      if (dead) return
      installOverlays()
      if (eventsBound) return
      eventsBound = true

      map.on('mousemove', 'pins', (event) => {
        if (propsRef.current.mode !== 'pan') return
        const feature = event.features?.[0]
        if (!feature) return
        map.getCanvas().style.cursor = 'pointer'
        const tip = document.createElement('div')
        tip.className = 'pin-tip'
        const title = document.createElement('strong')
        title.textContent = String(feature.properties?.name ?? '')
        const community = document.createElement('span')
        community.textContent = String(feature.properties?.community ?? '')
        tip.append(title, community)
        popup.setLngLat(event.lngLat).setDOMContent(tip).addTo(map)
      })
      map.on('mouseleave', 'pins', () => {
        popup.remove()
        map.getCanvas().style.cursor = propsRef.current.mode === 'pan' ? '' : 'crosshair'
      })
      map.on('mouseenter', 'listing-clusters', () => {
        if (propsRef.current.mode === 'pan') map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'listing-clusters', () => {
        map.getCanvas().style.cursor = propsRef.current.mode === 'pan' ? '' : 'crosshair'
      })

      map.on('click', (event) => {
        const mode = propsRef.current.mode
        if (mode === 'radius') {
          propsRef.current.onRadius(event.lngLat.lng, event.lngLat.lat)
          return
        }
        if (mode !== 'pan') return
        const layers = ['pins', 'listing-clusters'].filter((id) => map.getLayer(id))
        const hits = map.queryRenderedFeatures(
          [
            [event.point.x - 10, event.point.y - 10],
            [event.point.x + 10, event.point.y + 10],
          ],
          { layers },
        )
        const hit = hits[0]
        if (!hit) {
          clickPopup.remove()
          propsRef.current.onSelect(null)
          return
        }
        if (hit.properties?.cluster) {
          const source = map.getSource('listings') as GeoJSONSource
          const clusterId = Number(hit.properties.cluster_id)
          void source.getClusterExpansionZoom(clusterId).then(async (zoom) => {
            const geometry = hit.geometry
            if (geometry.type !== 'Point') return
            const [lng, lat] = geometry.coordinates
            if (zoom > map.getZoom() + 0.05) {
              map.easeTo({ center: [lng, lat], zoom })
              return
            }
            const leaves = await source.getClusterLeaves(clusterId, 20, 0)
            const raw = leaves[0]?.properties?.id
            propsRef.current.onSelect(raw == null ? null : String(raw))
          })
          return
        }
        const raw = hit.properties?.id
        if (hit.geometry.type === 'Point') openCardPopup(hit.geometry.coordinates as [number, number], hit.properties)
        propsRef.current.onSelect(raw == null ? null : String(raw))
      })

      map.on('mousedown', (event) => {
        if (propsRef.current.mode !== 'draw') return
        if (event.originalEvent.button !== 0) return
        event.preventDefault()
        start = event.lngLat
        dragging = true
      })
      map.on('mousemove', (event) => {
        if (!dragging || !start || propsRef.current.mode !== 'draw') return
        previewBox(start, event.lngLat)
      })
      onWindowMouseUp = (event: MouseEvent) => {
        if (!dragging || !start) return
        const rect = map.getCanvas().getBoundingClientRect()
        const point = new maplibregl.Point(event.clientX - rect.left, event.clientY - rect.top)
        const lngLat = map.unproject(point)
        finishDraw(lngLat.lng, lngLat.lat)
      }
      window.addEventListener('mouseup', onWindowMouseUp)
    })

    return () => {
      dead = true
      readyRef.current = false
      if (onWindowMouseUp) window.removeEventListener('mouseup', onWindowMouseUp)
      popup.remove()
      clickPopup.remove()
      map.remove()
      if (mapRef.current === map) mapRef.current = null
    }
  }, [])

  useEffect(() => {
    sync()
  }, [props.rows, props.selectedId, props.geo])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvas()
    popupRef.current?.remove()
    if (props.mode === 'draw') {
      map.dragPan.disable()
      map.doubleClickZoom.disable()
      canvas.style.cursor = 'crosshair'
      return
    }
    map.dragPan.enable()
    if (props.mode === 'radius') {
      map.doubleClickZoom.disable()
      canvas.style.cursor = 'crosshair'
      return
    }
    map.doubleClickZoom.enable()
    canvas.style.cursor = ''
  }, [props.mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('satellite-raster')) return
    map.setLayoutProperty('satellite-raster', 'visibility', props.basemap === 'satellite' ? 'visible' : 'none')
  }, [props.basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.selectedId) return
    const row = props.rows.find((item) => item.unit.id === props.selectedId)
    if (!row || row.lat == null || row.lng == null || !map.isStyleLoaded()) return
    const point = map.project([row.lng, row.lat])
    const drawerEdge = map.getContainer().clientWidth - 430
    if (point.x > drawerEdge) map.panBy([point.x - drawerEdge + 28, 0], { duration: 280 })
  }, [props.selectedId])

  return <div ref={containerRef} className="map" />
})

export default SecondaryPins
