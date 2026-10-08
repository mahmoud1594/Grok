import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { dataHealth } from '../lib/data-health'
import { loadIssues, setIssueStatus, type Issue } from '../lib/issues'
import { useLogout } from './CrmLayout'
import GrokTask from './GrokTask'
import { BrandMark } from '../lib/brand'
import { navOrder, subscribeNavOrder, type NavId } from '../lib/nav-order'

export type AppTab = 'map' | 'clients' | 'units' | 'secondary' | 'leads' | 'news' | 'calendar' | 'whatsapp' | 'listings' | 'email' | 'settings'

const ICONS: Record<AppTab | 'logout', ReactNode> = {
  leads: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14.2c1.6.6 2.7 2.2 3 4.8" />
    </>
  ),
  units: (
    <>
      <path d="M4 20V8.5L12 4l8 4.5V20" />
      <path d="M9 20v-5h6v5M3 20h18" />
      <path d="M9 10.5h.01M15 10.5h.01" />
    </>
  ),
  listings: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.6 14.6 20 20M8.5 10.5h4M10.5 8.5v4" />
    </>
  ),
  news: (
    <>
      <path d="M5 4.5h11.5V19a1.5 1.5 0 0 0 1.5 1.5H6.5A1.5 1.5 0 0 1 5 19z" />
      <path d="M16.5 9H19v10a1.5 1.5 0 0 1-3 0M8 8.5h5.5M8 12h5.5M8 15.5h3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.6 18.6z" />
      <path d="M9.2 8.6c.2 2.6 2.4 4.9 5.2 5.4l1-1.3-1.8-.9-.8.8a4.4 4.4 0 0 1-2.4-2.4l.8-.8-.9-1.8z" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  clients: (
    <>
      <path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  secondary: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  email: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7l7.5 6 7.5-6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M10.5 12H20M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
}

function MenuIcon({ name }: { name: AppTab | 'logout' }) {
  return (
    <span className="side-menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
    </span>
  )
}

const SECTIONS: { id: AppTab; label: string; detail: string }[] = [
  { id: 'leads', label: 'Leads', detail: 'Bitrix open deals' },
  { id: 'units', label: 'Units & Projects', detail: 'Secondary units and off-plan projects' },
  { id: 'listings', label: 'Listings Check', detail: 'Owner & phone search in the owner database' },
  { id: 'news', label: 'News', detail: 'WhatsApp project updates by developer' },
  { id: 'calendar', label: 'Calendar', detail: 'Mahmoud’s Google Calendar' },
  { id: 'whatsapp', label: 'WhatsApp', detail: 'WhatsApp Web and message a number' },
  { id: 'email', label: 'Email contacts', detail: 'Owner emails by community and building' },
  { id: 'map', label: 'Main map', detail: 'Trello Dubai off-plan pins' },
  { id: 'clients', label: 'Listing Farming', detail: 'Broadcast replies' },
  { id: 'secondary', label: 'Secondary', detail: 'Units sheet on its own map' },
  { id: 'settings', label: 'Settings', detail: 'Light or dark mode' },
]

function issueSubject(issue: Issue): string {
  return issue.record.name.trim() || issue.record.project.trim() || 'Untitled'
}

function useNavGroups(): { label: string; ids: NavId[] }[] {
  const order = useSyncExternalStore(subscribeNavOrder, navOrder, navOrder)
  return [
    { label: 'Desk', ids: order.desk },
    { label: 'Inventory', ids: order.inventory },
  ]
}

export function sectionById(id: AppTab) {
  const section = SECTIONS.find((item) => item.id === id)
  if (!section) throw new Error(`Unknown section ${id}`)
  return section
}

const DOCK_QUERY = '(min-width: 1100px)'

const menuListeners = new Set<() => void>()
let menuOpen = false

function emitMenu() {
  for (const listener of menuListeners) listener()
}

function subscribeMenu(listener: () => void) {
  menuListeners.add(listener)
  return () => {
    menuListeners.delete(listener)
  }
}

function canDock(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DOCK_QUERY).matches
}

function setMenuOpen(next: boolean) {
  if (menuOpen === next) return
  menuOpen = next
  emitMenu()
}

const RAIL_KEY = 'crm-rail-hidden'
const railListeners = new Set<() => void>()
let railHidden = false

