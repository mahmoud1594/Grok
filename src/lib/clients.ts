import { WHATSAPP_E164 } from './format'
import { whatsappDigits } from './phone'
import { readBearer } from './session'
import { BRAND } from './brand'

export interface Client {
  id: string
  date: string | null
  campaign: string | null
  interest: string | null
  phone: string | null
  project: string | null
  size: string | null
  layout: string | null
  ownerMatch: string | null
  comment: string | null
  lastMessage: string | null
  reminder: string | null
}

interface RawClient {
  Date?: string
  Campaign?: string
  'Reply / Interest'?: string
  Phone?: string
  Project?: string
  Size?: string
  'Layout (beds)'?: string
  'Owner DB match'?: string
  Comment?: string
  'Last message'?: string
  Reminder?: string
}

// v3 fix: client rows (names, phones) are NOT bundled. They are served to signed-in users by /api/clients.
const BROKERAGE_PHONE = WHATSAPP_E164

export const CLIENTS_SOURCE = 'Eazybe Broadcast Replies Tracker'
export const CLIENTS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1rVIy9tc-a1m-yUpoZcZ9TltdC5uIULUeCFNd5pnWFAg/edit'
export const CLIENTS_EXPORTED_AT = '2026-09-23'

function blank(value: string | undefined): string | null {
  const text = value?.trim() ?? ''
  return text ? text : null
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

function parseClient(raw: RawClient, index: number): Client {
  const phoneText = blank(raw.Phone)
  const phone = phoneText ? digitsOnly(phoneText) : null
  if (phone === BROKERAGE_PHONE) {
    throw new Error('A client row uses the brokerage WhatsApp number. Client chats must open the lead’s phone.')
  }
  return {
    id: phone || `reply-${index}`,
    date: blank(raw.Date),
    campaign: blank(raw.Campaign),
    interest: blank(raw['Reply / Interest']),
    phone,
    project: blank(raw.Project),
    size: blank(raw.Size),
    layout: blank(raw['Layout (beds)']),
    ownerMatch: blank(raw['Owner DB match']),
    comment: blank(raw.Comment),
    lastMessage: blank(raw['Last message']),
    reminder: blank(raw.Reminder),
  }
}

export async function fetchClients(): Promise<Client[]> {
  const token = readBearer()
  const response = await fetch('/api/clients', {
    method: 'GET',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load clients.' : `Clients failed (${response.status})`)
  const body = (await response.json()) as { clients?: RawClient[] }
  const rows = Array.isArray(body.clients) ? body.clients : []
  const out: Client[] = []
  rows.forEach((raw, index) => {
    try {
      out.push(parseClient(raw, index))
    } catch {
      /* skip a row that uses the brokerage number */
    }
  })
  return out
}

function distinct(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
}

export function clientCampaigns(clients: Client[]): string[] {
  return distinct(clients.map((client) => client.campaign))
}

export function clientInterests(clients: Client[]): string[] {
  return distinct(clients.map((client) => client.interest))
}

export function formatCampaignLabel(campaign: string): string {
  const text = campaign.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return campaign
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatClientPhone(phone: string): string {
  if (phone.startsWith('971') && phone.length === 12) {
    return `+971 ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`
  }
  if (phone.startsWith('966') && phone.length === 12) {
    return `+966 ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`
  }
  return `+${phone}`
}

export function clientWhatsappHref(client: Client): string | null {
  const phone = whatsappDigits(client.phone)
  if (!phone || phone === BROKERAGE_PHONE) return null
  const lines = [
    `Hello, this is ${BRAND} following up on ${client.project ?? 'your reply'}.`,
  ]
  if (client.lastMessage) lines.push(`You replied: ${client.lastMessage}`)
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
}

export function clientMatches(
  client: Client,
  query: string,
  campaign: string,
  interest: string,
): boolean {
  if (campaign && client.campaign !== campaign) return false
  if (interest && client.interest !== interest) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    client.phone,
    client.project,
    client.campaign,
    client.interest,
    client.size,
    client.layout,
    client.ownerMatch,
    client.comment,
    client.lastMessage,
    client.reminder,
    client.date,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}
