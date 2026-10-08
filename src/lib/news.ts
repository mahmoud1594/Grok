import { readBearer } from './session'

export interface NewsMedia {
  url: string
  kind: 'image' | 'video' | 'file'
  name: string
}

export interface NewsMessage {
  id: string
  key: string
  developer: string
  project: string
  group: string
  sender: string
  text: string
  media: NewsMedia[]
  timestamp: string
  received_at: string
}

export interface NewsCard {
  key: string
  developer: string
  project: string
  created_at: string
  last_at: string
  count: number
  messages: NewsMessage[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function authHeaders(): HeadersInit {
  const token = readBearer()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** GET a signed-in JSON endpoint. 401 is thrown as ApiError so the screen can sign out. */
export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (response.status === 401) throw new ApiError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string }
  if (!response.ok || body.ok === false) throw new ApiError(response.status, body.error || 'unavailable')
  return body
}

export async function fetchNews(): Promise<{ cards: NewsCard[]; fetchedAt: string }> {
  const body = await getJson<{ cards?: NewsCard[]; fetchedAt?: string }>('/api/news')
  return { cards: Array.isArray(body.cards) ? body.cards : [], fetchedAt: body.fetchedAt || new Date().toISOString() }
}

export const DAY_MS = 24 * 3600 * 1000

export function isFresh(iso: string, now = Date.now()): boolean {
  const time = Date.parse(iso)
  return Number.isFinite(time) && now - time < DAY_MS && time <= now + 60_000
}

const dubaiStamp = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Dubai',
})

const dubaiDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' })

export function formatStamp(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : dubaiStamp.format(date)
}

/** YYYY-MM-DD in Dubai, for the date filter. */
export function dubaiDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : dubaiDay.format(date)
}

export type NewsRange = 'any' | '24h' | '7d' | '30d'

export function inRange(iso: string, range: NewsRange, day: string, now = Date.now()): boolean {
  if (day && dubaiDate(iso) !== day) return false
  if (range === 'any') return true
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return false
  const span = range === '24h' ? DAY_MS : range === '7d' ? 7 * DAY_MS : 30 * DAY_MS
  return now - time < span
}

export function messageMatches(message: NewsMessage, needle: string): boolean {
  if (!needle) return true
  return [message.text, message.group, message.sender, ...message.media.map((item) => item.name)]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}
