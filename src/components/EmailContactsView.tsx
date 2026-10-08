import { useEffect, useMemo, useRef, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { BrandMark } from '../lib/brand'
import { formatLeadPhone } from '../lib/leads'
import { readSheetFile, type SheetTable } from '../lib/sheet-file'
import {
  EMAIL_STATUSES,
  EmailContactsError,
  contactsCsv,
  fetchEmailContacts,
  groupContacts,
  importEmailContacts,
  matchesQuery,
  matchesStatus,
  totals,
  type Counts,
  type EmailContact,
  type EmailStatus,
  type EmailUnsubscribe,
  type ImportStats,
} from '../lib/email-contacts'

interface EmailContactsViewProps {
  onTab: (tab: AppTab) => void
}

const AUTO_OPEN_MAX = 300
const n = (value: number) => value.toLocaleString('en-US')

function CountChips({ counts }: { counts: Counts }) {
  return (
    <span className="email-counts">
      <span title="Contacts">{n(counts.total)} contacts</span>
      <span title="With a phone number">{n(counts.phone)} phone</span>
      {counts.opened ? <span className="is-good" title="Opened">{n(counts.opened)} opened</span> : null}
      {counts.clicked ? <span className="is-good" title="Clicked">{n(counts.clicked)} clicked</span> : null}
      {counts.unsubscribed ? <span className="is-bad" title="Unsubscribed">{n(counts.unsubscribed)} unsub</span> : null}
      {counts.bounced ? <span className="is-bad" title="Bounced">{n(counts.bounced)} bounced</span> : null}
    </span>
  )
}

function ContactTable({ contacts }: { contacts: EmailContact[] }) {
  return (
    <div className="sheet-scroll email-table">
      <table className="excel">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th className="col-phone">Phone</th>
            <th className="col-date">Opened</th>
            <th className="col-date">Clicked</th>
            <th className="col-date">Unsubscribed</th>
            <th className="col-date">Bounced</th>
            <th className="col-date">Last sent</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, index) => (
            <tr key={`${c.email}-${index}`} className={c.unsubscribed || c.bounced ? 'is-muted' : undefined}>
              <td><span className="excel-clip" title={c.name}>{c.name || '—'}</span></td>
              <td><span className="excel-clip" title={c.email}>{c.email}</span></td>
              <td className="col-phone">{c.phone ? formatLeadPhone(c.phone) : <span className="email-blank">No phone</span>}</td>
              <td className="col-date">{c.opened || ''}</td>
              <td className="col-date">{c.clicked || ''}</td>
              <td className="col-date">{c.unsubscribed || ''}</td>
              <td className="col-date">{c.bounced || ''}</td>
              <td className="col-date">{c.lastSent || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImportPanel({
  file,
  table,
  stats,
  busy,
  error,
  done,
  onWrite,
  onClose,
}: {
  file: string
  table: SheetTable | null
  stats: ImportStats | null
  busy: boolean
  error: string
  done: boolean
  onWrite: () => void
  onClose: () => void
}) {
  return (
    <section className="settings-card email-import" aria-label="Import contacts">
      <h2>{done ? 'Written to EmailContacts' : `Import ${file}`}</h2>
      {error ? <p role="alert" className="email-error">{error}</p> : null}
      {!stats && !error ? <p>{table ? `Checking ${n(table.rows.length)} rows…` : 'Reading the file…'}</p> : null}
      {stats ? (
        <>
          <dl className="email-stats">
            {[
              ['Rows in file', stats.received],
              ['Dropped, no email', stats.no_email],
              ['Same email, same building (kept once)', stats.duplicates],
              [done ? 'Rows written' : 'Rows to write', stats.written],
              ['Unique emails', stats.unique_emails],
              ['No phone (kept, phone blank)', stats.no_phone],
              ['Already unsubscribed or bounced', stats.unsubscribed],
              ...Object.entries(stats.communities),
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{n(Number(value))}</dd>
              </div>
            ))}
          </dl>
          {!done ? (
            <p>
              This replaces the EmailContacts tab in the MahmoudDXB Leads sheet, sorted by community, then building. The Leads tab is not touched.
              Opens, clicks, unsubscribes and bounces already recorded are kept.
            </p>
          ) : null}
        </>
      ) : null}
      <div className="email-actions">
        {stats && !done ? (
          <button type="button" className="btn" disabled={busy} onClick={onWrite}>
            {busy ? 'Writing…' : `Write ${n(stats.written)} rows`}
          </button>
        ) : null}
        <button type="button" className="btn ghost" disabled={busy && !!stats && !done} onClick={onClose}>
          {done ? 'Close' : 'Cancel'}
        </button>
      </div>
    </section>
  )
}

export default function EmailContactsView({ onTab }: EmailContactsViewProps) {
  const [contacts, setContacts] = useState<EmailContact[]>([])
  const [unsubscribes, setUnsubscribes] = useState<EmailUnsubscribe[]>([])
  const [exists, setExists] = useState(true)
  const [cachedAt, setCachedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [community, setCommunity] = useState('')
  const [status, setStatus] = useState<EmailStatus>('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [importFile, setImportFile] = useState('')
  const [importTable, setImportTable] = useState<SheetTable | null>(null)
  const [importStats, setImportStats] = useState<ImportStats | null>(null)
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importDone, setImportDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = (fresh = false) => {
    setLoading(true)
    fetchEmailContacts(fresh)
      .then((r) => {
        setContacts(r.contacts)
        setUnsubscribes(r.unsubscribes)
        setExists(r.exists)
        setCachedAt(r.cachedAt)
        setLoadError('')
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof EmailContactsError && e.status === 401 ? 'Your session ended. Sign in again.' : 'Could not load email contacts from the sheet. Try Refresh.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => load(), [])

  const communities = useMemo(() => [...new Set(contacts.map((c) => c.community || 'No community'))], [contacts])
  const filtered = useMemo(
    () => contacts.filter((c) => (!community || (c.community || 'No community') === community) && matchesStatus(c, status) && matchesQuery(c, query)),
    [contacts, community, status, query],
  )
  const groups = useMemo(() => groupContacts(filtered), [filtered])
  const all = useMemo(() => totals(filtered), [filtered])
  const uniqueEmails = useMemo(() => new Set(filtered.map((c) => c.email)).size, [filtered])
  const narrowed = !!(query.trim() || status)

  useEffect(() => {
    if (narrowed && filtered.length <= AUTO_OPEN_MAX) setOpen(new Set(groups.flatMap((g) => g.buildings.map((b) => `${g.community}|${b.building}`))))
    else setOpen(new Set())
  }, [narrowed, filtered, groups])

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const startImport = async (file: File) => {
    setImportFile(file.name)
    setImportTable(null)
    setImportStats(null)
    setImportError('')
    setImportDone(false)
    try {
      const table = await readSheetFile(file)
      setImportTable(table)
      setImportStats(await importEmailContacts(table.columns, table.rows, true))
    } catch (e: unknown) {
      const code = e instanceof EmailContactsError ? e.message : ''
      setImportError(
        code === 'no_email_column'
          ? 'No email column found. The file needs a column called email (plus owner_name, phone, area, project_or_building).'
          : code === 'too_large' || code === 'too_many_rows'
            ? 'This file is too big for one upload. Split it in two (for example one file per community).'
            : e instanceof Error && !(e instanceof EmailContactsError)
              ? e.message
              : 'The check failed. Try again.',
      )
    }
  }

  const writeImport = async () => {
    if (!importTable) return
    setImportBusy(true)
    setImportError('')
    try {
      setImportStats(await importEmailContacts(importTable.columns, importTable.rows, false))
      setImportDone(true)
      load(true)
    } catch {
      setImportError('Writing to the sheet failed. Nothing is lost; try again.')
    } finally {
      setImportBusy(false)
    }
  }

  const closeImport = () => {
    setImportFile('')
    setImportTable(null)
    setImportStats(null)
    setImportError('')
    setImportDone(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const downloadCsv = () => {
    const blob = new Blob([contactsCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const label = [community, EMAIL_STATUSES.find((s) => s.id === status)?.label].filter(Boolean).join(' ').replace(/[^\w]+/g, '-') || 'all'
    a.href = url
    a.download = `email-contacts-${label.toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const freshness = cachedAt ? new Date(cachedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }) : ''

  return (
    <section className="clients-screen people-screen email-screen" aria-label="Email contacts">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="email" onTab={onTab} />
          <span className="live-stack">
            <span className="live-chip" title="EmailContacts tab of the MahmoudDXB Leads sheet">LIVE · EmailContacts</span>
            <span className="freshness">{loading ? 'Loading…' : `${n(contacts.length)} contacts${freshness ? ` · ${freshness} Dubai` : ''}`}</span>
          </span>
        </div>
        <label className="search">
          <input
            type="search"
            placeholder="Search name, email, phone or building"
            value={query}
            aria-label="Search email contacts"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="sheet-filters">
          <label className="client-filter">
            Community
            <select value={community} onChange={(event) => setCommunity(event.target.value)} aria-label="Community">
              <option value="">All communities</option>
              {communities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="client-filter">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as EmailStatus)} aria-label="Status">
              {EMAIL_STATUSES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <span className="count">{filtered.length === contacts.length ? `${n(contacts.length)} contacts` : `${n(filtered.length)} of ${n(contacts.length)}`}</span>
        </div>
      </header>
      <div className="email-body">
        <div className="email-toolbar">
          <dl className="email-summary">
            <div><dt>Contacts</dt><dd>{n(all.total)}</dd></div>
            <div><dt>Unique emails</dt><dd>{n(uniqueEmails)}</dd></div>
            <div><dt>No phone</dt><dd>{n(all.total - all.phone)}</dd></div>
            <div><dt>Opened</dt><dd>{n(all.opened)}</dd></div>
            <div><dt>Clicked</dt><dd>{n(all.clicked)}</dd></div>
            <div><dt>Unsubscribed</dt><dd>{n(all.unsubscribed)}</dd></div>
            <div><dt>Bounced</dt><dd>{n(all.bounced)}</dd></div>
          </dl>
          <div className="email-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void startImport(file)
              }}
            />
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import file
            </button>
            <button type="button" className="btn ghost" disabled={!filtered.length} onClick={downloadCsv} title="Unsubscribed and bounced addresses are left out">
              Download CSV
            </button>
            <button type="button" className="btn ghost" disabled={loading} onClick={() => load(true)}>
              Refresh
            </button>
          </div>
        </div>
        {importFile ? (
          <ImportPanel
            file={importFile}
            table={importTable}
            stats={importStats}
            busy={importBusy}
            error={importError}
            done={importDone}
            onWrite={() => void writeImport()}
            onClose={closeImport}
          />
        ) : null}
        {loading && !contacts.length ? (
          <p className="clients-empty">Loading email contacts…</p>
        ) : loadError ? (
          <p className="clients-empty" role="alert">{loadError}</p>
        ) : !exists || !contacts.length ? (
          <p className="clients-empty">
            No email contacts yet. Use Import file to load the Phase 1 owner list (.csv or .xlsx with owner_name, phone, email, area,
            project_or_building). It is written to the EmailContacts tab.
          </p>
        ) : !filtered.length ? (
          <p className="clients-empty">No contacts match these filters.</p>
        ) : (
          groups.map((group) => (
            <section key={group.community} className="email-community" aria-label={group.community}>
              <header className="email-community-head">
                <h2>{group.community}</h2>
                <span className="email-community-meta">{n(group.buildings.length)} buildings</span>
                <CountChips counts={group.counts} />
              </header>
              <ul className="email-buildings">
                {group.buildings.map((b) => {
                  const key = `${group.community}|${b.building}`
                  const isOpen = open.has(key)
                  return (
                    <li key={key} className={isOpen ? 'is-open' : undefined}>
                      <button type="button" className="email-building" aria-expanded={isOpen} onClick={() => toggle(key)}>
                        <span className="email-caret" aria-hidden="true">›</span>
                        <span className="email-building-name">{b.building}</span>
                        <CountChips counts={b.counts} />
                      </button>
                      {isOpen ? <ContactTable contacts={b.contacts} /> : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
        <details className="email-unsubs">
          <summary>Unsubscribe list ({n(unsubscribes.length)})</summary>
          <p>
            Email unsubscribes, spam complaints and bounces from the email webhook. They are saved in the StopList tab (channel email), and a new
            import never makes them emailable again.
          </p>
          {unsubscribes.length ? (
            <div className="sheet-scroll email-table">
              <table className="excel">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th className="col-date">When</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {unsubscribes.map((u) => (
                    <tr key={u.email}>
                      <td>{u.email}</td>
                      <td className="col-date">{u.at}</td>
                      <td>{u.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="email-blank">Nobody has unsubscribed yet.</p>
          )}
        </details>
      </div>
    </section>
  )
}
