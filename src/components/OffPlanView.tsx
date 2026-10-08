import { useEffect, useMemo, useState } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import UnitsSectionSwitch from './UnitsSectionSwitch'
import DeveloperMark from './DeveloperMark'
import type { Project } from '../types'
import { DEVELOPER_NAMES, canonicalDeveloper, findProject, isCoreDeveloper } from '../lib/developers'
import { floorCount, projectSetting, trelloNewLaunch, type Setting } from '../lib/offplan'
import { fetchNews, formatStamp, type NewsCard } from '../lib/news'
import { formatAed, formatRefreshLabel } from '../lib/format'
import { navigate, pathForRoute } from '../lib/routes'
import { BrandMark } from '../lib/brand'

interface OffPlanViewProps {
  onTab: (tab: AppTab) => void
  projects: Project[]
  exportedAt: string
}

interface OffPlanRow {
  id: string
  name: string
  developer: string
  rawDeveloper: string | null
  place: string | null
  setting: Setting | null
  floors: string | null
  newLaunch: boolean
  price: number | null
  handover: string | null
  type: string | null
  trelloUrl: string | null
  news: NewsCard | null
  fromNews: boolean
}

const SETTINGS: { id: '' | Setting; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'waterfront', label: 'Waterfront' },
  { id: 'inland', label: 'Inland' },
]

function openNews(project: string) {
  navigate(`${pathForRoute('news')}?project=${encodeURIComponent(project)}`)
}

