import { useEffect, useMemo, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { formatRefreshLabel } from '../lib/format'
import ReportIssueButton from './ReportIssue'
import {
  CLIENTS_EXPORTED_AT,
  CLIENTS_SHEET_URL,
  CLIENTS_SOURCE,
  clientCampaigns,
  clientInterests,
  clientMatches,
  fetchClients,
  clientWhatsappHref,
  formatCampaignLabel,
  formatClientPhone,
  type Client,
} from '../lib/clients'
import { BrandMark } from '../lib/brand'

const NOT_ON_SHEET = 'Not on sheet'

interface ClientsViewProps {
  onTab: (tab: AppTab) => void
}

type ClientSortKey = 'name' | 'phone' | 'status' | 'campaign' | 'date' | 'message' | 'reminder'

const CLIENT_COLUMNS: { key: ClientSortKey; label: string; className: string; value: (client: Client) => string | null }[] = [
  { key: 'name', label: 'Name', className: '', value: (client) => client.project },
  { key: 'phone', label: 'Phone', className: 'col-phone', value: (client) => (client.phone ? formatClientPhone(client.phone) : null) },
  { key: 'status', label: 'Status', className: 'col-status', value: (client) => client.interest },
  { key: 'campaign', label: 'Campaign', className: 'col-project', value: (client) => (client.campaign ? formatCampaignLabel(client.campaign) : null) },
  { key: 'date', label: 'Date', className: 'col-date', value: (client) => client.date },
  { key: 'message', label: 'Last message', className: 'col-note', value: (client) => client.lastMessage },
  { key: 'reminder', label: 'Reminder', className: 'col-note', value: (client) => client.reminder },
]

function show(value: string | null): string {
  return value ?? NOT_ON_SHEET
}

function compareText(a: string | null, b: string | null): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' })
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.4a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2Zm5.76 14.15c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.12.1-1.81-.11-.41-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.26.64-.38 1.02-.38h.73c.23 0 .54-.09.85.65.32.77 1.08 2.64 1.17 2.83.1.19.16.42.03.67-.13.26-.2.42-.39.64-.19.23-.4.5-.58.68-.19.19-.39.39-.17.74.23.35 1 1.65 2.15 2.67 1.48 1.32 2.72 1.73 3.1 1.92.38.19.6.16.82-.1.23-.26.96-1.12 1.22-1.5.26-.39.51-.32.85-.19.35.13 2.2 1.04 2.58 1.23.38.19.63.29.72.45.1.16.1.94-.14 1.62Z"
      />
    </svg>
  )
}

