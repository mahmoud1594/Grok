import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLeads } from '../lib/leads'
import { buildNotices, type Notice, type NoticeEvent } from '../lib/notices'
import { authHeaders } from '../lib/news'
import { navigate, pathForTab } from '../lib/routes'

const OPEN_KEY = 'crm-open-lead'

function openLead(id: string) {
  try {
    sessionStorage.setItem(OPEN_KEY, id)
  } catch {
    // Private mode: the event still opens the lead if Leads is already on screen.
  }
  navigate(pathForTab('leads'))
  window.dispatchEvent(new Event(OPEN_KEY))
}

export function takeOpenLead(): string | null {
  try {
    const id = sessionStorage.getItem(OPEN_KEY)
    if (id) sessionStorage.removeItem(OPEN_KEY)
    return id
  } catch {
    return null
  }
}

export default function NoticeBell() {
  const [open, setOpen] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const [leadBody, eventResponse] = await Promise.all([
        fetchLeads().catch(() => null),
        fetch('/api/calendar/events', { credentials: 'same-origin', headers: authHeaders(), cache: 'no-store' }).catch(() => null),
      ])
      const events = eventResponse
        ? (((await eventResponse.json().catch(() => ({}))) as { events?: NoticeEvent[] }).events ?? [])
        : []
      setNotices(buildNotices(leadBody?.leads ?? [], events, new Date()))
    } catch {
      // A failed refresh keeps the last list.
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    const onFocus = () => void load()
    const onRefresh = () => void load()
    window.addEventListener('focus', onFocus)
    window.addEventListener('crm-notices-refresh', onRefresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('crm-notices-refresh', onRefresh)
    }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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

  const count = notices.length
  const label = count === 0 ? 'Notifications, nothing due' : `Notifications, ${count} due`

  return (
    <div className="notice-anchor" ref={rootRef}>
      <button
        type="button"
        className={count ? 'notice-bell has-due' : 'notice-bell'}
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          if (!open) void load()
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 ? <span className="notice-count">{count > 9 ? '9+' : count}</span> : null}
      </button>
      {open ? (
        <div className="notice-panel" role="dialog" aria-label="Things to do">
          <h2>To do</h2>
          {notices.length === 0 ? <p>Nothing due right now.</p> : null}
          <ul>
            {notices.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`notice-item is-${item.kind}`}
                  onClick={() => {
                    setOpen(false)
                    if (item.leadId) openLead(item.leadId)
                    else navigate(pathForTab('calendar'))
                  }}
                >
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