function readRailHidden(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

function applyRailHidden(hidden: boolean) {
  document.documentElement.classList.toggle('rail-collapsed', hidden)
}

if (typeof document !== 'undefined') {
  railHidden = readRailHidden()
  applyRailHidden(railHidden)
}

function emitRail() {
  for (const listener of railListeners) listener()
}

function setRailHidden(next: boolean) {
  if (railHidden === next) return
  railHidden = next
  applyRailHidden(next)
  try {
    localStorage.setItem(RAIL_KEY, next ? '1' : '0')
  } catch {
    // Private mode: the menu still hides for this visit.
  }
  emitRail()
}

function subscribeRail(listener: () => void) {
  railListeners.add(listener)
  return () => {
    railListeners.delete(listener)
  }
}

function useRailHidden(): boolean {
  return useSyncExternalStore(subscribeRail, () => railHidden, () => false)
}

function subscribeDock(listener: () => void) {
  const query = window.matchMedia(DOCK_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

function useDockable(): boolean {
  return useSyncExternalStore(subscribeDock, canDock, () => false)
}

function useMenuOpen(): boolean {
  return useSyncExternalStore(subscribeMenu, () => menuOpen, () => false)
}

interface SideMenuProps {
  tab: AppTab
  onTab: (tab: AppTab) => void
}

export function SideMenu({ tab, onTab }: SideMenuProps) {
  const open = useMenuOpen()
  const docked = useDockable()
  const [issues, setIssues] = useState<Issue[]>([])
  const [signingOut, setSigningOut] = useState(false)
  const health = dataHealth()
  const logout = useLogout()
  // Always call this. A hook after the early return crashes the phone menu.
  const navGroups = useNavGroups()

  useEffect(() => {
    if (open) setIssues(loadIssues())
  }, [open, tab])

  useEffect(() => {
    if (!open || docked) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, docked])

  if (!open || docked) return null

  const close = () => setMenuOpen(false)
  const settings = sectionById('settings')

  return (
    <div className="side-menu-root">
      <button type="button" className="side-menu-backdrop" aria-label="Close menu" onClick={close} />
      <nav className="side-menu" role="dialog" aria-modal="true" aria-label="Sections">
        <header>
          <span className="brand">
            <BrandMark />
          </span>
          <button type="button" className="side-menu-close" aria-label="Close menu" onClick={close}>
            Close
          </button>
        </header>
        {navGroups.map((group) => (
          <div key={group.label} className="side-menu-group">
            <p>{group.label}</p>
            {group.ids.map((id) => {
              const section = sectionById(id)
              return (
                <button
                  key={section.id}
                  type="button"
                  className={tab === section.id ? 'side-menu-item on' : 'side-menu-item'}
                  aria-current={tab === section.id ? 'page' : undefined}
                  onClick={() => {
                    onTab(section.id)
                    close()
                  }}
                >
                  <MenuIcon name={section.id} />
                  <span className="side-menu-text">
                    <strong>{section.label}</strong>
                    <span>{section.detail}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
        <button
          type="button"
          className={tab === settings.id ? 'side-menu-item on' : 'side-menu-item'}
          aria-current={tab === settings.id ? 'page' : undefined}
          onClick={() => {
            onTab(settings.id)
            close()
          }}
        >
          <MenuIcon name={settings.id} />
          <span className="side-menu-text">
            <strong>{settings.label}</strong>
            <span>{settings.detail}</span>
          </span>
        </button>
        <GrokTask />
        <section className="issues-list" aria-label="Issues">
          <h2>Issues</h2>
          {issues.length === 0 ? <p>No tickets yet.</p> : null}
          <ul>
            {issues.map((issue) => (
              <li key={issue.id}>
                <strong>{`#${issue.id} ${issueSubject(issue)}, ${issue.field}`}</strong>
                {issue.what ? <span className="issue-note">{issue.what}</span> : null}
                <span className="issue-source">{issue.record.source}</span>
                <div className="issue-row-actions">
                  <span className={issue.status === 'fixed' ? 'tag approved' : 'tag priced'}>
                    {issue.status === 'fixed' ? 'Fixed' : 'Open'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIssues(setIssueStatus(issue.id, issue.status === 'open' ? 'fixed' : 'open'))}
                  >
                    {issue.status === 'open' ? 'Mark fixed' : 'Reopen'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <footer className="data-health" aria-label="Data health">
          <h2>Data health</h2>
          <ul>
            {health.map((row) => (
              <li key={row.id}>
                <span className={`health-dot ${row.tone}`} />
                <span>{row.label}</span>
                <time className={row.tone === 'unknown' ? 'is-unknown' : undefined}>{row.labelText}</time>
              </li>
            ))}
          </ul>
        </footer>
        <button
          type="button"
          className="side-menu-item side-menu-logout"
          disabled={signingOut}
          onClick={() => {
            if (signingOut) return
            setSigningOut(true)
            close()
            void logout()
          }}
        >
          <MenuIcon name="logout" />
          <span className="side-menu-text">
            <strong>Logout</strong>
            <span>{signingOut ? 'Signing out…' : 'End this session'}</span>
          </span>
        </button>
      </nav>
    </div>
  )
}

interface AppTabsProps {
  tab: AppTab
  onTab: (tab: AppTab) => void
  /** `fab` is the phone button, outside the frosted bars. `bar` sits in each screen header. */
  placement?: 'bar' | 'fab'
}

export default function AppTabs({ placement = 'bar' }: AppTabsProps) {
  const open = useMenuOpen()
  const docked = useDockable()
  const hidden = useRailHidden()

  return (
    <div className={placement === 'fab' ? 'crm-menu-fab' : 'burger'}>
      <button
        type="button"
        className={open && !docked ? 'burger-btn on' : 'burger-btn'}
        aria-label={docked ? 'Show menu' : open ? 'Close sections' : 'Open sections'}
        aria-expanded={docked ? !hidden : open}
        aria-haspopup={docked ? undefined : 'dialog'}
        onClick={() => {
          if (docked) setRailHidden(false)
          else setMenuOpen(!open)
        }}
      >
        <span />
        <span />
        <span />
      </button>
    </div>
  )
}

export function CrmRail({ tab, onTab }: AppTabsProps) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [issues, setIssues] = useState<Issue[]>([])
  const [signingOut, setSigningOut] = useState(false)
  const health = dataHealth()
  const logout = useLogout()
  const current = sectionById(tab)
  const settings = sectionById('settings')
  const navGroups = useNavGroups()

  useEffect(() => {
    if (toolsOpen) setIssues(loadIssues())
  }, [toolsOpen])

  return (
    <nav className="crm-rail" aria-label="Sections">
      <div className="crm-rail-brand">
        <div className="crm-rail-brand-row">
          <button type="button" className="rail-hide" aria-label="Hide menu" onClick={() => setRailHidden(true)}>
            <span />
            <span />
            <span />
          </button>
          <span className="brand">
            <BrandMark />
          </span>
        </div>
        <span className="crm-rail-here">{current.label}</span>
      </div>
      <div className="crm-rail-nav">
        {navGroups.map((group) => (
          <div key={group.label} className="crm-rail-group">
            <p>{group.label}</p>
            {group.ids.map((id) => {
              const section = sectionById(id)
              const on = tab === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  className={on ? 'rail-item on' : 'rail-item'}
                  aria-current={on ? 'page' : undefined}
                  title={section.detail}
                  onClick={() => onTab(section.id)}
                >
                  <MenuIcon name={section.id} />
                  <span>{section.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="crm-rail-foot">
        <button
          type="button"
          className={tab === settings.id ? 'rail-item on' : 'rail-item'}
          aria-current={tab === settings.id ? 'page' : undefined}
          title={settings.detail}
          onClick={() => onTab(settings.id)}
        >
          <MenuIcon name="settings" />
          <span>{settings.label}</span>
        </button>
        <button
          type="button"
          className={toolsOpen ? 'rail-item on' : 'rail-item'}
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((value) => !value)}
        >
          <span className="side-menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h12M8 12h12M8 18h12" />
              <path d="M4 6h.01M4 12h.01M4 18h.01" />
            </svg>
          </span>
          <span>Grok & issues</span>
        </button>
        {toolsOpen ? (
          <div className="rail-tools">
            <GrokTask />
            <section className="issues-list" aria-label="Issues">
              <h2>Issues</h2>
              {issues.length === 0 ? <p>No tickets yet.</p> : null}
              <ul>
                {issues.map((issue) => (
                  <li key={issue.id}>
                    <strong>{`#${issue.id} ${issueSubject(issue)}, ${issue.field}`}</strong>
                    {issue.what ? <span className="issue-note">{issue.what}</span> : null}
                    <span className="issue-source">{issue.record.source}</span>
                    <div className="issue-row-actions">
                      <span className={issue.status === 'fixed' ? 'tag approved' : 'tag priced'}>
                        {issue.status === 'fixed' ? 'Fixed' : 'Open'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIssues(setIssueStatus(issue.id, issue.status === 'open' ? 'fixed' : 'open'))}
                      >
                        {issue.status === 'open' ? 'Mark fixed' : 'Reopen'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
        <ul className="rail-health" aria-label="Data health">
          {health.map((row) => (
            <li key={row.id} title={row.labelText}>
              <span className={`health-dot ${row.tone}`} />
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="rail-item rail-logout"
          disabled={signingOut}
          onClick={() => {
            if (signingOut) return
            setSigningOut(true)
            void logout()
          }}
        >
          <MenuIcon name="logout" />
          <span>{signingOut ? 'Signing out…' : 'Logout'}</span>
        </button>
      </div>
    </nav>
  )
}