export default function ClientsView({ onTab }: ClientsViewProps) {
  const [query, setQuery] = useState('')
  const [campaign, setCampaign] = useState('')
  const [interest, setInterest] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: ClientSortKey; dir: 'asc' | 'desc' } | null>(null)
  const [CLIENTS, setClients] = useState<Client[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchClients()
      .then((rows) => {
        if (alive) setClients(rows)
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : 'Clients failed to load')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const CLIENT_CAMPAIGNS = useMemo(() => clientCampaigns(CLIENTS), [CLIENTS])
  const CLIENT_INTERESTS = useMemo(() => clientInterests(CLIENTS), [CLIENTS])
  const filtered = useMemo(
    () => CLIENTS.filter((client) => clientMatches(client, query, campaign, interest)),
    [CLIENTS, query, campaign, interest],
  )
  const rows = useMemo(() => {
    if (!sort) return filtered
    const column = CLIENT_COLUMNS.find((item) => item.key === sort.key)
    if (!column) return filtered
    return [...filtered].sort((a, b) => {
      const compared = compareText(column.value(a), column.value(b))
      return sort.dir === 'asc' ? compared : -compared
    })
  }, [filtered, sort])
  const open = rows.find((client) => client.id === openId) ?? null

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

  const toggleSort = (key: ClientSortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: 'asc' }
      if (current.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  return (
    <section className="clients-screen people-screen" aria-label="Listing Farming">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="clients" onTab={onTab} />
          <span className="live-stack">
            <span
              className="live-chip"
              title={`${CLIENTS_SOURCE}. Exported ${CLIENTS_EXPORTED_AT}. Rows load from the signed-in /api/clients endpoint. ${CLIENTS_SHEET_URL}`}
            >
              LIVE · Eazybe replies
            </span>
            <span className="freshness">
              {CLIENTS_SOURCE} · {formatRefreshLabel(CLIENTS_EXPORTED_AT)}
            </span>
          </span>
        </div>
        <label className="search">
          <input
            type="search"
            placeholder="Search phone, project, or note"
            value={query}
            aria-label="Search listing farming"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="sheet-filters">
          <label className="client-filter">
            Campaign
            <select value={campaign} onChange={(event) => setCampaign(event.target.value)} aria-label="Campaign">
              <option value="">Any campaign</option>
              {CLIENT_CAMPAIGNS.map((item) => (
                <option key={item} value={item}>
                  {formatCampaignLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="client-filter">
            Interest
            <select value={interest} onChange={(event) => setInterest(event.target.value)} aria-label="Interest">
              <option value="">Any interest</option>
              {CLIENT_INTERESTS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <span className="count">
            {rows.length === CLIENTS.length ? `${CLIENTS.length} replies` : `${rows.length} of ${CLIENTS.length}`}
          </span>
        </div>
      </header>
      {loading ? (
        <p className="clients-empty">Loading clients…</p>
      ) : loadError ? (
        <p className="clients-empty" role="alert">{loadError}</p>
      ) : CLIENTS.length === 0 ? (
        <p className="clients-empty">No broadcast replies in this export.</p>
      ) : rows.length === 0 ? (
        <p className="clients-empty">No replies match these filters.</p>
      ) : (
        <div className="sheet-scroll">
          <table className="excel">
            <thead>
              <tr>
                {CLIENT_COLUMNS.map((column) => (
                  <th key={column.key} className={column.className} aria-sort={sort?.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="excel-sort" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      {sort?.key === column.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="excel-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => {
                const href = clientWhatsappHref(client)
                return (
                  <tr key={client.id} onClick={() => setOpenId(client.id)}>
                    {CLIENT_COLUMNS.map((column) => {
                      const text = show(column.value(client))
                      return (
                        <td key={column.key} className={column.className} title={text}>
                          {column.key === 'status' ? (
                            <span className="tag priced" title={text}>
                              {text}
                            </span>
                          ) : (
                            <span className="excel-clip" title={text}>
                              {text}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="excel-actions" onClick={(event) => event.stopPropagation()}>
                      <div className="excel-actions-inner">
                        {href ? (
                          <a
                            className="icon-wa"
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${client.phone ? formatClientPhone(client.phone) : ''}`}
                            title={client.phone ? formatClientPhone(client.phone) : ''}
                          >
                            <WhatsAppIcon />
                          </a>
                        ) : (
                          <span className="icon-wa is-off" title="No phone on this row">
                            <WhatsAppIcon />
                          </span>
                        )}
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
        <div className="people-sheet" role="dialog" aria-modal="true" aria-label={open.project ?? 'Client'}>
          <header className="people-sheet-bar">
            <button type="button" className="people-sheet-close" onClick={() => setOpenId(null)}>
              Close
            </button>
            <span className="live-chip">LIVE · Eazybe replies</span>
          </header>
          <ClientDetail client={open} />
        </div>
      ) : null}
    </section>
  )
}

function ClientDetail({ client }: { client: Client }) {
  const href = clientWhatsappHref(client)
  return (
    <article className="client-card">
      <header className="client-card-top">
        <span className="tag priced">{show(client.interest)}</span>
        <time dateTime={client.date ?? undefined}>{show(client.date)}</time>
      </header>
      <h2>{show(client.project)}</h2>
      <p className="client-phone">{client.phone ? formatClientPhone(client.phone) : NOT_ON_SHEET}</p>
      <dl className="facts">
        <dt>Campaign</dt>
        <dd>{client.campaign ? formatCampaignLabel(client.campaign) : NOT_ON_SHEET}</dd>
        <dt>Size</dt>
        <dd>{show(client.size)}</dd>
        <dt>Layout</dt>
        <dd>{show(client.layout)}</dd>
        <dt>Owner DB match</dt>
        <dd>{show(client.ownerMatch)}</dd>
        <dt>Comment</dt>
        <dd>{show(client.comment)}</dd>
        <dt>Last message</dt>
        <dd>{show(client.lastMessage)}</dd>
        <dt>Reminder</dt>
        <dd>{show(client.reminder)}</dd>
      </dl>
      <div className="lead-actions">
        {href ? (
          <a className="btn whatsapp client-wa" href={href} target="_blank" rel="noreferrer">
            WhatsApp this client
            <small>{client.phone ? formatClientPhone(client.phone) : ''}</small>
          </a>
        ) : (
          <p className="pin-note">No phone on this row, so there is no WhatsApp link.</p>
        )}
        <ReportIssueButton
          record={{
            name: client.project ?? '',
            project: client.project ?? '',
            dealId: '',
            source: 'Eazybe replies',
          }}
        />
      </div>
    </article>
  )
}
