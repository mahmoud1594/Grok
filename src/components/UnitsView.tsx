import { useEffect, useMemo, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { formatRefreshLabel } from '../lib/format'
import ReportIssueButton from './ReportIssue'
import { UnitIconPair, UnitTrelloRow } from './UnitLinks'
import {
  UNITS,
  UNITS_EXPORTED_AT,
  UNITS_SHEET_URL,
  UNITS_SOURCE,
  UNITS_TAB,
  UNIT_COMMUNITIES,
  formatAskingPrice,
  formatUnitPhone,
  pocketFlag,
  unitMatches,
  unitWhatsappHref,
  matchesAudience,
  type Unit,
  type UnitAudience,
} from '../lib/units'
import AudienceToggle from './AudienceToggle'
import UnitsSectionSwitch from './UnitsSectionSwitch'
import { BrandMark } from '../lib/brand'

const NOT_ON_SHEET = 'Not on sheet'

interface UnitsViewProps {
  onTab: (tab: AppTab) => void
}

type UnitSortKey = 'owner' | 'community' | 'project' | 'unit' | 'purpose' | 'price' | 'pocket' | 'dld' | 'notes'

const UNIT_COLUMNS: {
  key: UnitSortKey
  label: string
  className: string
  value: (unit: Unit) => string | null
}[] = [
  { key: 'owner', label: 'Owner/Client', className: '', value: (unit) => unit.ownerName },
  { key: 'community', label: 'Community', className: 'col-project', value: (unit) => unit.community },
  { key: 'project', label: 'Project', className: 'col-project', value: (unit) => unit.project },
  { key: 'unit', label: 'Unit no.', className: 'col-unit', value: (unit) => unit.unitNumber },
  { key: 'purpose', label: 'Purpose', className: 'col-purpose', value: (unit) => unit.purpose },
  {
    key: 'price',
    label: 'Asking price',
    className: 'col-price',
    value: (unit) => formatAskingPrice(unit.askingPriceAed),
  },
  { key: 'pocket', label: 'Pocket listing', className: 'col-pocket', value: (unit) => unit.pocketListing },
  { key: 'dld', label: 'DLD history', className: 'col-note', value: (unit) => unit.dldHistory },
  { key: 'notes', label: 'Notes', className: 'col-note', value: (unit) => unit.notes },
]

function show(value: string | null): string {
  return value ?? NOT_ON_SHEET
}

function purposeClass(purpose: string | null): string {
  if (purpose && /^sale$/i.test(purpose)) return 'tag priced'
  if (purpose && /^rent$/i.test(purpose)) return 'tag rent'
  return 'tag'
}

function compareText(a: string | null, b: string | null): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' })
}

