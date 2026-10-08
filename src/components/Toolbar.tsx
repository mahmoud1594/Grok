import { useEffect, useRef, useState } from 'react'
import type { BasemapId } from '../lib/basemap'
import type { PaymentBucketCount } from '../lib/payment-plan'
import type { Bedroom, FilterState, MapMode, MenuId } from '../types'
import AppTabs, { type AppTab } from './AppTabs'
import { formatCompact, formatRefreshLabel } from '../lib/format'
import { BrandMark } from '../lib/brand'

const BEDROOMS: { id: Bedroom; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 1, label: '1 BR' },
  { id: 2, label: '2 BR' },
  { id: 3, label: '3 BR' },
  { id: 4, label: '4+ BR' },
]

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Up to 1M', min: null, max: 1_000_000 },
  { label: '1–2M', min: 1_000_000, max: 2_000_000 },
  { label: '2–4M', min: 2_000_000, max: 4_000_000 },
  { label: '4M+', min: 4_000_000, max: null },
]

interface ToolbarProps {
  filters: FilterState
  mode: MapMode
  geoLabel: string | null
  listOpen: boolean
  basemap: BasemapId
  shown: number
  total: number
  developers: string[]
  paymentBuckets: PaymentBucketCount[]
  handoverYears: number[]
  suggestions: string[]
  exportedAt: string
  refreshing: boolean
  menu: MenuId
  filtersActive: boolean
  onRefresh: () => void
  onFilters: (next: FilterState) => void
  onMenu: (menu: MenuId) => void
  onMode: (mode: 'draw' | 'radius') => void
  onClearGeo: () => void
  onFit: () => void
  onToggleList: () => void
  onResetFilters: () => void
  onBasemap: (basemap: BasemapId) => void
  onTab: (tab: AppTab) => void
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function priceLabel(filters: FilterState): string {
  const { priceMin, priceMax } = filters
  if (priceMin == null && priceMax == null) return 'Price range'
  if (priceMin == null && priceMax != null) return `≤ AED ${formatCompact(priceMax)}`
  if (priceMin != null && priceMax == null) return `≥ AED ${formatCompact(priceMin)}`
  return `AED ${formatCompact(priceMin as number)}–${formatCompact(priceMax as number)}`
}

export default function Toolbar({
  filters,
  mode,
  geoLabel,
  listOpen,
  basemap,
  shown,
  total,
  developers,
  paymentBuckets,
  handoverYears,
  suggestions,
  exportedAt,
  refreshing,
  menu,
  filtersActive,
  onRefresh,
  onFilters,
  onMenu,
  onMode,
  onClearGeo,
  onFit,
  onToggleList,
  onResetFilters,
  onBasemap,
  onTab,
}: ToolbarProps) {
  const rootRef = useRef<HTMLElement>(null)
  const [toolsOpen, setToolsOpen] = useState(false)

  useEffect(() => {
    if (!menu) return
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu, onMenu])

  const patch = (partial: Partial<FilterState>) => onFilters({ ...filters, ...partial })

  return (
    <header className={toolsOpen ? 'toolbar tools-open' : 'toolbar'} ref={rootRef}>
      <div className="brand-block">
        <span className="brand-lockup">
          <span className="brand">
            <BrandMark />
          </span>
          <span className="brand-sub">Premium Dubai Real Estate</span>
        </span>
        <AppTabs tab="map" onTab={onTab} />
        <span className="freshness" title="Refresh asks the server to pull the board. The browser does not hold a Trello key.">
          Inventory from Trello Dubai · {formatRefreshLabel(exportedAt)}
        </span>
      </div>

      <label className="search">
        <span className="search-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
        <input
          type="search"
          placeholder="Search project or community"
          value={filters.search}
          list="place-search"
          aria-label="Search project or community"
          onChange={(event) => patch({ search: event.target.value })}
        />
        <datalist id="place-search">
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </label>

      <button
        type="button"
        className={toolsOpen ? 'tool tools-toggle on' : 'tool tools-toggle'}
        aria-expanded={toolsOpen}
        onClick={() => setToolsOpen((open) => !open)}
      >
        {toolsOpen ? 'Hide tools' : 'Tools'}
      </button>

      <div className="more-tools">
      <div className="tool-group" role="group" aria-label="Map tools">
        <button
          type="button"
          className={mode === 'draw' ? 'tool active' : 'tool'}
          aria-pressed={mode === 'draw'}
          onClick={() => onMode('draw')}
        >
          Draw area
        </button>
        <button
          type="button"
          className={mode === 'radius' ? 'tool active' : 'tool'}
          aria-pressed={mode === 'radius'}
          onClick={() => onMode('radius')}
        >
          Drop radius
        </button>
        <button type="button" className="tool" onClick={onClearGeo} disabled={!geoLabel && mode === 'pan'}>
          Clear
        </button>
        <button type="button" className="tool" onClick={onFit}>
          Fit
        </button>
        <button type="button" className="tool" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {geoLabel ? (
        <span className="geo-chip">
          {geoLabel} · {shown} inside
        </span>
      ) : null}
      </div>

      <div className="basemap" role="group" aria-label="Basemap">
        <button
          type="button"
          className={basemap === 'street' ? 'on' : undefined}
          aria-pressed={basemap === 'street'}
          onClick={() => onBasemap('street')}
        >
          Street
        </button>
        <button
          type="button"
          className={basemap === 'satellite' ? 'on' : undefined}
          aria-pressed={basemap === 'satellite'}
          onClick={() => onBasemap('satellite')}
        >
          Satellite
        </button>
      </div>

      <div className="more-tools">
      <button
        type="button"
        className={listOpen ? 'tool active' : 'tool'}
        aria-pressed={listOpen}
        onClick={onToggleList}
      >
        {listOpen ? 'Map view' : 'List view'}
      </button>

      <div className="pills" role="group" aria-label="Filters">
        <div className="pill-wrap">
          <button
            type="button"
            className={`pill${filters.developers.length ? ' has' : ''}${menu === 'developer' ? ' open' : ''}`}
            aria-expanded={menu === 'developer'}
            onClick={() => onMenu(menu === 'developer' ? null : 'developer')}
          >
            {filters.developers.length ? `Developer (${filters.developers.length})` : 'Developer'}
            <Caret />
          </button>
          {menu === 'developer' ? (
            <div className="menu" role="group" aria-label="Developer">
              <button type="button" className="menu-clear" onClick={() => patch({ developers: [] })}>
                Any developer
              </button>
              {developers.map((developer) => (
                <label key={developer} className="check">
                  <input
                    type="checkbox"
                    checked={filters.developers.includes(developer)}
                    onChange={() => patch({ developers: toggleValue(filters.developers, developer) })}
                  />
                  {developer}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pill-wrap">
          <button
            type="button"
            className={`pill${filters.bedrooms.length ? ' has' : ''}${menu === 'bedrooms' ? ' open' : ''}`}
            aria-expanded={menu === 'bedrooms'}
            onClick={() => onMenu(menu === 'bedrooms' ? null : 'bedrooms')}
          >
            {filters.bedrooms.length ? `Bedrooms (${filters.bedrooms.length})` : 'Bedrooms'}
            <Caret />
          </button>
          {menu === 'bedrooms' ? (
            <div className="menu" role="group" aria-label="Bedrooms">
              <button type="button" className="menu-clear" onClick={() => patch({ bedrooms: [] })}>
                Any bedrooms
              </button>
              {BEDROOMS.map((bedroom) => (
                <label key={String(bedroom.id)} className="check">
                  <input
                    type="checkbox"
                    checked={filters.bedrooms.includes(bedroom.id)}
                    onChange={() => patch({ bedrooms: toggleValue(filters.bedrooms, bedroom.id) })}
                  />
                  {bedroom.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pill-wrap">
          <button
            type="button"
            className={`pill${filters.paymentPlans.length ? ' has' : ''}${menu === 'payment' ? ' open' : ''}`}
            aria-expanded={menu === 'payment'}
            onClick={() => onMenu(menu === 'payment' ? null : 'payment')}
          >
            {filters.paymentPlans.length ? `Payment plan (${filters.paymentPlans.length})` : 'Payment plan'}
            <Caret />
          </button>
          {menu === 'payment' ? (
            <div className="menu" role="group" aria-label="Payment plan">
              <button type="button" className="menu-clear" onClick={() => patch({ paymentPlans: [] })}>
                Any plan
              </button>
              {paymentBuckets.map((plan) => (
                <label key={plan.id} className="check">
                  <input
                    type="checkbox"
                    checked={filters.paymentPlans.includes(plan.id)}
                    onChange={() => patch({ paymentPlans: toggleValue(filters.paymentPlans, plan.id) })}
                  />
                  <span className="check-label">{plan.label}</span>
                  <span className="check-count">{plan.count}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pill-wrap">
          <button
            type="button"
            className={`pill${filters.handoverYears.length ? ' has' : ''}${menu === 'handover' ? ' open' : ''}`}
            aria-expanded={menu === 'handover'}
            onClick={() => onMenu(menu === 'handover' ? null : 'handover')}
          >
            {filters.handoverYears.length ? `Handover (${filters.handoverYears.length})` : 'Handover year'}
            <Caret />
          </button>
          {menu === 'handover' ? (
            <div className="menu" role="group" aria-label="Handover year">
              <button type="button" className="menu-clear" onClick={() => patch({ handoverYears: [] })}>
                Any year
              </button>
              {handoverYears.map((year) => (
                <label key={year} className="check">
                  <input
                    type="checkbox"
                    checked={filters.handoverYears.includes(year)}
                    onChange={() => patch({ handoverYears: toggleValue(filters.handoverYears, year) })}
                  />
                  {year}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pill-wrap">
          <button
            type="button"
            className={`pill${filters.priceMin != null || filters.priceMax != null ? ' has' : ''}${menu === 'price' ? ' open' : ''}`}
            aria-expanded={menu === 'price'}
            onClick={() => onMenu(menu === 'price' ? null : 'price')}
          >
            {priceLabel(filters)}
            <Caret />
          </button>
          {menu === 'price' ? (
            <div className="menu price-menu" role="group" aria-label="Price range">
              <label className="field">
                Min AED
                <input
                  type="number"
                  min={0}
                  step={50000}
                  inputMode="numeric"
                  value={filters.priceMin ?? ''}
                  onChange={(event) =>
                    patch({ priceMin: event.target.value === '' ? null : Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                Max AED
                <input
                  type="number"
                  min={0}
                  step={50000}
                  inputMode="numeric"
                  value={filters.priceMax ?? ''}
                  onChange={(event) =>
                    patch({ priceMax: event.target.value === '' ? null : Number(event.target.value) })
                  }
                />
              </label>
              <div className="presets">
                {PRICE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="preset"
                    onClick={() => patch({ priceMin: preset.min, priceMax: preset.max })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="menu-clear"
                onClick={() => patch({ priceMin: null, priceMax: null })}
              >
                Any price
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {filtersActive ? (
        <button type="button" className="text-btn" onClick={onResetFilters}>
          Reset filters
        </button>
      ) : null}
      </div>

      <span className="count">
        {shown === total ? `${total} projects` : `${shown} of ${total}`}
      </span>
    </header>
  )
}

function Caret() {
  return (
    <svg className="caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
      <path d="M1 1 L5 5 L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
