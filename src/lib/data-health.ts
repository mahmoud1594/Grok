import { CLIENTS_EXPORTED_AT } from './clients'
import { INVENTORY_EXPORTED_AT } from './inventory'
import { UNITS_EXPORTED_AT } from './units'

export type HealthTone = 'green' | 'amber' | 'red' | 'unknown'

export interface HealthRow {
  id: string
  label: string
  exportedAt: string
  tone: HealthTone
  labelText: string
}

const dubaiDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Dubai',
})

const dubaiTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Dubai',
})

function toneFor(exportedAt: string, now: number): HealthTone {
  if (!exportedAt.trim()) return 'unknown'
  const time = Date.parse(exportedAt)
  if (Number.isNaN(time)) return 'unknown'
  const hours = (now - time) / 3_600_000
  if (hours < 24) return 'green'
  if (hours <= 72) return 'amber'
  return 'red'
}

/** Date, plus a clock only when the stamp actually includes a time. */
export function formatHealthStamp(iso: string): string {
  const trimmed = iso.trim()
  if (!trimmed) return 'unknown'
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const day = dubaiDate.format(date)
  if (!trimmed.includes('T')) return day
  return `${day} ${dubaiTime.format(date)}`
}

export function dataHealth(now = Date.now()): HealthRow[] {
  const feeds = [
    { id: 'trello', label: 'Trello pins', exportedAt: INVENTORY_EXPORTED_AT },
    { id: 'bitrix', label: 'Leads sheet', exportedAt: '' },
    { id: 'eazybe', label: 'Eazybe Clients', exportedAt: CLIENTS_EXPORTED_AT },
    { id: 'units', label: 'Secondary Units sheet', exportedAt: UNITS_EXPORTED_AT },
  ]
  return feeds.map((feed) => {
    const tone = toneFor(feed.exportedAt, now)
    return {
      ...feed,
      tone,
      labelText: formatHealthStamp(feed.exportedAt),
    }
  })
}
