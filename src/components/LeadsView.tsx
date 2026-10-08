import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { useLogout } from './CrmLayout'
import { WHATSAPP_E164 } from '../lib/format'
import ReportIssueButton from './ReportIssue'
import WhatsAppIcon from './WhatsAppIcon'
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LeadsError,
  fetchLeads,
  formatClock,
  formatLeadPhone,
  leadLabel,
  leadMatches,
  leadWhatsappHref,
  deleteLead,
  patchLead,
  scheduleFollowUp,
  type Lead,
  type LeadPatch,
  type LeadStatus,
  socialHandle,
} from '../lib/leads'
import { BRAND, BrandMark } from '../lib/brand'
import { takeOpenLead } from './NoticeBell'

interface LeadsViewProps {
  onTab: (tab: AppTab) => void
}

type Phase = 'loading' | 'ready' | 'error'
type LeadSortKey = 'name' | 'phone' | 'status' | 'source' | 'project' | 'next' | 'comment' | 'notes' | 'added'

const COLUMNS: { key: LeadSortKey; label: string; className: string; value: (lead: Lead) => string }[] = [
  { key: 'name', label: 'Name', className: '', value: (lead) => lead.name },
  { key: 'comment', label: 'Comment', className: 'col-comment', value: (lead) => lead.comment },
  { key: 'phone', label: 'Phone', className: 'col-phone', value: (lead) => (lead.phone ? formatLeadPhone(lead.phone) : '') },
  { key: 'status', label: 'Status', className: 'col-status', value: (lead) => lead.status },
  { key: 'source', label: 'Source', className: 'col-source', value: (lead) => leadLabel(lead.source) },
  { key: 'project', label: 'Project', className: 'col-project', value: (lead) => lead.project_or_community },
  { key: 'next', label: 'Next action', className: 'col-date', value: (lead) => lead.next_action_date },
  { key: 'notes', label: 'Notes', className: 'col-note', value: (lead) => lead.notes },
  { key: 'added', label: 'Added', className: 'col-date', value: (lead) => lead.created_at.slice(0, 10) },
]

const DEFAULT_WIDTHS: Record<LeadSortKey, number> = {
  name: 200,
  comment: 240,
  phone: 150,
  status: 180,
  source: 120,
  project: 180,
  next: 140,
  notes: 200,
  added: 112,
}
const ACTIONS_WIDTH = 150
const MIN_WIDTH = 72
const MAX_WIDTH = 640
const LAYOUT_KEY = 'mdxb.leads.layout.v1'
const DEFAULT_ORDER = COLUMNS.map((column) => column.key)

interface LeadsLayout {
  order: LeadSortKey[]
  widths: Partial<Record<LeadSortKey, number>>
  sort: { key: LeadSortKey; dir: 'asc' | 'desc' } | null
}

function isKey(value: unknown): value is LeadSortKey {
  return typeof value === 'string' && (DEFAULT_ORDER as string[]).includes(value)
}

function loadLayout(): LeadsLayout {
  const fallback: LeadsLayout = { order: DEFAULT_ORDER, widths: {}, sort: null }
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<LeadsLayout>
    const saved = Array.isArray(parsed.order) ? parsed.order.filter(isKey) : []
    const order = [...new Set(saved)]
    for (const key of DEFAULT_ORDER) if (!order.includes(key)) order.push(key)
    const widths: Partial<Record<LeadSortKey, number>> = {}
    if (parsed.widths && typeof parsed.widths === 'object') {
      for (const [key, value] of Object.entries(parsed.widths)) {
        if (isKey(key) && typeof value === 'number' && Number.isFinite(value)) {
          widths[key] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
        }
      }
    }
    const sort =
      parsed.sort && isKey(parsed.sort.key) && (parsed.sort.dir === 'asc' || parsed.sort.dir === 'desc')
        ? { key: parsed.sort.key, dir: parsed.sort.dir }
        : null
    return { order, widths, sort }
  } catch {
    return fallback
  }
}

function saveLayout(layout: LeadsLayout) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* storage full or blocked: layout just won't persist */
  }
}

function moveKey(order: LeadSortKey[], from: LeadSortKey, to: LeadSortKey, after: boolean): LeadSortKey[] {
  if (from === to) return order
  const next = order.filter((key) => key !== from)
  const index = next.indexOf(to)
  if (index < 0) return order
  next.splice(after ? index + 1 : index, 0, from)
  return next
}

