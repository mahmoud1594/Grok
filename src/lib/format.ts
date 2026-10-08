import type { Bedroom, Project, SourceLayer } from '../types'
import { BRAND } from './brand'

export const MISSING = '—'

export function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString('en-US')}`
}

export function formatAedOrMissing(amount: number | null): string {
  return amount == null ? MISSING : formatAed(amount)
}

export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = Math.round((amount / 1_000_000) * 100) / 100
    return `${millions}M`
  }
  return `${Math.round(amount / 1000)}K`
}

export function formatBedroom(bedroom: Bedroom): string {
  if (bedroom === 'studio') return 'Studio'
  if (bedroom === 4) return '4+ BR'
  return `${bedroom} BR`
}

export function formatBedrooms(bedrooms: Bedroom[]): string {
  if (bedrooms.length === 0) return MISSING
  return bedrooms.map(formatBedroom).join(', ')
}

export function formatOrDash(value: string | null | undefined): string {
  return value && value.trim() ? value : MISSING
}

export interface ProjectFact {
  label: string
  value: string
  missing: boolean
}

export function projectFacts(project: Project): ProjectFact[] {
  const rows: { label: string; value: string | null }[] = [
    { label: 'Developer', value: project.developer },
    { label: 'Community', value: project.community },
    { label: 'Starting price', value: project.startingPriceAed == null ? null : formatAed(project.startingPriceAed) },
    { label: 'Bedrooms', value: project.bedrooms.length === 0 ? null : formatBedrooms(project.bedrooms) },
    { label: 'Size', value: project.sizes },
    { label: 'Payment plan', value: project.paymentPlan },
    { label: 'Handover', value: project.handover },
    { label: 'Service charge', value: project.serviceCharge },
  ]
  return rows.map((row) => ({
    label: row.label,
    value: row.value && row.value.trim() ? row.value : MISSING,
    missing: !row.value || !row.value.trim(),
  }))
}

export function sourceLabel(source: SourceLayer): string {
  if (source === 'our_listings') return 'Our listing'
  if (source === 'competitor_launches') return 'Competitor launch'
  return 'Market project'
}

export function pricePresenceLabel(amount: number | null): string {
  return amount == null ? 'Price not stated' : 'Price on card'
}

export const WHATSAPP_E164 = '971542000142'
export const WHATSAPP_DISPLAY = '+971 54 200 0142'

export function formatRefreshLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  }).format(date)
}

export function bookingHref(project: Project): string {
  const lines = [
    `Hello ${BRAND}, I would like to book a viewing.`,
    `Project: ${project.name}`,
    `Community: ${project.community}`,
    `Developer: ${project.developer ?? MISSING}`,
    `From: ${formatAedOrMissing(project.startingPriceAed)}`,
  ]
  if (project.trelloUrl) lines.push(project.trelloUrl)
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(lines.join('\n'))}`
}

export function whatsappHref(project: Project): string {
  const lines = [
    `${project.name} — ${project.community}`,
    `Developer: ${project.developer ?? MISSING}`,
    `From: ${formatAedOrMissing(project.startingPriceAed)}`,
  ]
  if (project.bedrooms.length > 0) lines.push(`Beds: ${formatBedrooms(project.bedrooms)}`)
  if (project.paymentPlan) lines.push(`Payment: ${project.paymentPlan}`)
  if (project.handover) lines.push(`Handover: ${project.handover}`)
  if (project.unitsNote) lines.push(`Units: ${project.unitsNote}`)
  if (project.trelloUrl) lines.push(project.trelloUrl)
  lines.push(`Sent from ${BRAND} · Trello Dubai inventory`)
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(lines.join('\n'))}`
}