export default function UnitsView({ onTab }: UnitsViewProps) {
  const [query, setQuery] = useState('')
  const [community, setCommunity] = useState('')
  const [purpose, setPurpose] = useState('')
  const [pocket, setPocket] = useState('')
  const [audience, setAudience] = useState<UnitAudience>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: UnitSortKey; dir: 'asc' | 'desc' } | null>(null)

  const filtered = useMemo(
    () => UNITS.filter((unit) => matchesAudience(unit, audience) && unitMatches(unit, query, community, purpose, pocket)),
    [audience, query, community, purpose, pocket],
  )
  const rows = useMemo(() => {
    if (!sort) return filtered
    const column = UNIT_COLUMNS.find((item) => item.key === sort.key)
    if (!column) return filtered
    return [...filtered].sort((a, b) => {
      if (sort.key === 'price') {
        const left = Number(a.askingPriceAed?.replace(/[^\d.]/g, '') || 0)
        const right = Number(b.askingPriceAed?.replace(/[^\d.]/g, '') || 0)
        const compared = left - right
        return sort.dir === 'asc' ? compared : -compared
      }
      const compared = compareText(column.value(a), column.value(b))
      return sort.dir === 'asc' ? compared : -compared
    })
  }, [filtered, sort])
  const open = rows.find((unit) => unit.id === openId) ?? UNITS.find((unit) => unit.id === openId) ?? null

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleSort = (key: UnitSortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: 'asc' }
      if (current.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  return (
    <section className="clients-screen people-screen" aria-label="Units">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="units" onTab={onTab} />
          <span className="live-stack">
            <span
              className="live-chip"
              title={`${UNITS_SOURCE} tab ${UNITS_TAB}. ${UNITS_EXPORTED_AT ? `Exported ${UNITS_EXPORTED_AT}. ` : ''}Replace src/data/units.json to refresh. The browser does not call Google Sheets. ${UNITS_SHEET_URL}`}
            >
              {UNITS_EXPORTED_AT ? 'LIVE · Units' : 'Units'}
            </span>
            {UNITS_EXPORTED_AT ? (
              <span className="freshness">
                {UNITS_SOURCE} · {formatRefreshLabel(UNITS_EXPORTED_AT)}
              </span>
            ) : (
              <span className="freshness">{UNITS_TAB} tab</span>
            )}
          </span>
        </div>
        <UnitsSectionSwitch section="secondary" />
        <label className="search">
          <input
            type="search"
            placeholder="Search owner, community, or project"
            value={query}
            aria-label="Search units"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="sheet-filters">
          <AudienceToggle value={audience} onChange={setAudience} />
          <label className="client-filter">
            Community
            <select value={community} onChange={(event) => setCommunity(event.target.value)} aria-label="Community">
              <option value="">Any community</option>
              {UNIT_COMMUNITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="client-filter">
            Purpose
            <select value={purpose} onChange={(event) => setPurpose(event.target.value)} aria-label="Purpose">
              <option value="">Sale/Rent</option>
              <option value="Sale">Sale</option>
              <option value="Rent">Rent</option>
            </select>
          </label>
          <label className="client-filter">
            Pocket
            <select
              value={pocket}
              onChange={(event) => setPocket(event.target.value)}
              aria-label="Pocket listing"
            >
              <option value="">Yes/No</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <span className="count">
            {rows.length === UNITS.length ? `${UNITS.length} units` : `${rows.length} of ${UNITS.length}`}
          </span>
        </div>
      </header>
      {UNITS.length === 0 ? (
        <p className="clients-empty">No units yet. Add rows to the Units tab of the Secondary Units sheet.</p>
      ) : rows.length === 0 ? (
        <p className="clients-empty">No units match these filters.</p>
      ) : (
        <div className="sheet-scroll">
          <table className="excel excel-units">
            <colgroup>
              <col className="col-owner" />
              <col className="col-community" />
              <col className="col-project" />
              <col className="col-unit" />
              <col className="col-purpose" />
              <col className="col-price" />
              <col className="col-pocket" />
              <col className="col-note" />
              <col className="col-note" />
              <col className="col-links" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                {UNIT_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={column.className}
                    aria-sort={sort?.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className="excel-sort" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      {sort?.key === column.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="col-links" aria-label="WhatsApp and Trello" />
                <th className="excel-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((unit) => {
                const flag = pocketFlag(unit.pocketListing)
                const pocketTitle = unit.pocketListingDetails ?? (flag === 'yes' ? 'Yes' : show(unit.pocketListing))
                return (
                  <tr key={unit.id} onClick={() => setOpenId(unit.id)}>
                    {UNIT_COLUMNS.map((column) => {
                      const text = show(column.value(unit))
                      if (column.key === 'purpose' && unit.purpose) {
                        return (
                          <td key={column.key} className={column.className} title={text}>
                            <span className={purposeClass(unit.purpose)} title={text}>
                              {text}
                            </span>
                          </td>
                        )
                      }
                      if (column.key === 'pocket' && flag === 'yes') {
                        return (
                          <td key={column.key} className={column.className} title={pocketTitle}>
                            <span className="tag pocket" title={pocketTitle}>
                              Yes
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={column.key} className={column.className} title={text}>
                          <span className="excel-clip" title={text}>
                            {text}
                          </span>
                        </td>
                      )
                    })}
                    <td className="col-links" onClick={(event) => event.stopPropagation()}>
                      <UnitIconPair unit={unit} />
                    </td>
                    <td className="excel-actions" onClick={(event) => event.stopPropagation()}>
                      <div className="excel-actions-inner">
                        <ReportIssueButton
                          record={{
                            name: unit.ownerName ?? '',
                            project: unit.project ?? unit.community ?? '',
                            dealId: unit.unitId ?? '',
                            source: 'Units sheet',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {open ? (
        <div className="people-sheet" role="dialog" aria-modal="true" aria-label={open.ownerName ?? 'Unit'}>
          <header className="people-sheet-bar">
            <button type="button" className="people-sheet-close" onClick={() => setOpenId(null)}>
              Close
            </button>
            <span className="live-chip">{UNITS_EXPORTED_AT ? 'LIVE · Units' : 'Units'}</span>
          </header>
          <UnitDetail unit={open} />
        </div>
      ) : null}
    </section>
  )
}

function UnitDetail({ unit }: { unit: Unit }) {
  const href = unitWhatsappHref(unit)
  const price = formatAskingPrice(unit.askingPriceAed)
  return (
    <article className="client-card">
      <header className="client-card-top">
        {unit.purpose ? <span className={purposeClass(unit.purpose)}>{unit.purpose}</span> : <span className="tag">{NOT_ON_SHEET}</span>}
        <span>{show(unit.unitNumber)}</span>
      </header>
      <h2>{show(unit.ownerName)}</h2>
      <p className="client-phone">{unit.phone ? formatUnitPhone(unit.phone) : NOT_ON_SHEET}</p>
      <dl className="facts">
        <dt>Unit id</dt>
        <dd>{show(unit.unitId)}</dd>
        <dt>Community</dt>
        <dd>{show(unit.community)}</dd>
        <dt>Project</dt>
        <dd>{show(unit.project)}</dd>
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
        <dt>DLD history</dt>
        <dd>{show(unit.dldHistory)}</dd>
        <dt>Notes</dt>
        <dd>{show(unit.notes)}</dd>
      </dl>
      <UnitTrelloRow unit={unit} />
      <div className="lead-actions">
        {href ? (
          <a className="btn whatsapp" href={href} target="_blank" rel="noreferrer">
            WhatsApp this owner
            <small>{unit.phone ? formatUnitPhone(unit.phone) : ''}</small>
          </a>
        ) : (
          <p className="pin-note">No phone on this row, so there is no WhatsApp link.</p>
        )}
        <ReportIssueButton
          record={{
            name: unit.ownerName ?? '',
            project: unit.project ?? unit.community ?? '',
            dealId: unit.unitId ?? '',
            source: 'Units sheet',
          }}
        />
      </div>
    </article>
  )
}
