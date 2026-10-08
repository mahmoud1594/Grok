import type { AppTab } from '../components/AppTabs'

export type RouteId = AppTab | 'secondary-community' | 'offplan'

export interface RouteParams {
  communitySlug?: string
}

export interface RouteMatch {
  id: RouteId
  params: RouteParams
}

export interface ChildRoute {
  id: RouteId
  /** Path under the shell layout. A segment starting with `:` is a param. */
  pattern: string
}

/**
 * One layout, `shell`, owns the auth guard and the signed-in app.
 * Add a child here when a new page should sit inside that guard.
 */
export const LAYOUT_ID = 'shell'

export const SHELL_CHILDREN: ChildRoute[] = [
  { id: 'leads', pattern: '/' },
  { id: 'map', pattern: '/map' },
  { id: 'clients', pattern: '/clients' },
  { id: 'units', pattern: '/units' },
  { id: 'offplan', pattern: '/units/off-plan' },
  { id: 'leads', pattern: '/leads' },
  { id: 'secondary', pattern: '/secondary' },
  { id: 'secondary-community', pattern: '/secondary/:communitySlug' },
  { id: 'news', pattern: '/news' },
  { id: 'calendar', pattern: '/calendar' },
  { id: 'whatsapp', pattern: '/whatsapp' },
  { id: 'listings', pattern: '/listings-check' },
  { id: 'email', pattern: '/email' },
  { id: 'settings', pattern: '/settings' },
]

interface Segment {
  kind: 'static' | 'param'
  value: string
}

interface CompiledRoute {
  id: RouteId
  segments: Segment[]
  staticCount: number
}

function basePath(): string {
  const raw = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  if (raw === '/' || raw === '') return ''
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

export function normalizePath(pathname: string): string {
  let path = pathname || '/'
  const base = basePath()
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length) || '/'
  path = path.replace(/\/index\.html$/, '')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path || '/'
}

/** Old /crm links on this host land on the Owner Portal or Leads. */
export function redirectPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  if (path === '/crm') return '/'
  return null
}

function compile(route: ChildRoute): CompiledRoute {
  const parts = route.pattern === '/' ? [] : route.pattern.replace(/^\//, '').split('/')
  const segments = parts.map((part) =>
    part.startsWith(':')
      ? { kind: 'param' as const, value: part.slice(1) }
      : { kind: 'static' as const, value: part },
  )
  return {
    id: route.id,
    segments,
    staticCount: segments.filter((segment) => segment.kind === 'static').length,
  }
}

const COMPILED = SHELL_CHILDREN.map(compile).sort(
  (a, b) => b.segments.length - a.segments.length || b.staticCount - a.staticCount,
)

export function matchPath(pathname: string): RouteMatch {
  const path = normalizePath(pathname)
  const parts = path === '/' ? [] : path.slice(1).split('/')
  for (const route of COMPILED) {
    if (route.segments.length !== parts.length) continue
    const params: RouteParams = {}
    let matched = true
    for (let index = 0; index < parts.length; index += 1) {
      const segment = route.segments[index]
      const value = parts[index]
      if (segment.kind === 'static') {
        if (segment.value !== value) {
          matched = false
          break
        }
      } else if (!value) {
        matched = false
        break
      } else {
        params[segment.value as keyof RouteParams] = decodeURIComponent(value)
      }
    }
    if (matched) return { id: route.id, params }
  }
  return { id: 'leads', params: {} }
}

export function pathForTab(tab: AppTab): string {
  const child = SHELL_CHILDREN.find((route) => route.id === tab)
  const pattern = child?.pattern ?? '/'
  const base = basePath()
  if (pattern === '/') return base || '/'
  return `${base}${pattern}`
}

export function pathForCommunity(slug: string): string {
  const base = basePath()
  return `${base}/secondary/${encodeURIComponent(slug)}`
}

export function pathForRoute(id: RouteId): string {
  const child = SHELL_CHILDREN.find((route) => route.id === id && !route.pattern.includes(':'))
  const base = basePath()
  if (!child || child.pattern === '/') return base || '/'
  return `${base}${child.pattern}`
}

export function tabFromMatch(match: RouteMatch): AppTab {
  if (match.id === 'secondary-community') return 'secondary'
  if (match.id === 'offplan') return 'units'
  return match.id
}

export function navigate(path: string, mode: 'push' | 'replace' = 'push'): void {
  if (window.location.pathname === path) return
  const state = {}
  if (mode === 'replace') window.history.replaceState(state, '', path)
  else window.history.pushState(state, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