function sortValue(column: (typeof COLUMNS)[number], lead: Lead): string {
  if (column.key === 'next') return dateValue(lead.next_action_date)
  return column.value(lead).trim()
}

function blank(value: string): string {
  return value.trim() ? value : '—'
}

function dateValue(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function editingField(): boolean {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}

function DuplicateBadge({ lead }: { lead: Lead }) {
  if (lead.duplicate_count <= 0) return null
  return (
    <span className="dup-badge" title={`${lead.duplicate_count} other row${lead.duplicate_count === 1 ? '' : 's'} with this phone`}>
      x {lead.duplicate_count}
    </span>
  )
}

function LeadText({
  value,
  label,
  className,
  placeholder,
  maxLength,
  multiline,
  rows,
  commit,
}: {
  value: string
  label: string
  className: string
  placeholder?: string
  maxLength?: number
  multiline?: boolean
  rows?: number
  commit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const save = () => {
    const next = multiline ? draft : draft.trim()
    if (next !== value) commit(next)
  }
  if (multiline) {
    return (
      <textarea
        className={className}
        aria-label={label}
        placeholder={placeholder}
        rows={rows ?? 6}
        maxLength={maxLength}
        value={draft}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
      />
    )
  }
  return (
    <input
      className={className}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function StatusSelect({
  value,
  label,
  onChange,
}: {
  value: string
  label: string
  onChange: (status: LeadStatus) => void
}) {
  return (
    <select
      className="lead-status"
      data-status={value}
      aria-label={label}
      value={LEAD_STATUSES.includes(value as LeadStatus) ? value : ''}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation()
        const next = event.target.value
        if (LEAD_STATUSES.includes(next as LeadStatus)) onChange(next as LeadStatus)
      }}
    >
      {value && !LEAD_STATUSES.includes(value as LeadStatus) ? <option value="">{leadLabel(value)}</option> : null}
      {LEAD_STATUSES.map((status) => (
        <option key={status} value={status}>
          {leadLabel(status)}
        </option>
      ))}
    </select>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface ToolbarOption {
  id: string
  label: string
}

function ToolbarSelect({
  label,
  value,
  options,
  onChange,
  counts,
}: {
  label: string
  value: string
  options: ToolbarOption[]
  onChange: (id: string) => void
  counts?: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((option) => option.id === value) ?? options[0]
  const shown = current?.id ? current.label : current?.label.replace(/^(All|Any)\s+/i, '') || 'All'
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0

  return (
    <div className="toolbar-select" ref={ref}>
      <button
        type="button"
        className={`toolbar-btn${value ? ' is-set' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label || 'All'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="toolbar-btn-key">{label}:</span> {shown}
        </span>
        <Chevron />
      </button>
      {open ? (
        <ul className="source-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li
              key={option.id || 'all'}
              role="option"
              aria-selected={value === option.id}
              className={value === option.id ? 'is-on' : ''}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
            >
              <span className="source-check" aria-hidden="true">
                {value === option.id ? '✓' : ''}
              </span>
              <span className="source-name">{option.label}</span>
              {counts ? <span className="source-count">{option.id ? (counts[option.id] ?? 0) : total}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SourceFilter({ value, counts, onChange }: { value: string; counts: Record<string, number>; onChange: (id: string) => void }) {
  const options = [{ id: '', label: 'All' }, ...LEAD_SOURCES.map((id) => ({ id, label: leadLabel(id) }))]
  return <ToolbarSelect label="Source" value={value} options={options} counts={counts} onChange={onChange} />
}

function StatusFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const options = [
    { id: '', label: 'Any' },
    ...LEAD_STATUSES.map((id) => ({ id, label: leadLabel(id) })),
    { id: 'archived', label: 'Archived' },
  ]
  return <ToolbarSelect label="Status" value={value} options={options} onChange={onChange} />
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function LeadAvatar({ lead }: { lead: Lead }) {
  const href = leadWhatsappHref(lead)
  const face = lead.wa_photo_url ? (
    <img src={lead.wa_photo_url} alt="" loading="lazy" />
  ) : (
    <span className="lead-avatar-initials">{initials(lead.name)}</span>
  )
  if (!href) return <span className="lead-avatar is-off">{face}</span>
  return (
    <a
      className="lead-avatar"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Open WhatsApp chat · ${lead.name || formatLeadPhone(lead.phone)}`}
      aria-label={`Open WhatsApp chat with ${lead.name || 'this lead'}`}
      onClick={(event) => event.stopPropagation()}
    >
      {face}
      <span className="lead-avatar-wa" aria-hidden="true">
        <WhatsAppIcon />
      </span>
    </a>
  )
}

export default function LeadsView({ onTab }: LeadsViewProps) {
  const logout = useLogout()
  const [phase, setPhase] = useState<Phase>('loading')
  const [leads, setLeads] = useState<Lead[]>([])
  const [cachedAt, setCachedAt] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [lostOpen, setLostOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const initialLayout = useMemo(loadLayout, [])
  const [sort, setSort] = useState<{ key: LeadSortKey; dir: 'asc' | 'desc' } | null>(initialLayout.sort)
  const [order, setOrder] = useState<LeadSortKey[]>(initialLayout.order)
  const [widths, setWidths] = useState<Partial<Record<LeadSortKey, number>>>(initialLayout.widths)
  const [dragKey, setDragKey] = useState<LeadSortKey | null>(null)
  const [dropAt, setDropAt] = useState<{ key: LeadSortKey; after: boolean } | null>(null)
  const [resizing, setResizing] = useState<LeadSortKey | null>(null)
  const resizingRef = useRef(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const columnsRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState('')
  const inflight = useRef(0)
  const leadsRef = useRef(leads)
  leadsRef.current = leads

  const failAuth = useCallback(
    async (error: unknown) => {
      if (error instanceof LeadsError && error.status === 401) {
        await logout()
        return true
      }
      return false
    },
    [logout],
  )

  const load = useCallback(
    async (fresh: boolean) => {
      try {
        const result = await fetchLeads(fresh)
        if (inflight.current > 0) return
        setLeads(result.leads)
        setCachedAt(result.cachedAt)
        setPhase('ready')
      } catch (error) {
        if (await failAuth(error)) return
        if (leadsRef.current.length === 0) setPhase('error')
        else setToast('Could not refresh leads.')
      }
    },
    [failAuth],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (editingField()) return
      void load(false)
    }, 120_000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const save = useCallback(
    async (lead: Lead, patch: LeadPatch) => {
      const snapshot = lead
      if (patch.status === 'lost') setLostOpen(true)
      inflight.current += 1
      setLeads((current) => current.map((item) => (item.lead_id === lead.lead_id ? { ...item, ...patch } : item)))
      try {
        const saved = await patchLead(lead.lead_id, patch)
        setLeads((current) =>
          current.map((item) =>
            item.lead_id === saved.lead_id
              ? { ...saved, duplicate_count: item.duplicate_count, duplicate_ids: item.duplicate_ids }
              : item,
          ),
        )
        if ('next_action_date' in patch) {
          try {
            const scheduled = await scheduleFollowUp({
              leadId: lead.lead_id,
              date: patch.next_action_date || '',
              name: saved.name || lead.name,
              project: saved.project_or_community || lead.project_or_community,
            })
            if (!scheduled.ok) {
              setToast('Date saved. The Planner bot could not be reached, so the calendar was not updated.')
            } else if (scheduled.via === 'planner') {
              setToast(
                patch.next_action_date
                  ? 'Sent to the Planner bot. The event shows on mahmoud1594@gmail.com in a minute or two.'
                  : 'Sent to the Planner bot to remove the calendar event.',
              )
            } else {
              setToast(patch.next_action_date ? 'Follow-up is on mahmoud1594@gmail.com at 10:00 Dubai time.' : 'Follow-up removed from the calendar.')
            }
            window.dispatchEvent(new Event('crm-notices-refresh'))
          } catch (error) {
            if (!(await failAuth(error))) setToast('Date saved. The calendar did not take this follow-up.')
          }
        }
      } catch (error) {
        setLeads((current) => current.map((item) => (item.lead_id === snapshot.lead_id ? snapshot : item)))
        if (!(await failAuth(error))) setToast('Could not save. Change reverted.')
      } finally {
        inflight.current -= 1
      }
    },
    [failAuth],
  )

  const remove = useCallback(
    async (lead: Lead) => {
      try {
        await deleteLead(lead.lead_id)
        setLeads((current) => current.filter((item) => item.lead_id !== lead.lead_id))
        setOpenId(null)
        setToast('Lead deleted.')
      } catch (error) {
        if (!(await failAuth(error))) setToast('Could not delete this lead.')
      }
    },
    [failAuth],
  )

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of leads) if (leadMatches(lead, query, status, '')) counts[lead.source] = (counts[lead.source] ?? 0) + 1
    return counts
  }, [leads, query, status])

  const filtered = useMemo(
    () => leads.filter((lead) => leadMatches(lead, query, status, source)),
    [leads, query, status, source],
  )
  const rows = useMemo(() => {
    if (!sort) return filtered
    const column = COLUMNS.find((item) => item.key === sort.key)
    if (!column) return filtered
    return [...filtered].sort((a, b) => {
      const left = sortValue(column, a)
      const right = sortValue(column, b)
      // Blank cells always sink to the bottom, like Sheets/Airtable.
      if (!left && !right) return 0
      if (!left) return 1
      if (!right) return -1
      const compared = compareText(left, right)
      return sort.dir === 'asc' ? compared : -compared
    })
  }, [filtered, sort])
  const filing = status === ''
  const workingRows = filing ? rows.filter((lead) => lead.status !== 'lost' && lead.status !== 'archived') : rows
  const lostRows = filing ? rows.filter((lead) => lead.status === 'lost') : []
  const archivedRows = filing ? rows.filter((lead) => lead.status === 'archived') : []
  const sheetItems: Array<{ type: 'lead'; lead: Lead } | { type: 'bin'; id: 'lost' | 'archived'; count: number; open: boolean }> = filing
    ? [
        ...workingRows.map((lead) => ({ type: 'lead' as const, lead })),
        ...(lostRows.length ? [{ type: 'bin' as const, id: 'lost' as const, count: lostRows.length, open: lostOpen }] : []),
        ...(lostOpen ? lostRows.map((lead) => ({ type: 'lead' as const, lead })) : []),
        ...(archivedRows.length ? [{ type: 'bin' as const, id: 'archived' as const, count: archivedRows.length, open: archivedOpen }] : []),
        ...(archivedOpen ? archivedRows.map((lead) => ({ type: 'lead' as const, lead })) : []),
      ]
    : rows.map((lead) => ({ type: 'lead' as const, lead }))
  const open = rows.find((lead) => lead.lead_id === openId) ?? leads.find((lead) => lead.lead_id === openId) ?? null

  useEffect(() => {
    const openStored = () => {
      const id = takeOpenLead()
      if (id) setOpenId(id)
    }
    openStored()
    window.addEventListener('crm-open-lead', openStored)
    return () => window.removeEventListener('crm-open-lead', openStored)
  }, [])

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

  const toggleSort = (key: LeadSortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: 'asc' }
      if (current.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  useEffect(() => {
    saveLayout({ order, widths, sort })
  }, [order, widths, sort])

  useEffect(() => {
    if (!columnsOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!columnsRef.current?.contains(event.target as Node)) setColumnsOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnsOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [columnsOpen])

  const columns = useMemo(
    () => order.map((key) => COLUMNS.find((column) => column.key === key)).filter((c): c is (typeof COLUMNS)[number] => !!c),
    [order],
  )
  const widthOf = (key: LeadSortKey) => widths[key] ?? DEFAULT_WIDTHS[key]
  const tableWidth = columns.reduce((total, column) => total + widthOf(column.key), 0) + ACTIONS_WIDTH
  const customised = order.join() !== DEFAULT_ORDER.join() || Object.keys(widths).length > 0 || sort !== null

  const resetColumns = () => {
    setOrder(DEFAULT_ORDER)
    setWidths({})
    setSort(null)
  }

  const nudge = (key: LeadSortKey, delta: number) => {
    setOrder((current) => {
      const index = current.indexOf(key)
      const target = index + delta
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      next.splice(index, 1)
      next.splice(target, 0, key)
      return next
    })
  }

  const startResize = (key: LeadSortKey, event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = widthOf(key)
    resizingRef.current = true
    setResizing(key)
    const onMove = (move: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(startWidth + move.clientX - startX)))
      setWidths((current) => (current[key] === next ? current : { ...current, [key]: next }))
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      setResizing(null)
      window.setTimeout(() => {
        resizingRef.current = false
      }, 0)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const clock = cachedAt ? formatClock(cachedAt) : ''

  return (
    <section className="clients-screen people-screen" aria-label="Leads">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="leads" onTab={onTab} />
        </div>
        <label className="search">
          <input
            type="search"
            placeholder="Search name, phone, or project"
            value={query}
            aria-label="Search leads"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="sheet-filters">
          <SourceFilter value={source} counts={sourceCounts} onChange={setSource} />
          <StatusFilter value={status} onChange={setStatus} />
          <a
            className="leads-refresh leads-sheet-link"
            href="https://docs.google.com/spreadsheets/d/1C0n7RWJAEpli8auONZo6ynJCtohfrn3VBOa0U2P6JK4/edit"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Google Sheet
          </a>
          <div className="leads-columns" ref={columnsRef}>
            <button
              type="button"
              className="leads-refresh"
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen((value) => !value)}
            >
              Columns
            </button>
            {columnsOpen ? (
              <div className="leads-columns-menu" role="dialog" aria-label="Arrange columns">
                <p className="leads-columns-hint">Drag headers to move, drag their edge to resize, click to sort.</p>
                <ol>
                  {columns.map((column, index) => (
                    <li key={column.key}>
                      <span>{column.label}</span>
                      <button type="button" aria-label={`Move ${column.label} left`} disabled={index === 0} onClick={() => nudge(column.key, -1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${column.label} right`}
                        disabled={index === columns.length - 1}
                        onClick={() => nudge(column.key, 1)}
                      >
                        ↓
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" className="leads-columns-reset" disabled={!customised} onClick={resetColumns}>
                  Reset columns
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="leads-refresh" onClick={() => void load(true)}>
            Refresh
          </button>
          <span className="leads-updated">{clock ? `Last updated ${clock}` : 'Last updated'}</span>
          <label className="toolbar-select leads-sort-mobile">
            <select
              className="toolbar-btn toolbar-native"
              aria-label="Sort leads"
              value={sort ? `${sort.key}:${sort.dir}` : ''}
              onChange={(event) => {
                const [key, dir] = event.target.value.split(':')
                setSort(isKey(key) && (dir === 'asc' || dir === 'desc') ? { key, dir } : null)
              }}
            >
              <option value="">Sort: Sheet order</option>
              {COLUMNS.flatMap((column) => [
                <option key={`${column.key}:asc`} value={`${column.key}:asc`}>
                  Sort: {column.label} ↑
                </option>,
                <option key={`${column.key}:desc`} value={`${column.key}:desc`}>
                  Sort: {column.label} ↓
                </option>,
              ])}
            </select>
          </label>
          <span className="count">
            {phase !== 'ready' ? '' : rows.length === leads.length ? `${leads.length} leads` : `${rows.length} of ${leads.length}`}
          </span>
        </div>
      </header>
      {phase === 'loading' ? <p className="clients-empty">Loading leads…</p> : null}
      {phase === 'error' ? (
        <p className="clients-empty">
          Leads could not be loaded.
          <button type="button" className="leads-retry" onClick={() => void load(false)}>
            Retry
          </button>
        </p>
      ) : null}
      {phase === 'ready' && leads.length === 0 ? <p className="clients-empty">No leads yet.</p> : null}
      {phase === 'ready' && leads.length > 0 && rows.length === 0 ? (
        <p className="clients-empty">No leads match these filters.</p>
      ) : null}
      {phase === 'ready' && rows.length > 0 ? (
        <>
          <div className="sheet-scroll leads-table">
            <table className={`excel excel-grid${resizing ? ' is-resizing' : ''}${dragKey ? ' is-dragging' : ''}`} style={{ width: tableWidth }}>
              <colgroup>
                {columns.map((column) => (
                  <col key={column.key} style={{ width: widthOf(column.key) }} />
                ))}
                <col style={{ width: ACTIONS_WIDTH }} />
              </colgroup>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={[
                        column.className,
                        dragKey === column.key ? 'is-drag-source' : '',
                        dropAt?.key === column.key && dragKey !== column.key ? (dropAt.after ? 'drop-after' : 'drop-before') : '',
                        sort?.key === column.key ? 'is-sorted' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-sort={sort?.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      draggable={!resizing}
                      title="Drag to move · click to sort"
                      onDragStart={(event) => {
                        if (resizingRef.current) {
                          event.preventDefault()
                          return
                        }
                        setDragKey(column.key)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', column.key)
                      }}
                      onDragOver={(event) => {
                        if (!dragKey) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        const box = event.currentTarget.getBoundingClientRect()
                        const after = event.clientX > box.left + box.width / 2
                        setDropAt((current) => (current?.key === column.key && current.after === after ? current : { key: column.key, after }))
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragKey && dropAt) setOrder((current) => moveKey(current, dragKey, dropAt.key, dropAt.after))
                        setDragKey(null)
                        setDropAt(null)
                      }}
                      onDragEnd={() => {
                        setDragKey(null)
                        setDropAt(null)
                      }}
                    >
                      <button
                        type="button"
                        className="excel-sort"
                        onClick={() => {
                          if (!resizingRef.current) toggleSort(column.key)
                        }}
                      >
                        <span className="excel-grip" aria-hidden="true">⋮⋮</span>
                        <span className="excel-label">{column.label}</span>
                        <span className="excel-arrow" aria-hidden="true">
                          {sort?.key === column.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                      <span
                        className={`col-resize${resizing === column.key ? ' is-active' : ''}`}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${column.label}`}
                        draggable={false}
                        onPointerDown={(event) => startResize(column.key, event)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => {
                          event.stopPropagation()
                          setWidths((current) => {
                            const next = { ...current }
                            delete next[column.key]
                            return next
                          })
                        }}
                      />
                    </th>
                  ))}
                  <th className="excel-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sheetItems.map((item) => {
                  if (item.type === 'bin') {
                    return (
                      <tr key={item.id} className="lead-bin-row">
                        <td colSpan={columns.length + 1}>
                          <button
                            type="button"
                            className="lead-bin-toggle"
                            aria-expanded={item.open}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (item.id === 'lost') setLostOpen((value) => !value)
                              else setArchivedOpen((value) => !value)
                            }}
                          >
                            <span aria-hidden="true">{item.open ? '▾' : '▸'}</span>
                            {item.id === 'lost' ? 'Lost' : 'Archived'}
                            <span className="lead-bin-count">{item.count}</span>
                          </button>
                        </td>
                      </tr>
                    )
                  }
                  const lead = item.lead
                  return (
                  <tr
                    key={lead.lead_id}
                    className={lead.status === 'lost' ? 'is-lost' : lead.status === 'archived' ? 'is-archived' : undefined}
                    onClick={() => setOpenId(lead.lead_id)}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={column.className}>
                        {column.key === 'status' ? (
                          <StatusSelect
                            value={lead.status}
                            label={`Status for ${lead.name || 'lead'}`}
                            onChange={(next) => {
                              if (next !== lead.status) void save(lead, { status: next })
                            }}
                          />
                        ) : column.key === 'next' ? (
                          <input
                            className="lead-date"
                            type="date"
                            aria-label={`Next action for ${lead.name || 'lead'}`}
                            value={dateValue(lead.next_action_date)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation()
                              if (event.target.value !== dateValue(lead.next_action_date)) {
                                void save(lead, { next_action_date: event.target.value })
                              }
                            }}
                          />
                        ) : column.key === 'name' ? (
                          <span className="lead-name">
                            <LeadAvatar lead={lead} />
                            <LeadText
                              className="lead-inline"
                              label={`Name for ${lead.name || 'lead'}`}
                              value={lead.name}
                              maxLength={200}
                              placeholder="Lead name"
                              commit={(name) => save(lead, { name })}
                            />
                            <DuplicateBadge lead={lead} />
                          </span>
                        ) : column.key === 'comment' ? (
                          <LeadText
                            className="lead-inline"
                            label={`Comment for ${lead.name || 'lead'}`}
                            value={lead.comment}
                            maxLength={4000}
                            placeholder=""
                            commit={(comment) => save(lead, { comment })}
                          />
                        ) : (
                          <span className="excel-clip" title={column.value(lead)}>
                            {blank(column.value(lead))}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="excel-actions" onClick={(event) => event.stopPropagation()}>
                      <LeadActions lead={lead} />
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="leads-cards-scroll">
            <div className="clients-grid leads-cards">
              {sheetItems.map((item) => {
                if (item.type === 'bin') {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="lead-bin-toggle lead-bin-card"
                      aria-expanded={item.open}
                      onClick={() => {
                        if (item.id === 'lost') setLostOpen((value) => !value)
                        else setArchivedOpen((value) => !value)
                      }}
                    >
                      <span aria-hidden="true">{item.open ? '▾' : '▸'}</span>
                      {item.id === 'lost' ? 'Lost' : 'Archived'}
                      <span className="lead-bin-count">{item.count}</span>
                    </button>
                  )
                }
                const lead = item.lead
                return (
                <article
                  key={lead.lead_id}
                  className={lead.status === 'lost' ? 'client-card is-lost' : lead.status === 'archived' ? 'client-card is-archived' : 'client-card'}
                  onClick={() => setOpenId(lead.lead_id)}
                >
                  <header className="client-card-top">
                    <StatusSelect
                      value={lead.status}
                      label={`Status for ${lead.name || 'lead'}`}
                      onChange={(next) => {
                        if (next !== lead.status) void save(lead, { status: next })
                      }}
                    />
                    <time dateTime={lead.created_at || undefined}>{blank(lead.created_at.slice(0, 10))}</time>
                  </header>
                  <h2>
                    <LeadAvatar lead={lead} />
                    <LeadText
                      className="lead-inline lead-card-name"
                      label={`Name for ${lead.name || 'lead'}`}
                      value={lead.name}
                      maxLength={200}
                      placeholder="Lead name"
                      commit={(name) => save(lead, { name })}
                    />
                    <DuplicateBadge lead={lead} />
                  </h2>
                  <p className="client-phone">{lead.phone ? formatLeadPhone(lead.phone) : '—'}</p>
                  <p className="card-meta">{blank(lead.project_or_community || lead.interest)}</p>
                  {lead.comment ? <p className="card-snippet">{lead.comment}</p> : null}
                  <p className="card-snippet">{leadLabel(lead.source) || '—'}</p>
                  <div onClick={(event) => event.stopPropagation()}>
                    <LeadActions lead={lead} labelled />
                  </div>
                </article>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
      {open ? (
        <div className="people-sheet" role="dialog" aria-modal="true" aria-label={open.name || 'Lead'}>
          <header className="people-sheet-bar">
            <button type="button" className="people-sheet-close" onClick={() => setOpenId(null)}>
              Close
            </button>
            <span className="leads-updated">{clock ? `Last updated ${clock}` : ''}</span>
          </header>
          <LeadDetail
            lead={open}
            onSave={(patch) => void save(open, patch)}
            onArchive={() => {
              void save(open, { status: 'archived' })
              setOpenId(null)
              setArchivedOpen(true)
              setToast('Lead archived.')
            }}
            onRestore={() => {
              void save(open, { status: 'new' })
              setToast('Lead restored.')
            }}
            onDelete={() => void remove(open)}
          />
        </div>
      ) : null}
      {toast ? (
        <p className="leads-toast" role="status">
          {toast}
        </p>
      ) : null}
    </section>
  )
}

function LeadActions({ lead, labelled = false }: { lead: Lead; labelled?: boolean }) {
  const href = leadWhatsappHref(lead)
  const brokerage = lead.phone === WHATSAPP_E164
  return (
    <div className="excel-actions-inner">
      {href && labelled ? (
        <a className="lead-message" href={href} target="_blank" rel="noreferrer">
          <WhatsAppIcon />
          Message this lead
        </a>
      ) : href ? (
        <a
          className="icon-wa"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Message this lead on WhatsApp ${lead.phone ? formatLeadPhone(lead.phone) : ''}`}
          title={`Message this lead${lead.phone ? ` · ${formatLeadPhone(lead.phone)}` : ''}`}
        >
          <WhatsAppIcon />
        </a>
      ) : (
        <span className="icon-wa is-off" title={brokerage ? `This number is the ${BRAND} line` : 'No phone on this row'}>
          <WhatsAppIcon />
        </span>
      )}
      {lead.deal_url ? (
        <a className="deal-link" href={lead.deal_url} target="_blank" rel="noreferrer">
          Open deal
        </a>
      ) : null}
    </div>
  )
}

function LeadDetail({
  lead,
  onSave,
  onArchive,
  onRestore,
  onDelete,
}: {
  lead: Lead
  onSave: (patch: LeadPatch) => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const href = leadWhatsappHref(lead)
  const brokerage = lead.phone === WHATSAPP_E164
  const [notes, setNotes] = useState(lead.notes)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  useEffect(() => {
    setNotes(lead.notes)
    setConfirm(null)
  }, [lead.lead_id, lead.notes])

  return (
    <article className="client-card lead-detail">
      <header className="client-card-top">
        <StatusSelect
          value={lead.status}
          label="Status"
          onChange={(next) => {
            if (next !== lead.status) onSave({ status: next })
          }}
        />
        <time dateTime={lead.created_at || undefined}>{blank(lead.created_at.slice(0, 10))}</time>
      </header>
      <label className="lead-field">
        <span>Name</span>
        <span className="lead-name-row">
          <LeadText
            className="lead-name-input"
            label="Lead name"
            value={lead.name}
            maxLength={200}
            placeholder="Lead name"
            commit={(name) => onSave({ name })}
          />
          <DuplicateBadge lead={lead} />
        </span>
      </label>
      <label className="lead-field lead-comment-field">
        <span>Comment</span>
        <LeadText
          className="lead-notes lead-comment"
          label="Comment about this client"
          value={lead.comment}
          maxLength={4000}
          placeholder="Write about this client"
          multiline
          rows={6}
          commit={(comment) => onSave({ comment })}
        />
      </label>
      <p className="client-phone">{lead.phone ? formatLeadPhone(lead.phone) : '—'}</p>
      <dl className="facts">
        <dt>Email</dt>
        <dd>{blank(lead.email)}</dd>
        <dt>Source</dt>
        <dd>{blank(leadLabel(lead.source))}</dd>
        {lead.utm_campaign ? (
          <>
            <dt>Campaign</dt>
            <dd>{lead.utm_campaign}</dd>
          </>
        ) : null}
        {socialHandle(lead) ? (
          <>
            <dt>Social</dt>
            <dd>{socialHandle(lead)}</dd>
          </>
        ) : null}
        <dt>Project</dt>
        <dd>{blank(lead.project_or_community)}</dd>
        <dt>Interest</dt>
        <dd>{blank(lead.interest)}</dd>
        <dt>Next action</dt>
        <dd>
          <input
            className="lead-date"
            type="date"
            aria-label="Next action date"
            value={dateValue(lead.next_action_date)}
            onChange={(event) => {
              if (event.target.value !== dateValue(lead.next_action_date)) onSave({ next_action_date: event.target.value })
            }}
          />
        </dd>
        <dt>Notes</dt>
        <dd>
          <textarea
            className="lead-notes"
            aria-label="Notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== lead.notes) onSave({ notes })
            }}
          />
        </dd>
        <dt>Message</dt>
        <dd>{blank(lead.message)}</dd>
      </dl>
      <div className="lead-actions">
        {href ? (
          <a className="btn whatsapp" href={href} target="_blank" rel="noreferrer">
            WhatsApp this lead
            <small>{lead.phone ? formatLeadPhone(lead.phone) : ''}</small>
          </a>
        ) : (
          <p className="pin-note">
            {brokerage
              ? `This number is the ${BRAND} line, so WhatsApp is not opened from this card.`
              : 'No phone on this row, so there is no WhatsApp link.'}
          </p>
        )}
        {lead.deal_url ? (
          <a className="btn ghost" href={lead.deal_url} target="_blank" rel="noreferrer">
            Open deal
          </a>
        ) : null}
        <ReportIssueButton
          record={{
            name: lead.name,
            project: lead.project_or_community,
            dealId: lead.bitrix_id,
            source: 'Leads sheet',
          }}
        />
        <div className="lead-dispose">
          {confirm === 'delete' ? (
            <>
              <p>Delete this lead from the sheet? This cannot be undone.</p>
              <button type="button" className="btn lead-delete" onClick={onDelete}>
                Delete lead
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </>
          ) : confirm === 'archive' ? (
            <>
              <p>Archive this lead? It leaves the working list. Open it again from Archived.</p>
              <button type="button" className="btn" onClick={onArchive}>
                Archive lead
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {lead.status === 'archived' ? (
                <button type="button" className="btn ghost" onClick={onRestore}>
                  Restore
                </button>
              ) : (
                <button type="button" className="btn ghost" onClick={() => setConfirm('archive')}>
                  Archive
                </button>
              )}
              <button type="button" className="btn ghost lead-delete" onClick={() => setConfirm('delete')}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
