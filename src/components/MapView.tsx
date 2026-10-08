import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { projectFacts } from '../lib/format'
import type { GeoFilter, MapMode, Project } from '../types'
import { applyEnglishLabels, basemapStyle, firstSymbolLayerId, type BasemapId } from '../lib/basemap'
import { geoFilterCollection, normalizeBbox, rectangleRing } from '../lib/geo'

export interface MapHandle {
  fit: () => void
  resize: () => void
}

interface MapViewProps {
  projects: Project[]
  selectedId: string | null
  mode: MapMode
  geo: GeoFilter
  basemap: BasemapId
  showRings: boolean
  onSelect: (id: string | null) => void
  onRadius: (lng: number, lat: number) => void
  onBbox: (bounds: { west: number; south: number; east: number; north: number }) => void
}

function projectsCollection(
  projects: Project[],
  selectedId: string | null,
  showRings: boolean,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: projects.flatMap((project) => {
      if (project.lat == null || project.lng == null) return []
      return [
        {
          type: 'Feature' as const,
          properties: {
            id: project.id,
            name: project.name,
            community: project.community,
            priced: project.startingPriceAed == null ? 0 : 1,
            selected: project.id === selectedId ? 1 : 0,
            ring: showRings && project.unitsAvailable != null && project.unitsAvailable > 0 ? 1 : 0,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [project.lng, project.lat],
          },
        },
      ]
    }),
  }
}

const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const readyRef = useRef(false)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const sync = () => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const current = propsRef.current
    const projectsSource = map.getSource('projects') as GeoJSONSource | undefined
    const geoSource = map.getSource('geo-filter') as GeoJSONSource | undefined
    const collection = projectsCollection(current.projects, current.selectedId, current.showRings)
    projectsSource?.setData(collection)
    geoSource?.setData(geoFilterCollection(current.geo))
    const pinVisibility = collection.features.length === 0 ? 'none' : 'visible'
    for (const layerId of ['pin-halo', 'pin-rings', 'pins']) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', pinVisibility)
    }
    if (collection.features.length === 0) map.triggerRepaint()
  }

  useImperativeHandle(ref, () => ({
    resize() {
      mapRef.current?.resize()
    },
    fit() {
      const map = mapRef.current
      const { projects } = propsRef.current
      if (!map || projects.length === 0) return
      const bounds = new maplibregl.LngLatBounds()
      let placed = 0
      for (const project of projects) {
        if (project.lat == null || project.lng == null) continue
        bounds.extend([project.lng, project.lat])
        placed += 1
      }
      if (placed === 0) return
      map.fitBounds(bounds, { padding: { top: 120, right: 80, bottom: 80, left: 80 }, maxZoom: 13, duration: 450 })
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: basemapStyle(propsRef.current.basemap),
      center: [55.24, 25.1],
      zoom: 10.7,
      maxZoom: 17,
      fadeDuration: 0,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right')
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.boxZoom.disable()
    mapRef.current = map

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16,
      className: 'pin-popup',
    })
    popupRef.current = popup

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
            geometry: {
              type: 'Polygon',
              coordinates: [rectangleRing(bounds.west, bounds.south, bounds.east, bounds.north)],
            },
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
      const tiny =
        Math.abs(bounds.east - bounds.west) < 0.004 && Math.abs(bounds.north - bounds.south) < 0.004
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
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 18,
          attribution:
            'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        })
        const beforeLabels = firstSymbolLayerId(map)
        map.addLayer(
          {
            id: 'satellite-raster',
            type: 'raster',
            source: 'satellite-raster',
            layout: {
              visibility: propsRef.current.basemap === 'satellite' ? 'visible' : 'none',
            },
          },
          beforeLabels,
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
          paint: {
            'circle-radius': 4,
            'circle-color': '#1d1d1f',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })
      }
      if (!map.getSource('projects')) {
        map.addSource('projects', {
          type: 'geojson',
          data: projectsCollection(
            propsRef.current.projects,
            propsRef.current.selectedId,
            propsRef.current.showRings,
          ),
        })
        map.addLayer({
          id: 'pin-halo',
          type: 'circle',
          source: 'projects',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 14, 12],
            'circle-color': '#ffffff',
            'circle-opacity': 0.94,
          },
        })
        map.addLayer({
          id: 'pin-rings',
          type: 'circle',
          source: 'projects',
          filter: ['==', ['get', 'ring'], 1],
          paint: {
            'circle-radius': 16,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#1d1d1f',
            'circle-stroke-width': 2,
          },
        })
        map.addLayer({
          id: 'pins',
          type: 'circle',
          source: 'projects',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 10, 8],
            'circle-color': ['case', ['==', ['get', 'priced'], 1], '#c45c5c', '#6e6e73'],
            'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1.5],
            'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#1d1d1f', '#ffffff'],
          },
        })
      }
      readyRef.current = true
      sync()
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
        const projectId = String(feature.properties?.id ?? '')
        const project = propsRef.current.projects.find((item) => item.id === projectId)
        const tip = document.createElement('div')
        tip.className = 'pin-tip'
        const title = document.createElement('strong')
        title.textContent = project?.name ?? String(feature.properties?.name ?? '')
        tip.append(title)
        if (project) {
          const list = document.createElement('dl')
          for (const fact of projectFacts(project)) {
            const term = document.createElement('dt')
            term.textContent = fact.label
            const detail = document.createElement('dd')
            detail.textContent = fact.value
            if (fact.missing) detail.className = 'missing'
            list.append(term, detail)
          }
          tip.append(list)
        }
        popup.setLngLat(event.lngLat).setDOMContent(tip).addTo(map)
      })
      map.on('mouseleave', 'pins', () => {
        popup.remove()
        map.getCanvas().style.cursor = propsRef.current.mode === 'pan' ? '' : 'crosshair'
      })

      map.on('click', (event) => {
        const mode = propsRef.current.mode
        if (mode === 'radius') {
          propsRef.current.onRadius(event.lngLat.lng, event.lngLat.lat)
          return
        }
        if (mode !== 'pan') return
        const pinLayer = map.getLayer('pins')
        if (!pinLayer) return
        const hits = map.queryRenderedFeatures(
          [
            [event.point.x - 8, event.point.y - 8],
            [event.point.x + 8, event.point.y + 8],
          ],
          { layers: ['pins'] },
        )
        const raw = hits[0]?.properties?.id
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
      map.remove()
      if (mapRef.current === map) mapRef.current = null
    }
    // Map instance is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sync()
  }, [props.projects, props.selectedId, props.showRings, props.geo])

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
    map.setLayoutProperty(
      'satellite-raster',
      'visibility',
      props.basemap === 'satellite' ? 'visible' : 'none',
    )
  }, [props.basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.selectedId) return
    const project = props.projects.find((item) => item.id === props.selectedId)
    if (!project || project.lat == null || project.lng == null || !map.isStyleLoaded()) return
    const point = map.project([project.lng, project.lat])
    const width = map.getContainer().clientWidth
    const drawerEdge = width - 430
    if (point.x > drawerEdge) {
      map.panBy([point.x - drawerEdge + 28, 0], { duration: 280 })
    }
  }, [props.selectedId])

  return <div ref={containerRef} className="map" />
})

export default MapView