export default function OffPlanView({ onTab, projects, exportedAt }: OffPlanViewProps) {
  const [query, setQuery] = useState('')
  const [developer, setDeveloper] = useState('')
  const [setting, setSetting] = useState<'' | Setting>('')
  const [launchOnly, setLaunchOnly] = useState(false)
  const [showOthers, setShowOthers] = useState(false)
  const [news, setNews] = useState<NewsCard[]>([])

  useEffect(() => {
    let cancelled = false
    fetchNews()
      .then((result) => {
        if (!cancelled) setNews(result.cards)
      })
      .catch(() => {
        /* the list still shows the Trello projects */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    const out: OffPlanRow[] = projects.map((project) => {
      const card = news.find((item) => findProject([project], item.developer || null, item.project)) ?? null
      const floors =
        floorCount(`${project.name}\n${project.notes}\n${project.unitsNote ?? ''}`) ??
        (card ? floorCount(card.messages.map((message) => message.text).join('\n')) : null)
      return {
        id: project.id,
        name: project.name,
        developer: canonicalDeveloper(project.developer) || 'Developer not on card',
        rawDeveloper: project.developer,
        place: project.area || project.community,
        setting: projectSetting(project),
        floors,
        newLaunch: trelloNewLaunch(project),
        price: project.startingPriceAed,
        handover: project.handover,
        type: project.propertyType,
        trelloUrl: project.trelloUrl || null,
        news: card,
        fromNews: false,
      }
    })
    for (const card of news) {
      if (findProject(projects, card.developer || null, card.project)) continue
      out.push({
        id: `news-${card.key}`,
        name: card.project,
        developer: canonicalDeveloper(card.developer) || 'Developer not stated',
        rawDeveloper: card.developer || null,
        place: null,
        setting: null,
        floors: floorCount(card.messages.map((message) => message.text).join('\n')),
        newLaunch: true,
        price: null,
        handover: null,
        type: null,
        trelloUrl: null,
        news: card,
        fromNews: true,
      })
    }
    return out
  }, [projects, news])

  const needle = query.trim().toLowerCase()
  const filtered = rows.filter((row) => {
    if (!showOthers && !developer && !isCoreDeveloper(row.developer)) return false
    if (developer && row.developer !== developer) return false
    if (setting && row.setting !== setting) return false
    if (launchOnly && !row.newLaunch) return false
    if (needle && !`${row.name} ${row.developer} ${row.place ?? ''} ${row.type ?? ''}`.toLowerCase().includes(needle)) return false
    return true
  })

  const otherDevelopers = Array.from(new Set(rows.map((row) => row.developer).filter((name) => !isCoreDeveloper(name)))).sort((a, b) =>
    a.localeCompare(b),
  )
  const otherCount = rows.filter((row) => !isCoreDeveloper(row.developer)).length
  const filtering = Boolean(needle || setting || launchOnly)
  const groupNames = developer
    ? [developer]
    : [...DEVELOPER_NAMES, ...(showOthers ? otherDevelopers : [])]
  const groups = groupNames
    .map((name) => ({ name, rows: filtered.filter((row) => row.developer === name).sort((a, b) => Number(b.newLaunch) - Number(a.newLaunch) || a.name.localeCompare(b.name)) }))
    .filter((group) => group.rows.length > 0 || (!filtering && isCoreDeveloper(group.name)))

  return (
    <section className="clients-screen people-screen offplan-screen" aria-label="Off-plan projects">
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
            <span className="live-chip" title="Off-plan projects from the Trello Dubai board, plus new launches first seen in WhatsApp news.">
              LIVE · Trello Dubai
            </span>
            <span className="freshness">Inventory · {formatRefreshLabel(exportedAt)}</span>
          </span>
        </div>
        <UnitsSectionSwitch section="offplan" />
        <label className="search">
          <input
            type="search"
            placeholder="Search project, developer, or community"
            value={query}
            aria-label="Search off-plan projects"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="sheet-filters">
          <label className="client-filter">
            Developer
            <select value={developer} onChange={(event) => setDeveloper(event.target.value)} aria-label="Developer">
              <option value="">Mahmoud’s 11 developers</option>
              {DEVELOPER_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {otherDevelopers.length > 0 ? (
                <optgroup label="Other developers">
                  {otherDevelopers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <div className="source-chips" role="group" aria-label="Waterfront or inland">
            {SETTINGS.map((item) => (
              <button
                key={item.id || 'all'}
                type="button"
                className={setting === item.id ? 'is-on' : ''}
                aria-pressed={setting === item.id}
                onClick={() => setSetting(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="news-toggle">
            <input type="checkbox" checked={launchOnly} onChange={(event) => setLaunchOnly(event.target.checked)} />
            New launches only
          </label>
          <label className="news-toggle">
            <input type="checkbox" checked={showOthers} onChange={(event) => setShowOthers(event.target.checked)} />
            Other developers ({otherCount})
          </label>
          <span className="count">
            {filtered.length} project{filtered.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>
      <div className="news-scroll">
        {groups.length === 0 ? <p className="clients-empty">No off-plan projects match these filters.</p> : null}
        {groups.map((group) => (
          <section key={group.name} className="news-group" aria-label={group.name}>
            <h2>
              {group.name}
              <span>{group.rows.length}</span>
            </h2>
            {group.rows.length === 0 ? (
              <p className="news-quiet offplan-none">No {group.name} projects on the Trello Dubai board yet.</p>
            ) : (
              <div className="news-grid offplan-grid">
                {group.rows.map((row) => (
                  <article key={row.id} className={row.newLaunch ? 'offplan-card is-launch' : 'offplan-card'}>
                    <header className="news-card-head">
                      <div className="title-with-mark">
                        {row.fromNews ? null : <DeveloperMark projectId={row.id} developer={row.rawDeveloper} />}
                        <div>
                          <h3>{row.name}</h3>
                          <p>{row.place ?? (row.fromNews ? 'First seen in WhatsApp news' : '—')}</p>
                        </div>
                      </div>
                      <div className="news-badges">
                        {row.newLaunch ? <span className="tag launch">New launch</span> : null}
                        {row.setting ? <span className={`tag ${row.setting}`}>{row.setting === 'waterfront' ? 'Waterfront' : 'Inland'}</span> : null}
                      </div>
                    </header>
                    <dl className="offplan-facts">
                      <dt>From</dt>
                      <dd>{row.price == null ? 'Not on card' : formatAed(row.price)}</dd>
                      <dt>Floors</dt>
                      <dd className={row.floors ? undefined : 'is-missing'}>{row.floors ?? 'Not on card'}</dd>
                      <dt>Handover</dt>
                      <dd className={row.handover ? undefined : 'is-missing'}>{row.handover ?? 'Not on card'}</dd>
                      <dt>Type</dt>
                      <dd className={row.type ? undefined : 'is-missing'}>{row.type ?? 'Not on card'}</dd>
                    </dl>
                    <footer className="news-card-foot">
                      {row.news ? (
                        <button type="button" className="news-more" onClick={() => openNews(row.name)}>
                          {row.news.count} news update{row.news.count === 1 ? '' : 's'} · {formatStamp(row.news.last_at)}
                        </button>
                      ) : (
                        <span className="news-total">No WhatsApp news yet</span>
                      )}
                      {row.trelloUrl ? (
                        <a className="deal-link" href={row.trelloUrl} target="_blank" rel="noreferrer">
                          Open in Trello
                        </a>
                      ) : null}
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}
