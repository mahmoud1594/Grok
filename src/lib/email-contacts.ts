import { readBearer } from './session'

/** One row of the EmailContacts tab, from the signed-in /api/leads?feed=email. */
export interface EmailContact {
  community: string
  building: string
  name: string
  phone: string
  email: string
  opened: string
  clicked: string
  unsubscribed: string
  bounced: string
  lastSent: string
}

export interface EmailUnsubscribe {
  email: string
  at: string
  reason: string
}

export interface ImportStats {
  received: number
  no_email: number
  duplicates: number
  written: number
  unique_emails: number
  no_phone: number
  unsubscribed: number
  communities: Record<string, number>
}

export type EmailStatus = '' | 'phone' | 'no-phone' | 'opened' | 'clicked' | 'not-opened' | 'unsubscribed' | 'bounced' | 'never-sent' | 'sendable'

export const EMAIL_STATUSES: { id: EmailStatus; label: string }[] = [
  { id: '', label: 'Everyone' },
  { id: 'sendable', label: 'OK to email' },
  { id: 'never-sent', label: 'Never sent' },
  { id: 'opened', label: 'Opened' },
  { id: 'clicked', label: 'Clicked' },
  { id: 'not-opened', label: 'Sent, not opened' },
  { id: 'unsubscribed', label: 'Unsubscribed' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'phone', label: 'Has phone' },
  { id: 'no-phone', label: 'No phone' },
]

export class EmailContactsError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  const token = readBearer()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const asContact = (r: unknown[]): EmailContact => {
  const s = (i: number) => String(r[i] ?? '')
  return { community: s(0), building: s(1), name: s(2), phone: s(3), email: s(4), opened: s(5), clicked: s(6), unsubscribed: s(7), bounced: s(8), lastSent: s(9) }
}

export async function fetchEmailContacts(fresh = false): Promise<{ contacts: EmailContact[]; unsubscribes: EmailUnsubscribe[]; exists: boolean; cachedAt: string }> {
  const response = await fetch(`/api/leads?feed=email${fresh ? '&fresh=1' : ''}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (response.status === 401) throw new EmailContactsError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[][]; unsubscribes?: EmailUnsubscribe[]; exists?: boolean; cachedAt?: string; error?: string }
  if (!response.ok || !body.ok || !Array.isArray(body.rows)) throw new EmailContactsError(response.status, body.error || 'store_unavailable')
  return {
    contacts: body.rows.map(asContact),
    unsubscribes: Array.isArray(body.unsubscribes) ? body.unsubscribes : [],
    exists: body.exists !== false,
    cachedAt: body.cachedAt || new Date().toISOString(),
  }
}

export async function importEmailContacts(columns: string[], rows: string[][], dryRun: boolean): Promise<ImportStats> {
  const response = await fetch('/api/leads?feed=email', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ columns, rows, dry_run: dryRun }),
  })
  if (response.status === 401) throw new EmailContactsError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; stats?: ImportStats; error?: string }
  if (!response.ok || !body.ok || !body.stats) throw new EmailContactsError(response.status, body.error || 'store_unavailable')
  return body.stats
}

export function matchesStatus(c: EmailContact, status: EmailStatus): boolean {
  switch (status) {
    case 'phone':
      return !!c.phone
    case 'no-phone':
      return !c.phone
    case 'opened':
      return !!c.opened
    case 'clicked':
      return !!c.clicked
    case 'not-opened':
      return !!c.lastSent && !c.opened && !c.clicked
    case 'unsubscribed':
      return !!c.unsubscribed
    case 'bounced':
      return !!c.bounced
    case 'never-sent':
      return !c.lastSent && !c.unsubscribed && !c.bounced
    case 'sendable':
      return !c.unsubscribed && !c.bounced
    default:
      return true
  }
}

export function matchesQuery(c: EmailContact, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 4 && c.phone.replace(/\D/g, '').includes(digits.replace(/^0+/, ''))) return true
  return `${c.name} ${c.email} ${c.building} ${c.community}`.toLowerCase().includes(q)
}

export interface Counts {
  total: number
  phone: number
  opened: number
  clicked: number
  unsubscribed: number
  bounced: number
}

export interface BuildingGroup {
  building: string
  contacts: EmailContact[]
  counts: Counts
}

export interface CommunityGroup {
  community: string
  buildings: BuildingGroup[]
  counts: Counts
}

const emptyCounts = (): Counts => ({ total: 0, phone: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0 })

function add(counts: Counts, c: EmailContact) {
  counts.total += 1
  if (c.phone) counts.phone += 1
  if (c.opened) counts.opened += 1
  if (c.clicked) counts.clicked += 1
  if (c.unsubscribed) counts.unsubscribed += 1
  if (c.bounced) counts.bounced += 1
}

/** Community → building groups, in the Sheet's order (already sorted by community, then building). */
export function groupContacts(contacts: EmailContact[]): CommunityGroup[] {
  const communities = new Map<string, CommunityGroup>()
  for (const c of contacts) {
    const ck = c.community || 'No community'
    let group = communities.get(ck)
    if (!group) {
      group = { community: ck, buildings: [], counts: emptyCounts() }
      communities.set(ck, group)
    }
    const bk = c.building || 'No building'
    let building = group.buildings[group.buildings.length - 1]
    if (!building || building.building !== bk) {
      building = group.buildings.find((b) => b.building === bk) ?? { building: bk, contacts: [], counts: emptyCounts() }
      if (!group.buildings.includes(building)) group.buildings.push(building)
    }
    building.contacts.push(c)
    add(building.counts, c)
    add(group.counts, c)
  }
  return [...communities.values()]
}

export function totals(contacts: EmailContact[]): Counts {
  const counts = emptyCounts()
  for (const c of contacts) add(counts, c)
  return counts
}

const risky = (v: string) => /^[=+\-@]/.test(v) && !/^\+\d{7,15}$/.test(v)
const csvCell = (v: string) => (/[",\n\r]/.test(v) || risky(v) ? `"${(risky(v) ? `'${v}` : v).replace(/"/g, '""')}"` : v)

/** CSV for the email tool (MailerLite import): unsubscribed and bounced rows are always left out. */
export function contactsCsv(contacts: EmailContact[]): string {
  const seen = new Set<string>()
  const lines = ['email,name,phone,community,building']
  for (const c of contacts) {
    if (c.unsubscribed || c.bounced || seen.has(c.email)) continue
    seen.add(c.email)
    lines.push([c.email, c.name, c.phone, c.community, c.building].map(csvCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
