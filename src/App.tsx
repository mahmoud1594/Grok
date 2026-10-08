import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INVENTORY_EXPORTED_AT, PROJECTS, inventoryCatalog, parseInventoryExport } from './data/projects'
import type { TrelloExport } from './lib/inventory'
import {
  DEFAULT_FILTERS,
  attributeFiltersActive,
  inLayer,
  matchesAll,
  matchesBase,
} from './lib/filter'
import type { FilterState, GeoFilter, LayerKey, MapMode, MenuId } from './types'
import Toolbar from './components/Toolbar'
import MapView, { type MapHandle } from './components/MapView'
import LayerPanel from './components/LayerPanel'
import ListView from './components/ListView'
import ProjectDrawer from './components/ProjectDrawer'
import BrochureModal from './components/BrochureModal'
import ClientsView from './components/ClientsView'
import SecondaryMap from './components/SecondaryMap'
import UnitsView from './components/UnitsView'
import LeadsView from './components/LeadsView'
import OffPlanView from './components/OffPlanView'
import NewsView from './components/NewsView'
import CalendarView from './components/CalendarView'
import WhatsAppView from './components/WhatsAppView'
import ListingsCheckView from './components/ListingsCheckView'
import SettingsView from './components/SettingsView'
import EmailContactsView from './components/EmailContactsView'
import type { AppTab } from './components/AppTabs'
import type { BasemapId } from './lib/basemap'
import { tabFromMatch, type RouteMatch } from './lib/routes'
import NotOnMapList from './components/NotOnMapList'

const RADIUS_OPTIONS = [2, 3, 5, 8, 12]

interface AppProps {
  match: RouteMatch
  onTab: (tab: AppTab) => void
}

