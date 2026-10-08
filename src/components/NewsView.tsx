import { useCallback, useEffect, useMemo, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { useLogout } from './CrmLayout'
import type { Project } from '../types'
import { DEVELOPER_NAMES, canonicalDeveloper, findProject, isCoreDeveloper } from '../lib/developers'
import {
  ApiError,
  fetchNews,
  formatStamp,
  inRange,
  isFresh,
  messageMatches,
  type NewsCard,
  type NewsMessage,
  type NewsRange,
} from '../lib/news'
import { formatClock } from '../lib/leads'
import { BrandMark } from '../lib/brand'

interface NewsViewProps {
  onTab: (tab: AppTab) => void
  projects: Project[]
}

type Phase = 'loading' | 'ready' | 'error'

interface BoardCard {
  key: string
  developer: string
  project: string
  community: string | null
  trelloUrl: string | null
  newLaunch: boolean
  lastAt: string
  messages: NewsMessage[]
  total: number
}

const RANGES: { id: NewsRange; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
]

const PREVIEW = 3
const UNKNOWN = 'Developer not stated'
const AREA_UNKNOWN = 'Area not set'

function areaOf(card: BoardCard): string {
  return card.community?.trim() || AREA_UNKNOWN
}

function developerOrder(name: string): number {
  const index = DEVELOPER_NAMES.indexOf(name)
  if (index >= 0) return index
  return name === UNKNOWN ? 999 : 100
}

function initialQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get('project') ?? ''
  } catch {
    return ''
  }
}

