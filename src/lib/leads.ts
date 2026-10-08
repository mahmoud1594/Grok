import { WHATSAPP_E164 } from './format'
import { whatsappDigits } from './phone'
import { readBearer } from './session'
import { BRAND } from './brand'

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'viewing', 'won', 'lost'] as const
export const LEAD_SOURCES = ['website_form', 'bitrix', 'whatsapp', 'whatsapp_broadcast', 'facebook', 'instagram', 'manual'] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type LeadSource = (typeof LEAD_SOURCES)[number]

export interface Lead {
  lead_id: string
  created_at: string
  source: string
  name: string
  phone: string
  email: string
  interest: string
  project_or_community: string
  budget_aed: string
  beds: string
  country_program: string
  message: string
  status: string
  owner: string
  next_action_date: string
  notes: string
  utm_source: string
  utm_campaign: string
  page_url: string
  consent: string
  bitrix_id: string
  deal_url: string
  updated_at: string
  comment: string
  wa_photo_url: string
  duplicate_count: number
  duplicate_ids: string[]
}

export type LeadPatch = Partial<Pick<Lead, 'name' | 'comment' | 'status' | 'owner' | 'next_action_date' | 'notes' | 'phone' | 'email' | 'interest' | 'project_or_community' | 'budget_aed' | 'beds'>>

export interface LeadsPayload {
  ok: boolean
  backend?: string
  cachedAt?: string
  count?: number
  rows?: number
  leads?: Lead[]
  error?: string
}

const FIELDS = [
  'lead_id', 'created_at', 'source', 'name', 'phone', 'email', 'interest', 'project_or_community',
  'budget_aed', 'beds', 'country_program', 'message', 'status', 'owner', 'next_action_date', 'notes',
  'utm_source', 'utm_campaign', 'page_url', 'consent', 'bitrix_id', 'deal_url', 'updated_at', 'comment', 'wa_photo_url',
] as const

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

export function asLead(raw: Partial<Lead> | Record<string, unknown>): Lead {
  const record = raw as Record<string, unknown>
  const lead = {} as Lead
  for (const field of FIELDS) lead[field] = text(record[field])
  const count = Number(record.duplicate_count)
  lead.duplicate_count = Number.isFinite(count) ? count : 0
  lead.duplicate_ids = Array.isArray(record.duplicate_ids) ? record.duplicate_ids.map((id) => String(id)) : []
  return lead
}

function authHeaders(): HeadersInit {
  const token = readBearer()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export class LeadsError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function fetchLeads(fresh = false): Promise<{ leads: Lead[]; cachedAt: string }> {
  const response = await fetch(fresh ? '/api/leads?fresh=1' : '/api/leads', {
    method: 'GET',
    credentials: 'same-origin',
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (response.status === 401) throw new LeadsError(401, 'unauthorized')
  if (!response.ok) throw new LeadsError(response.status, 'store_unavailable')
  const body = (await response.json()) as LeadsPayload
  if (!body.ok || !Array.isArray(body.leads)) throw new LeadsError(response.status, body.error || 'store_unavailable')
  return { leads: body.leads.map((lead) => asLead(lead)), cachedAt: body.cachedAt || new Date().toISOString() }
}

export async function deleteLead(id: string): Promise<void> {
  const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: authHeaders(),
  })
  if (response.status === 401) throw new LeadsError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!response.ok || !body.ok) throw new LeadsError(response.status, body.error || 'store_unavailable')
}

export async function scheduleFollowUp(input: {
  leadId: string
  date: string
  name: string
  project: string
}): Promise<{ ok: boolean; message?: string; via?: string }> {
  const response = await fetch('/api/calendar', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  })
  if (response.status === 401) throw new LeadsError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; via?: string }
  return { ok: Boolean(body.ok), message: body.message, via: body.via }
}

export async function patchLead(id: string, patch: LeadPatch): Promise<Lead> {
  const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  })
  if (response.status === 401) throw new LeadsError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; lead?: Lead; error?: string }
  if (!response.ok || !body.ok || !body.lead) throw new LeadsError(response.status, body.error || 'store_unavailable')
  return asLead(body.lead)
}

export function formatLeadPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length === 12) {
    return `+971 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  if (digits.startsWith('966') && digits.length === 12) {
    return `+966 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return digits ? `+${digits}` : ''
}

export function leadWhatsappHref(lead: Lead): string | null {
  const phone = whatsappDigits(lead.phone)
  if (!phone || phone === WHATSAPP_E164) return null
  const interest = lead.project_or_community.trim() || lead.interest.trim() || 'your enquiry'
  const line = lead.name.trim()
    ? `Hello ${lead.name.trim()}, this is ${BRAND} following up on ${interest}.`
    : `Hello, this is ${BRAND} following up on ${interest}.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(line)}`
}

export function leadLabel(value: string): string {
  if (value === 'website_form') return 'Website form'
  if (value === 'whatsapp_broadcast') return 'WA broadcast'
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Social contact stored by /api/broadcast-reply in page_url as "instagram:@handle" / "facebook:name" (no phone). */
export function socialHandle(lead: Pick<Lead, 'page_url'>): string {
  const v = String(lead.page_url || '')
  return /^(instagram|facebook):/.test(v) ? v : ''
}

export function leadMatches(lead: Lead, query: string, status: string, source: string): boolean {
  if (status && lead.status !== status) return false
  if (source && lead.source !== source) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return FIELDS.some((field) => lead[field].toLowerCase().includes(needle))
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Dubai',
  }).format(date)
}
