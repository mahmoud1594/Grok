import { useCallback, useEffect, useMemo, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { useLogout } from './CrmLayout'
import { ApiError, authHeaders, getJson } from '../lib/news'
import { BrandMark } from '../lib/brand'

interface CalendarViewProps {
  onTab: (tab: AppTab) => void
}

type CalendarMode = 'LIST' | 'AGENDA' | 'WEEK' | 'MONTH'

const MODES: { id: CalendarMode; label: string }[] = [
  { id: 'LIST', label: 'List' },
  { id: 'AGENDA', label: 'Agenda' },
  { id: 'WEEK', label: 'Week' },
  { id: 'MONTH', label: 'Month' },
]

interface CalendarEvent {
  id: string
  calendar: string
  title: string
  location: string
  allDay: boolean
  start: string
  end: string
  link: string
}

interface EventsResponse {
  ok: boolean
  setup?: 'no_calendars' | 'sa_not_configured' | 'api_disabled' | 'not_shared' | 'error'
  message?: string
  account?: string
  calendars?: { id: string; ok: boolean; summary: string; setup: string | null }[]
  events?: CalendarEvent[]
}

function defaultEmbedMode(): CalendarMode {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'AGENDA' : 'WEEK'
}

function withMode(embedUrl: string, mode: CalendarMode): string {
  const url = new URL(embedUrl)
  url.searchParams.set('mode', mode === 'LIST' ? 'AGENDA' : mode)
  if (!url.searchParams.has('showPrint')) url.searchParams.set('showPrint', '0')
  if (!url.searchParams.has('showTitle')) url.searchParams.set('showTitle', '0')
  return url.href
}

function openUrl(embedUrl: string | null): string {
  const src = embedUrl ? new URL(embedUrl).searchParams.get('src') : null
  return src ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(src)}` : 'https://calendar.google.com/calendar/u/0/r'
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai' })

function dayKey(e: CalendarEvent): string {
  if (e.allDay) return e.start.slice(0, 10)
  const d = new Date(e.start)
  return new Date(d.getTime() + 4 * 3600e3).toISOString().slice(0, 10)
}

function dayLabel(key: string): string {
  return DAY.format(new Date(`${key}T12:00:00+04:00`))
}

function timeLabel(e: CalendarEvent): string {
  if (e.allDay) return 'All day'
  const s = new Date(e.start)
  const t = new Date(e.end)
  return Number.isNaN(t.getTime()) ? TIME.format(s) : `${TIME.format(s)}–${TIME.format(t)}`
}

function SetupSteps({ events }: { events: EventsResponse }) {
  const account = events.account || 'the CRM service account'
  if (events.setup === 'api_disabled') {
    return (
      <ol>
        <li>
          Open <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=mahmouddxb-leads" target="_blank" rel="noreferrer">Google Calendar API</a> for the project <code>mahmouddxb-leads</code> and click <strong>Enable</strong>.
        </li>
        <li>
          In Google Calendar → Settings → your calendar → <strong>Share with specific people</strong> → add <code>{account}</code> with <strong>See all event details</strong>.
        </li>
      </ol>
    )
  }
  if (events.setup === 'not_shared') {
    return (
      <ol>
        <li>
          In Google Calendar → Settings → your calendar (and “Work”, if wanted) → <strong>Share with specific people</strong> → add <code>{account}</code> with <strong>See all event details</strong>.
        </li>
      </ol>
    )
  }
  return null
}

export default function CalendarView({ onTab }: CalendarViewProps) {
  const logout = useLogout()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [events, setEvents] = useState<EventsResponse | null>(null)
  const [mode, setMode] = useState<CalendarMode>(defaultEmbedMode)

  const load = useCallback(async () => {
    setPhase('loading')
    try {
      const body = await getJson<{ embedUrl?: string | null }>('/api/calendar')
      setEmbedUrl(body.embedUrl || null)
      // Events read server-side with the service account. A 200 with ok:false carries a setup hint.
      const response = await fetch('/api/calendar/events', { credentials: 'same-origin', headers: authHeaders(), cache: 'no-store' })
      if (response.status === 401) throw new ApiError(401, 'unauthorized')
      const ev = (await response.json().catch(() => ({ ok: false, setup: 'error' }))) as EventsResponse
      setEvents(ev)
      if (!ev.ok) setMode((current) => (current === 'LIST' ? defaultEmbedMode() : current))
      setPhase('ready')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout()
        return
      }
      setPhase('error')
    }
  }, [logout])

  useEffect(() => {
    void load()
  }, [load])

  const src = useMemo(() => (embedUrl && mode !== 'LIST' ? withMode(embedUrl, mode) : null), [embedUrl, mode])
  const full = mode !== 'LIST' && (phase !== 'ready' || Boolean(src))
  const days = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events?.events ?? []) {
      const k = dayKey(e)
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return [...map.entries()]
  }, [events])
  const listReady = Boolean(events?.ok)

  return (
    <section className={full ? 'clients-screen people-screen calendar-screen is-full' : 'clients-screen people-screen calendar-screen'} aria-label="Calendar">
      {full ? null : <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="calendar" onTab={onTab} />
          <span className="live-stack">
            <span className="live-chip">Google Calendar</span>
            <span className="freshness">Dubai time</span>
          </span>
        </div>
        <div className="sheet-filters">
          <div className="source-chips" role="group" aria-label="Calendar view">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? 'is-on' : ''}
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <a className="leads-refresh calendar-open" href={openUrl(embedUrl)} target="_blank" rel="noreferrer">
            Open in Google Calendar
          </a>
        </div>
      </header>}
      {phase === 'loading' ? <p className="clients-empty">Loading calendar…</p> : null}
      {phase === 'error' ? (
        <p className="clients-empty">
          The calendar could not be loaded.
          <button type="button" className="leads-retry" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}
      {phase === 'ready' && events && !events.ok && mode === 'LIST' ? (
        <div className="clients-empty calendar-setup">
          <strong>{events.message || 'The calendar list is not connected yet.'}</strong>
          <SetupSteps events={events} />
          <p>Until then, use Agenda / Week / Month (Google’s own view, needs you signed in to Google in this browser).</p>
        </div>
      ) : null}
      {phase === 'ready' && events && !events.ok && mode !== 'LIST' && !full ? (
        <p className="calendar-note">
          Google’s embedded view shows your events only when this browser is signed in to Google as mahmoud1594@gmail.com and allows Google cookies (Safari and iPhone usually block them).
          {events.setup === 'api_disabled' || events.setup === 'not_shared' ? ' Finish the List setup to see events everywhere.' : ''}
          <button type="button" className="leads-retry" onClick={() => setMode('LIST')}>
            Setup steps
          </button>
        </p>
      ) : null}
      {phase === 'ready' && listReady && mode === 'LIST' ? (
        <div className="calendar-list" aria-label="Upcoming events">
          {days.length === 0 ? <p className="clients-empty">No events in the next 30 days.</p> : null}
          {days.map(([key, list]) => (
            <section key={key} className="calendar-day">
              <h3>{dayLabel(key)}</h3>
              <ul>
                {list.map((e) => (
                  <li key={`${e.calendar}-${e.id}-${e.start}`}>
                    <time>{timeLabel(e)}</time>
                    <span className="calendar-title">
                      {e.link ? (
                        <a href={e.link} target="_blank" rel="noreferrer">
                          {e.title}
                        </a>
                      ) : (
                        e.title
                      )}
                      {e.location ? <small>{e.location}</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {phase === 'ready' && mode !== 'LIST' && !src ? (
        <div className="clients-empty calendar-setup">
          <strong>The Google embed is not configured.</strong>
          <p>
            Set <code>GOOGLE_CALENDAR_EMBED_URL</code> or <code>GOOGLE_CALENDAR_ID</code> on the crm project.
          </p>
        </div>
      ) : null}
      {phase === 'ready' && src ? (
        <div className="calendar-frame">
          <iframe title="Mahmoud’s Google Calendar" src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : null}
    </section>
  )
}
