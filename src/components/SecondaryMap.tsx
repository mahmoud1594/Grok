import { useEffect, useMemo, useRef, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import ReportIssueButton from './ReportIssue'
import { UnitTrelloRow } from './UnitLinks'
import SecondaryPins, { type SecondaryPinsHandle } from './SecondaryPins'
import type { BasemapId } from '../lib/basemap'
import { WHATSAPP_DISPLAY, WHATSAPP_E164, formatAed } from '../lib/format'
import type { GeoFilter, MapMode } from '../types'
import {
  matchesSecondaryFilters,
  placeUnits,
  splitPlaced,
  askingAmount,
  type PlacedUnit,
  type SecondaryFilters,
} from '../lib/secondary-listings'
import { communityFromSlug } from '../data/secondary'
import { UNITS, formatAskingPrice, formatUnitPhone, pocketFlag, unitWhatsappHref } from '../lib/units'
import AudienceToggle from './AudienceToggle'
import { fetchSecondaryFeed, mergeWithSheet, SECONDARY_BOARD_URL, type SecondaryFeed } from '../lib/secondary-trello'
import { BRAND, BrandMark } from '../lib/brand'

const NOT_ON_SHEET = 'Not on sheet'
const RADIUS_OPTIONS = [2, 3, 5, 8, 12]
const EMPTY_COPY = 'No secondary listings yet — add cards to the Trello Secondary board'

const INITIAL_FILTERS: SecondaryFilters = {
  search: '',
  community: '',
  purpose: '',
  pocket: '',
  audience: 'all',
  priceMin: '',
  priceMax: '',
  showSold: false,
}

type FeedState = { status: 'loading' } | { status: 'ready'; feed: SecondaryFeed } | { status: 'error'; message: string }

/** Community names like "The Oasis" already include the article, so the panel must not say "Near the The Oasis". */
function nearCentreNote(community: string | null | undefined): string {
  const name = (community ?? '').trim()
  if (!name) return 'Near the community centre (approximate).'
  if (/^the\b/i.test(name)) return `Near ${name} centre (approximate).`
  return `Near the ${name} centre (approximate).`
}

function feedTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' })
}

interface SecondaryMapProps {
  onTab: (tab: AppTab) => void
  communitySlug?: string
}

function show(value: string | null | undefined): string {
  return value && value.trim() ? value : NOT_ON_SHEET
}

function purposeClass(purpose: string | null): string {
  if (purpose && /^sale$/i.test(purpose)) return 'tag priced'
  if (purpose && /^rent$/i.test(purpose)) return 'tag rent'
  return 'tag'
}