export default function NewsView({ onTab, projects }: NewsViewProps) {
  const logout = useLogout()
  const [phase, setPhase] = useState<Phase>('loading')
  const [cards, setCards] = useState<NewsCard[]>([])
  const [fetchedAt, setFetchedAt] = useState('')
  const [query, setQuery] = useState(initialQuery)
  const [developer, setDeveloper] = useState('')
  const [range, setRange] = useState<NewsRange>('any')
  const [day, setDay] = useState('')
  const [showQuiet, setShowQuiet] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const result = await fetchNews()
      setCards(result.cards)
      setFetchedAt(result.fetchedAt)
      setNow(Date.now())
      setPhase('ready')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout()
        return
      }
      setPhase((current) => (current === 'ready' ? 'ready' : 'error'))
    }
  }, [logout])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const board = useMemo(() => {
    const items: BoardCard[] = cards.map((card) => {
      const dev = canonicalDeveloper(card.developer) || UNKNOWN
      const match = findProject(projects, card.developer || null, card.project)
      return {
        key: card.key,
        developer: dev === UNKNOWN && match?.developer ? canonicalDeveloper(match.developer) : dev,
        project: card.project,
        community: match?.area || match?.community || null,
        trelloUrl: match?.trelloUrl ?? null,
        newLaunch: !match,
        lastAt: card.last_at,
        messages: card.messages,
        total: Math.max(card.count || 0, card.messages.length),
      }
    })
    if (showQuiet) {
      for (const project of projects) {
        const dev = canonicalDeveloper(project.developer)
        if (!isCoreDeveloper(dev)) continue
        if (items.some((item) => findProject([{ developer: item.developer, name: item.project }], dev, project.name))) continue
        items.push({
          key: `trello-${project.id}`,
          developer: dev,
          project: project.name,
          community: project.area || project.community,
          trelloUrl: project.trelloUrl,
          newLaunch: false,
          lastAt: '',
          messages: [],
          total: 0,
        })
      }
    }
    return items
  }, [cards, projects, showQuiet])

  const developers = useMemo(() => {
    const others = Array.from(new Set(board.map((card) => card.developer).filter((name) => !isCoreDeveloper(name))))
    return [...DEVELOPER_NAMES, ...others.sort((a, b) => developerOrder(a) - developerOrder(b) || a.localeCompare(b))]
  }, [board])

  const needle = query.trim().toLowerCase()
  const dated = range !== 'any' || Boolean(day)

  const visible = useMemo(() => {
    return board
      .filter((card) => !developer || card.developer === developer)
      .map((card) => {
        const inWindow = card.messages.filter((message) => inRange(message.timestamp, range, day, now))
        const cardHit = !needle || `${card.project} ${card.developer} ${card.community ?? ''}`.toLowerCase().includes(needle)
        const messages = cardHit ? inWindow : inWindow.filter((message) => messageMatches(message, needle))
        return { card, messages }
      })
      .filter(({ card, messages }) => {
        if (messages.length > 0) return true
        if (dated) return false
        if (!needle) return card.messages.length === 0
        return card.messages.length === 0 && `${card.project} ${card.developer}`.toLowerCase().includes(needle)
      })
  }, [board, developer, range, day, needle, dated, now])

  const filtersOn = Boolean(needle || developer || dated)

  const coveredAreas = useMemo(() => {
    const names = new Set<string>()
    for (const project of projects) {
      const area = (project.area || project.community || '').trim()
      if (area) names.add(area)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [projects])

  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const entry of visible) {
      const name = areaOf(entry.card)
      const list = map.get(name) ?? []
      list.push(entry)
      map.set(name, list)
    }
    const names = filtersOn ? [...map.keys()] : [...new Set([...coveredAreas, ...map.keys()])]
    const sortEntries = (entries: typeof visible) =>
      [...entries].sort((a, b) => {
        const left = a.messages[0]?.timestamp ?? ''
        const right = b.messages[0]?.timestamp ?? ''
        if (left !== right) return left < right ? 1 : -1
        return a.card.project.localeCompare(b.card.project)
      })
    return names
      .filter((name) => name !== AREA_UNKNOWN || (map.get(name)?.length ?? 0) > 0)
      .sort((a, b) => {
        if (a === AREA_UNKNOWN) return 1
        if (b === AREA_UNKNOWN) return -1
        return a.localeCompare(b)
      })
      .map((name) => ({ name, entries: sortEntries(map.get(name) ?? []) }))
  }, [visible, coveredAreas, filtersOn])

  const freshCount = visible.filter(({ card }) => card.messages.some((message) => isFresh(message.timestamp, now))).length

  return (
    <section className="clients-screen people-screen news-screen" aria-label="News">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="news" onTab={onTab} />
          <span className="live-stack">
            <span className="live-chip" title="Messages from Mahmoud’s developer WhatsApp groups. Sender numbers are never stored.">
              News · WhatsApp groups
            </span>
            {fetchedAt ? <span className="freshness">Checked {formatClock(fetchedAt)}</span> : null}
          </span>
        </div>
        <label className="search">
          <input
            type="search"
            placeholder="Search project, developer, group, or message"
            value={query}
            aria-label="Search news"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="sheet-filters">
          <label className="client-filter">
            Developer
            <select value={developer} onChange={(event) => setDeveloper(event.target.value)} aria-label="Developer">
              <option value="">All developers</option>
              {developers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="source-chips" role="group" aria-label="Date range">
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={range === item.id ? 'is-on' : ''}
                aria-pressed={range === item.id}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="client-filter news-day">
            Day
            <input type="date" value={day} aria-label="Messages on this day" onChange={(event) => setDay(event.target.value)} />
          </label>
          <label className="news-toggle">
            <input type="checkbox" checked={showQuiet} onChange={(event) => setShowQuiet(event.target.checked)} />
            Projects with no news
          </label>
          {filtersOn ? (
            <button
              type="button"
              className="leads-refresh"
              onClick={() => {
                setQuery('')
                setDeveloper('')
                setRange('any')
                setDay('')
              }}
            >
              Clear
            </button>
          ) : null}
          <button type="button" className="leads-refresh" onClick={() => void load()}>
            Refresh
          </button>
          <span className="count">
            {phase === 'ready' ? `${visible.length} card${visible.length === 1 ? '' : 's'}${freshCount ? ` · ${freshCount} new in 24h` : ''}` : ''}
          </span>
        </div>
      </header>
      <div className="news-boards" aria-label="Off-plan areas">
        {phase === 'loading' ? <p className="clients-empty">Loading news…</p> : null}
        {phase === 'error' ? (
          <p className="clients-empty">
            News could not be loaded.
            <button type="button" className="leads-retry" onClick={() => void load()}>
              Retry
            </button>
          </p>
        ) : null}
        {phase === 'ready' && groups.length === 0 ? (
          <p className="clients-empty">
            {board.length === 0
              ? 'No WhatsApp news yet. Messages appear here once the group reader posts them to /api/news.'
              : 'No news matches these filters.'}
          </p>
        ) : null}
        {groups.map((group) => (
          <section key={group.name} className="news-board" aria-label={group.name}>
            <header className="news-board-head">
              <h2>{group.name}</h2>
              <span>{group.entries.length}</span>
            </header>
            <div className="news-board-body">
              {group.entries.length === 0 ? <p className="news-quiet">No WhatsApp news for this area yet.</p> : null}
              {group.entries.map(({ card, messages }) => {
                const open = expanded.has(card.key)
                const shown = open ? messages : messages.slice(0, PREVIEW)
                const fresh = messages.some((message) => isFresh(message.timestamp, now))
                return (
                  <article key={card.key} className={fresh ? 'news-card is-fresh' : 'news-card'}>
                    <header className="news-card-head">
                      <div>
                        <h3>{card.project}</h3>
                        <p>{[card.developer === UNKNOWN ? null : card.developer, card.community].filter(Boolean).join(' · ') || UNKNOWN}</p>
                      </div>
                      <div className="news-badges">
                        {card.newLaunch ? <span className="tag launch">New launch</span> : null}
                        {fresh ? <span className="tag fresh">Last 24h</span> : null}
                      </div>
                    </header>
                    {shown.length === 0 ? <p className="news-quiet">No WhatsApp news for this project yet.</p> : null}
                    <ol className="news-comments">
                      {shown.map((message) => (
                        <NewsComment key={message.id} message={message} fresh={isFresh(message.timestamp, now)} />
                      ))}
                    </ol>
                    <footer className="news-card-foot">
                      {messages.length > PREVIEW ? (
                        <button
                          type="button"
                          className="news-more"
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current)
                              if (next.has(card.key)) next.delete(card.key)
                              else next.add(card.key)
                              return next
                            })
                          }
                        >
                          {open ? 'Show fewer' : `Show all ${messages.length} updates`}
                        </button>
                      ) : (
                        <span className="news-total">
                          {card.total === 0 ? '' : `${card.total} update${card.total === 1 ? '' : 's'}`}
                        </span>
                      )}
                      {card.trelloUrl ? (
                        <a className="deal-link" href={card.trelloUrl} target="_blank" rel="noreferrer">
                          Open in Trello
                        </a>
                      ) : null}
                    </footer>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

function NewsComment({ message, fresh }: { message: NewsMessage; fresh: boolean }) {
  const images = message.media.filter((item) => item.kind === 'image')
  const files = message.media.filter((item) => item.kind !== 'image')
  return (
    <li className={fresh ? 'news-comment is-fresh' : 'news-comment'}>
      <div className="news-meta">
        <time dateTime={message.timestamp}>{formatStamp(message.timestamp)}</time>
        {message.group ? <span className="news-group-name">{message.group}</span> : null}
        {message.sender ? <span className="news-sender">{message.sender}</span> : null}
      </div>
      {message.text ? <p className="news-text">{message.text}</p> : null}
      {images.length > 0 ? (
        <div className="news-images">
          {images.map((item) => (
            <a key={item.url} href={item.url} target="_blank" rel="noreferrer" title={item.name}>
              <img src={item.url} alt={item.name} loading="lazy" referrerPolicy="no-referrer" />
            </a>
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="news-files">
          {files.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.kind === 'video' ? 'Video' : 'File'} · {item.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