export default function App({ match, onTab }: AppProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [geo, setGeo] = useState<GeoFilter>({ type: 'none' })
  const [mode, setMode] = useState<MapMode>('pan')
  const [radiusKm, setRadiusKm] = useState(5)
  const [listOpen, setListOpen] = useState(false)
  const [menu, setMenu] = useState<MenuId>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [brochureId, setBrochureId] = useState<string | null>(null)
  const [basemap, setBasemap] = useState<BasemapId>('street')
  const tab = tabFromMatch(match)
  const [projects, setProjects] = useState(PROJECTS)
  const [exportedAt, setExportedAt] = useState(INVENTORY_EXPORTED_AT)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null)
  const mapRef = useRef<MapHandle>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const onMenu = useCallback((next: MenuId) => setMenu(next), [])

  const catalog = useMemo(() => inventoryCatalog(projects), [projects])

  const visible = useMemo(
    () => projects.filter((project) => matchesAll(project, filters, geo)),
    [projects, filters, geo],
  )
  const pinned = useMemo(
    () => visible.filter((project) => project.lat != null && project.lng != null),
    [visible],
  )
  const unpinned = useMemo(
    () => visible.filter((project) => project.lat == null || project.lng == null),
    [visible],
  )

  const layerCounts = useMemo(() => {
    const base = projects.filter((project) => matchesBase(project, filters, geo))
    return {
      our_listings: base.filter((project) => inLayer(project, 'our_listings')).length,
      has_price: base.filter((project) => inLayer(project, 'has_price')).length,
      price_not_on_card: base.filter((project) => inLayer(project, 'price_not_on_card')).length,
      units_available: base.filter((project) => inLayer(project, 'units_available')).length,
    }
  }, [projects, filters, geo])

  const selected = projects.find((project) => project.id === selectedId) ?? null
  const brochure = projects.find((project) => project.id === brochureId) ?? null

  const refreshInventory = useCallback(async () => {
    setRefreshing(true)
    setRefreshNotice(null)
    try {
      const response = await fetch('/api/inventory/refresh', { method: 'POST' })
      const body = (await response.json()) as TrelloExport & { error?: string; instructions?: string }
      if (!response.ok) {
        const detail = [body.error, body.instructions].filter(Boolean).join('\n\n')
        setRefreshNotice(detail || 'Trello refresh failed. The saved inventory is still on the map.')
        return
      }
      const next = parseInventoryExport(body)
      setProjects(next.projects)
      setExportedAt(next.exportedAt)
      setRefreshNotice(`Trello Dubai updated. ${next.pinCount} project pins.`)
    } catch (error) {
      const parsed = error instanceof Error && !/fetch|network|failed to/i.test(error.message)
      setRefreshNotice(
        parsed
          ? `${error.message} Pins on the map were not replaced.`
          : 'Refresh did not reach the server. The saved inventory is still on the map. Run npm run dev with TRELLO_KEY and TRELLO_TOKEN set on the server.',
      )
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (menu) {
        setMenu(null)
        return
      }
      if (brochureId) {
        setBrochureId(null)
        return
      }
      if (selectedId) {
        setSelectedId(null)
        return
      }
      if (mode !== 'pan') setMode('pan')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, brochureId, selectedId, mode])

  useEffect(() => {
    if (tab !== 'map') return
    const frame = requestAnimationFrame(() => mapRef.current?.resize())
    return () => cancelAnimationFrame(frame)
  }, [tab])

  useEffect(() => {
    const el = chromeRef.current
    if (!el) return
    const apply = () => {
      const height = Math.ceil(el.getBoundingClientRect().height)
      document.documentElement.style.setProperty('--bar-h', `${height + 22}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const toggleMode = (next: 'draw' | 'radius') => {
    setMode((current) => (current === next ? 'pan' : next))
    setGeo((current) => {
      if (next === 'draw' && current.type === 'radius') return { type: 'none' }
      if (next === 'radius' && current.type === 'bbox') return { type: 'none' }
      return current
    })
  }

  const toggleLayer = (layer: LayerKey) => {
    setFilters((current) => ({
      ...current,
      layers: { ...current.layers, [layer]: !current.layers[layer] },
    }))
  }

  const geoLabel =
    geo.type === 'radius' ? `${geo.km} km radius` : geo.type === 'bbox' ? 'Drawn area' : null

  return (
    <div className={`app${selected && tab === 'map' ? ' drawer-open' : ''}`}>
      <div className={tab === 'map' ? 'map-shell' : 'map-shell is-hidden'} hidden={tab !== 'map'}>
      <div className="chrome" ref={chromeRef}>
      <Toolbar
        filters={filters}
        mode={mode}
        geoLabel={geoLabel}
        listOpen={listOpen}
        basemap={basemap}
        shown={visible.length}
        total={projects.length}
        developers={catalog.developers}
        paymentBuckets={catalog.paymentBuckets}
        handoverYears={catalog.handoverYears}
        suggestions={catalog.suggestions}
        exportedAt={exportedAt}
        refreshing={refreshing}
        onRefresh={() => {
          void refreshInventory()
        }}
        menu={menu}
        filtersActive={attributeFiltersActive(filters)}
        onFilters={setFilters}
        onMenu={onMenu}
        onMode={toggleMode}
        onClearGeo={() => {
          setMode('pan')
          setGeo({ type: 'none' })
        }}
        onFit={() => mapRef.current?.fit()}
        onToggleList={() => setListOpen((open) => !open)}
        onResetFilters={() =>
          setFilters((current) => ({
            ...DEFAULT_FILTERS,
            layers: current.layers,
          }))
        }
        onBasemap={setBasemap}
        onTab={onTab}
      />
      </div>
      <div className="stage">
        <MapView
          ref={mapRef}
          projects={pinned}
          selectedId={selectedId}
          mode={mode}
          geo={geo}
          basemap={basemap}
          showRings={filters.layers.units_available}
          onSelect={setSelectedId}
          onRadius={(lng, lat) => setGeo({ type: 'radius', lng, lat, km: radiusKm })}
          onBbox={(bounds) => {
            setGeo({ type: 'bbox', ...bounds })
            setMode('pan')
          }}
        />
        {refreshNotice ? <div className="hint refresh-note">{refreshNotice}</div> : null}
        {!listOpen && visible.length === 0 ? (
          <div className="empty-map">No projects match these filters.</div>
        ) : null}
        {!listOpen ? <NotOnMapList projects={unpinned} onSelect={setSelectedId} /> : null}
        {!listOpen && visible.length > 0 && pinned.length === 0 ? (
          <div className="empty-map">
            Location TBD for {visible.map((project) => project.name).join(', ')}. No map pin was added.
          </div>
        ) : null}
        {!listOpen && mode === 'draw' ? (
          <div className="hint">Drag a rectangle. Projects outside it hide. Other filters still apply.</div>
        ) : null}
        {!listOpen && mode === 'radius' ? (
          <div className="hint radius-hint">
            <span>Click the map to drop a pin and circle. Projects outside it hide.</span>
            <div className="segmented" role="group" aria-label="Radius size">
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  className={radiusKm === km ? 'seg on' : 'seg'}
                  onClick={() => {
                    setRadiusKm(km)
                    setGeo((current) => (current.type === 'radius' ? { ...current, km } : current))
                  }}
                >
                  {km} km
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {!listOpen ? (
          <>
            <LayerPanel filters={filters} counts={layerCounts} onToggle={toggleLayer} />
          </>
        ) : (
          <ListView projects={visible} selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {selected ? (
          <ProjectDrawer
            project={selected}
            hiddenByFilters={!visible.some((project) => project.id === selected.id)}
            onClose={() => setSelectedId(null)}
            onBrochure={() => setBrochureId(selected.id)}
          />
        ) : null}
      </div>
      {brochure && tab === 'map' ? <BrochureModal project={brochure} onClose={() => setBrochureId(null)} /> : null}
      </div>
      {tab === 'clients' ? <ClientsView onTab={onTab} /> : null}
      {match.id === 'units' ? <UnitsView onTab={onTab} /> : null}
      {match.id === 'offplan' ? <OffPlanView onTab={onTab} projects={projects} exportedAt={exportedAt} /> : null}
      {tab === 'news' ? <NewsView onTab={onTab} projects={projects} /> : null}
      {tab === 'calendar' ? <CalendarView onTab={onTab} /> : null}
      {tab === 'whatsapp' ? <WhatsAppView onTab={onTab} /> : null}
      {tab === 'listings' ? <ListingsCheckView onTab={onTab} /> : null}
      {tab === 'email' ? <EmailContactsView onTab={onTab} /> : null}
      {tab === 'settings' ? <SettingsView onTab={onTab} /> : null}
      {tab === 'secondary' ? (
        <SecondaryMap onTab={onTab} communitySlug={match.params.communitySlug} />
      ) : null}
      {tab === 'leads' ? <LeadsView onTab={onTab} /> : null}
    </div>
  )
}