function bookingHref(row: PlacedUnit): string {
  const { unit } = row
  const lines = [
    `Hello ${BRAND}, I would like to book a viewing.`,
    `Owner: ${show(unit.ownerName)}`,
    `Project: ${show(unit.project)}`,
    `Community: ${show(unit.community)}`,
    `Unit: ${show(unit.unitNumber)}`,
    `Purpose: ${show(unit.purpose)}`,
    `Asking: ${formatAskingPrice(unit.askingPriceAed) ?? NOT_ON_SHEET}`,
  ]
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(lines.join('\n'))}`
}

export default function SecondaryMap({ onTab, communitySlug }: SecondaryMapProps) {
  const pinsRef = useRef<SecondaryPinsHandle>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLElement>(null)
  const [filters, setFilters] = useState<SecondaryFilters>(INITIAL_FILTERS)
  const [geo, setGeo] = useState<GeoFilter>({ type: 'none' })
  const [mode, setMode] = useState<MapMode>('pan')
  const [radiusKm, setRadiusKm] = useState(5)
  const [basemap, setBasemap] = useState<BasemapId>('street')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const community = useMemo(
    () => (communitySlug ? communityFromSlug(communitySlug) : null),
    [communitySlug],
  )

  useEffect(() => {
    setFilters((current) => ({ ...current, community: community?.label ?? '' }))
  }, [community])

  const [feedState, setFeedState] = useState<FeedState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setFeedState((current) => (current.status === 'ready' ? current : { status: 'loading' }))
    fetchSecondaryFeed(ctrl.signal)
      .then((feed) => setFeedState({ status: 'ready', feed }))
      .catch((error: unknown) => {
        if (ctrl.signal.aborted) return
        setFeedState({ status: 'error', message: error instanceof Error ? error.message : 'Trello did not answer.' })
      })
    return () => ctrl.abort()
  }, [reloadKey])

  // Live Trello cards, joined with any Units sheet rows by unit ID. Sheet rows alone if Trello fails.
  const units = useMemo(() => (feedState.status === 'ready' ? mergeWithSheet(feedState.feed.cards, UNITS) : UNITS), [feedState])
  const soldCount = useMemo(() => units.filter((unit) => unit.sold).length, [units])
  const trelloCount = useMemo(() => units.filter((unit) => unit.source === 'trello').length, [units])
  const placed = useMemo(() => placeUnits(units), [units])
  const communities = useMemo(() => {
    const names = new Set(placed.map((row) => row.unit.community).filter((item): item is string => Boolean(item)))
    if (community) names.add(community.label)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [placed, community])
  const matched = useMemo(
    () => placed.filter((row) => matchesSecondaryFilters(row, filters)),
    [placed, filters],
  )
  const { pinned, unpinned } = useMemo(() => splitPlaced(matched, geo), [matched, geo])
  const selected = placed.find((row) => row.unit.id === selectedId) ?? null
  const geoLabel = geo.type === 'radius' ? `${geo.km} km radius` : geo.type === 'bbox' ? 'Drawn area' : null

  useEffect(() => {
    const el = chromeRef.current
    const screen = screenRef.current
    if (!el || !screen) return
    const apply = () => {
      const height = Math.ceil(el.getBoundingClientRect().height)
      screen.style.setProperty('--bar-h', `${height + 22}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => pinsRef.current?.resize())
    return () => cancelAnimationFrame(frame)
  }, [])

  const patch = (next: Partial<SecondaryFilters>) => setFilters((current) => ({ ...current, ...next }))

  const toggleMode = (next: 'draw' | 'radius') => {
    setMode((current) => (current === next ? 'pan' : next))
    setGeo((current) => {
      if (next === 'draw' && current.type === 'radius') return { type: 'none' }
      if (next === 'radius' && current.type === 'bbox') return { type: 'none' }
      return current
    })
  }

  return (
    <section
      ref={screenRef}
      className={`secondary-screen${selected ? ' drawer-open' : ''}`}
      aria-label="Secondary map"
    >
      <SecondaryPins
        ref={pinsRef}
        focus={community && community.lat != null && community.lng != null ? { lng: community.lng, lat: community.lat } : null}
        rows={pinned}
        selectedId={selectedId}
        mode={mode}
        geo={geo}
        basemap={basemap}
        onSelect={setSelectedId}
        onRadius={(lng, lat) => setGeo({ type: 'radius', lng, lat, km: radiusKm })}
        onBbox={(bounds) => {
          setGeo({ type: 'bbox', ...bounds })
          setMode('pan')
        }}
      />
      <div className="chrome" ref={chromeRef}>
        <div className={toolsOpen ? 'toolbar tools-open' : 'toolbar'}>
          <div className="brand-block">
            <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
              <span className="brand">
                <BrandMark />
              </span>
              <span className="brand-sub">{community ? community.title ?? community.label : 'Secondary listings'}</span>
            </button>
            <AppTabs tab="secondary" onTab={onTab} />
          </div>
          <label className="search">
            <input
              type="search"
              placeholder="Search card, community, or unit code"
              aria-label="Search secondary listings"
              value={filters.search}
              onChange={(event) => patch({ search: event.target.value })}
            />
          </label>
          <AudienceToggle value={filters.audience} onChange={(audience) => patch({ audience })} />
          <button
            type="button"
            className={filters.showSold ? 'tool active sold-toggle' : 'tool sold-toggle'}
            aria-pressed={Boolean(filters.showSold)}
            onClick={() => patch({ showSold: !filters.showSold })}
            title="SOLD list on the Trello Secondary board"
          >
            {filters.showSold ? 'Hide sold' : 'Show sold'}
            {soldCount ? ` (${soldCount})` : ''}
          </button>
          <a
            className={`feed-badge feed-${feedState.status}`}
            href={feedState.status === 'ready' ? feedState.feed.boardUrl : SECONDARY_BOARD_URL}
            target="_blank"
            rel="noopener"
            title={
              feedState.status === 'ready'
                ? `Live from the Trello Secondary board. Updated ${feedTime(feedState.feed.fetchedAt)} Dubai${feedState.feed.stale ? ' (cached)' : ''}.`
                : feedState.status === 'error'
                  ? feedState.message
                  : 'Loading the Trello Secondary board'
            }
          >
            {feedState.status === 'ready' ? `LIVE · Trello Secondary · ${trelloCount}` : feedState.status === 'error' ? 'Trello offline' : 'Loading Trello…'}
          </a>
          <button
            type="button"
            className={toolsOpen ? 'tool tools-toggle on' : 'tool tools-toggle'}
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((open) => !open)}
          >
            {toolsOpen ? 'Hide tools' : 'Tools'}
          </button>
          <div className="basemap" role="group" aria-label="Basemap">
            <button type="button" className={basemap === 'street' ? 'on' : undefined} aria-pressed={basemap === 'street'} onClick={() => setBasemap('street')}>
              Street
            </button>
            <button type="button" className={basemap === 'satellite' ? 'on' : undefined} aria-pressed={basemap === 'satellite'} onClick={() => setBasemap('satellite')}>
              Satellite
            </button>
          </div>
          <div className="more-tools">
            <div className="tool-group" role="group" aria-label="Map tools">
              <button type="button" className={mode === 'draw' ? 'tool active' : 'tool'} aria-pressed={mode === 'draw'} onClick={() => toggleMode('draw')}>
                Draw area
              </button>
              <button type="button" className={mode === 'radius' ? 'tool active' : 'tool'} aria-pressed={mode === 'radius'} onClick={() => toggleMode('radius')}>
                Drop radius
              </button>
              <button
                type="button"
                className="tool"
                onClick={() => {
                  setMode('pan')
                  setGeo({ type: 'none' })
                }}
                disabled={!geoLabel && mode === 'pan'}
              >
                Clear
              </button>
              <button type="button" className="tool" onClick={() => pinsRef.current?.fit()}>
                Fit
              </button>
            </div>
            {geoLabel ? <span className="geo-chip">{geoLabel} · {pinned.length} inside</span> : null}
          </div>
          <div className="more-tools">
            <div className="sheet-filters secondary-filters">
              <label className="client-filter">
                Community
                <select aria-label="Community" value={filters.community} onChange={(event) => patch({ community: event.target.value })}>
                  <option value="">Any community</option>
                  {communities.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="client-filter">
                Purpose
                <select aria-label="Purpose" value={filters.purpose} onChange={(event) => patch({ purpose: event.target.value })}>
                  <option value="">Sale/Rent</option>
                  <option value="Sale">Sale</option>
                  <option value="Rent">Rent</option>
                </select>
              </label>
              <label className="client-filter">
                Pocket
                <select aria-label="Pocket listing" value={filters.pocket} onChange={(event) => patch({ pocket: event.target.value })}>
                  <option value="">Yes/No</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="client-filter">
                Price
                <span className="price-range">
                  <input
                    inputMode="numeric"
                    aria-label="Minimum asking price"
                    placeholder="Min"
                    value={filters.priceMin}
                    onChange={(event) => patch({ priceMin: event.target.value })}
                  />
                  <input
                    inputMode="numeric"
                    aria-label="Maximum asking price"
                    placeholder="Max"
                    value={filters.priceMax}
                    onChange={(event) => patch({ priceMax: event.target.value })}
                  />
                </span>
              </label>
              <span className="count">
                {pinned.length} on map{unpinned.length ? ` · ${unpinned.length} not on map` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
      {feedState.status === 'error' ? (
        <div className="empty-map feed-error">
          {feedState.message}{' '}
          <button type="button" className="tool" onClick={() => setReloadKey((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}
      {feedState.status === 'loading' && units.length === 0 ? <div className="empty-map">Loading the Trello Secondary board…</div> : null}
      {feedState.status === 'ready' && units.length === 0 ? <div className="empty-map">{EMPTY_COPY}</div> : null}
      {units.length > 0 && matched.length === 0 ? (
        <div className="empty-map">
          {community && !filters.showSold
            ? `No open cards in ${community.title ?? community.label} on the Trello Secondary board yet.`
            : 'No secondary listings match these filters.'}
        </div>
      ) : null}
      {mode === 'draw' ? <div className="hint">Drag a rectangle. Listings outside it hide. Other filters still apply.</div> : null}
      {mode === 'radius' ? (
        <div className="hint radius-hint">
          <span>Click the map to drop a pin and circle. Listings outside it hide.</span>
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
      {unpinned.length > 0 ? (
        <aside className="secondary-unpinned" aria-label={`Not on map (${unpinned.length})`}>
          <h2>Not on map ({unpinned.length})</h2>
          <ul>
            {unpinned.map((row) => (
              <li key={row.unit.id}>
                <button type="button" onClick={() => setSelectedId(row.unit.id)}>
                  <strong>{row.unit.title ?? show(row.unit.ownerName)}</strong>
                  <span>
                    {row.unit.source === 'trello'
                      ? `${row.unit.community ?? row.unit.listName ?? 'No community'}${row.unit.sold ? ' · SOLD' : ''}`
                      : `${show(row.unit.community)} · ${show(row.unit.unitNumber)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      {selected ? <SecondaryCard row={selected} onClose={() => setSelectedId(null)} onTab={onTab} /> : null}
    </section>
  )
}

function TrelloCardDrawer({ row, onClose }: { row: PlacedUnit; onClose: () => void }) {
  const { unit } = row
  return (
    <aside className="drawer" role="dialog" aria-label={unit.title ?? 'Trello card'}>
      <header className="drawer-top">
        <div className="tags">
          {unit.sold ? <span className="tag sold_out">SOLD</span> : null}
          {(unit.labels ?? [])
            .filter((label) => label.name && !/^sold$/i.test(label.name))
            .map((label) => (
              <span key={label.name} className="tag source">
                {label.name}
              </span>
            ))}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close listing">
          ×
        </button>
      </header>
      <div className="drawer-body">
        {unit.coverUrl ? <img className="trello-cover" src={unit.coverUrl} alt="" loading="lazy" /> : null}
        <p className="kicker">{unit.community ?? unit.listName ?? 'Secondary'}</p>
        <h2>{unit.title ?? 'Trello card'}</h2>
        <dl className="facts">
          <dt>Unit code</dt>
          <dd>{unit.unitId ?? '—'}</dd>
          {unit.unitType ? (
            <>
              <dt>Type</dt>
              <dd>{unit.unitType}</dd>
            </>
          ) : null}
          {unit.bedrooms ? (
            <>
              <dt>Bedrooms</dt>
              <dd>{unit.bedrooms}</dd>
            </>
          ) : null}
          <dt>Trello list</dt>
          <dd>{unit.listName ?? '—'}</dd>
          <dt>Map</dt>
          <dd>
            {row.lat == null
              ? 'Not on map. The list name does not match a community point.'
              : unit.pointLat != null
                ? 'Exact point from the card.'
                : nearCentreNote(unit.community)}
          </dd>
        </dl>
        <p className="pin-note">Prices, seller and fee details stay on the Trello card.</p>
      </div>
      <footer className="drawer-actions">
        <UnitTrelloRow unit={unit} />
        <ReportIssueButton
          record={{
            name: unit.title ?? '',
            project: unit.community ?? unit.listName ?? '',
            dealId: unit.unitId ?? '',
            source: 'Trello Secondary',
          }}
        />
      </footer>
    </aside>
  )
}

function SecondaryCard({ row, onClose, onTab }: { row: PlacedUnit; onClose: () => void; onTab: (tab: AppTab) => void }) {
  const { unit } = row
  if (unit.source === 'trello') return <TrelloCardDrawer row={row} onClose={onClose} />
  const href = unitWhatsappHref(unit)
  const price = formatAskingPrice(unit.askingPriceAed)
  const amount = askingAmount(unit)
  const flag = pocketFlag(unit.pocketListing)
  return (
    <aside className="drawer" role="dialog" aria-label={unit.ownerName ?? unit.project ?? 'Secondary listing'}>
      <header className="drawer-top">
        <div className="tags">
          {unit.purpose ? <span className={purposeClass(unit.purpose)}>{unit.purpose}</span> : null}
          {flag === 'yes' ? (
            <span className="tag pocket" title={unit.pocketListingDetails ?? 'Yes'}>
              Pocket listing
            </span>
          ) : null}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close listing">
          ×
        </button>
      </header>
      <div className="drawer-body">
        <p className="kicker">{show(unit.community)}</p>
        <h2>{show(unit.ownerName)}</h2>
        <p className="sub">{show(unit.project)}</p>
        <p className="price">{price ?? (amount == null ? NOT_ON_SHEET : formatAed(amount))}</p>
        <dl className="facts">
          <dt>Unit no.</dt>
          <dd>{show(unit.unitNumber)}</dd>
          <dt>Purpose</dt>
          <dd>{show(unit.purpose)}</dd>
          <dt>Asking price</dt>
          <dd>{price ?? NOT_ON_SHEET}</dd>
          <dt>Pocket listing</dt>
          <dd>{show(unit.pocketListing)}</dd>
          <dt>Pocket listing details</dt>
          <dd>{show(unit.pocketListingDetails)}</dd>
          {row.lat == null ? (
            <>
              <dt>Map</dt>
              <dd>Not on map. No verified coordinate matches this community or project.</dd>
            </>
          ) : null}
        </dl>
      </div>
      <footer className="drawer-actions">
        {href ? (
          <a className="btn whatsapp" href={href} target="_blank" rel="noreferrer">
            WhatsApp
            <small>{unit.phone ? formatUnitPhone(unit.phone) : ''}</small>
          </a>
        ) : (
          <p className="pin-note">No phone on this row, so there is no WhatsApp link.</p>
        )}
        <a className="btn book" href={bookingHref(row)} target="_blank" rel="noreferrer">
          Book a viewing
          <small>WhatsApp {WHATSAPP_DISPLAY}</small>
        </a>
        <UnitTrelloRow unit={unit} />
        <button type="button" className="btn ghost" onClick={() => onTab('units')}>
          Open in Units tab
        </button>
        <ReportIssueButton
          record={{
            name: unit.ownerName ?? '',
            project: unit.project ?? unit.community ?? '',
            dealId: unit.unitId ?? '',
            source: 'Units sheet',
          }}
        />
      </footer>
    </aside>
  )
}
