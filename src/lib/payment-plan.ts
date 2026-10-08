const STANDARD_RATIOS = new Set([
  '90/10',
  '80/20',
  '70/30',
  '60/40',
  '50/50',
  '40/60',
  '30/70',
  '20/80',
  '10/90',
])

export const PAYMENT_BUCKET_ORDER = [
  'Post-handover plans',
  '90/10',
  '80/20',
  '70/30',
  '60/40',
  '50/50',
  '40/60',
  '30/70',
  '20/80',
  '10/90',
  'Other',
] as const

export interface PaymentClassification {
  label: string | null
  bucket: string | null
  postHandover: boolean
  notes: string | null
}

function slashRatios(text: string): number[][] {
  const found: number[][] = []
  for (const match of text.matchAll(/(\d{1,3}(?:\s*\/\s*\d{1,3})+)/g)) {
    const parts = match[1].split(/\s*\/\s*/).map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part) || part <= 0 || part > 100)) continue
    if (parts.reduce((sum, part) => sum + part, 0) !== 100) continue
    found.push(parts)
  }
  return found
}

function collapse(parts: number[]): string | null {
  if (parts.length === 2) return `${parts[0]}/${parts[1]}`
  const during = parts.slice(0, -1).reduce((sum, part) => sum + part, 0)
  const after = parts[parts.length - 1]
  if (during % 5 !== 0 || after % 5 !== 0) return null
  if (during < 10 || during > 90 || after < 10 || after > 90) return null
  return `${during}/${after}`
}

function hasPostHandover(text: string): boolean {
  return /post[-\s]?handover|\bPHPP\b/i.test(text)
}

function ratioFromPercents(text: string): string | null {
  const construction = text.match(/(\d{1,2})%\s*construction/i)
  const handover = text.match(/(\d{1,2})%\s*(?:on\s+)?handover/i)
  if (construction) {
    const during = Number(construction[1])
    const rest = 100 - during
    if (during >= 10 && during <= 90 && rest >= 10 && rest <= 90) return `${during}/${rest}`
  }
  if (handover) {
    const after = Number(handover[1])
    const during = 100 - after
    if (after >= 10 && after <= 90 && during >= 10 && during <= 90) return `${during}/${after}`
  }
  return null
}

export function classifyPayment(raw: string | null): PaymentClassification {
  const text = raw?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return { label: null, bucket: null, postHandover: false, notes: null }
  const postHandover = hasPostHandover(text)
  let ratio: string | null = null
  for (const parts of slashRatios(text)) {
    ratio = collapse(parts)
    if (ratio) break
  }
  if (!ratio) ratio = ratioFromPercents(text)
  let label: string | null
  let bucket: string | null
  if (ratio) {
    label = postHandover ? `${ratio} + post-handover` : ratio
    bucket = STANDARD_RATIOS.has(ratio) ? ratio : 'Other'
  } else if (postHandover) {
    label = 'Post-handover'
    bucket = null
  } else {
    label = 'Other'
    bucket = 'Other'
  }
  const notes = text.toLowerCase() === label.toLowerCase() ? null : text
  return { label, bucket, postHandover, notes }
}

export interface PaymentBucketCount {
  id: string
  label: string
  count: number
}

export function paymentBucketCounts(
  projects: { paymentBucket: string | null; postHandover: boolean }[],
): PaymentBucketCount[] {
  return PAYMENT_BUCKET_ORDER.map((id) => ({
    id,
    label: id,
    count:
      id === 'Post-handover plans'
        ? projects.filter((project) => project.postHandover).length
        : projects.filter((project) => project.paymentBucket === id).length,
  })).filter((bucket) => bucket.count > 0)
}
