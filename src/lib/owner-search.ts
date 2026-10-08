import { ApiError, authHeaders } from './news'

export interface OwnerResult {
  owner_name: string
  owner_mobile: string
  owner_email: string
  unit_number: string
  building: string
  cluster: string
  land_no: string
  source_file: string
  match_type: string
}

export interface OwnerSearchResponse {
  ok: boolean
  available?: boolean
  query?: string
  count?: number
  results: OwnerResult[]
  error?: string
}

/** Owner rows come from the signed-in /api/owner-search endpoint; nothing is in the bundle. */
export async function ownerSearch(query: string, limit = 100): Promise<OwnerSearchResponse> {
  const response = await fetch('/api/owner-search', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
    cache: 'no-store',
  })
  if (response.status === 401) throw new ApiError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({ ok: false, results: [] }))) as OwnerSearchResponse
  return { ...body, results: Array.isArray(body.results) ? body.results : [] }
}

export async function ownerDbStatus(): Promise<{ available: boolean; rows?: number }> {
  const response = await fetch('/api/owner-search', {
    method: 'GET',
    credentials: 'same-origin',
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (response.status === 401) throw new ApiError(401, 'unauthorized')
  const body = (await response.json().catch(() => ({}))) as { available?: boolean; rows?: number }
  return { available: !!body.available, rows: body.rows }
}

const ERRORS: Record<string, string> = {
  phone_too_short: 'Type at least 7 digits of the phone number.',
  query_too_short: 'Type a name or phone number (at least 2 characters).',
  owner_db_not_configured: 'The owner database is not connected on this deployment.',
  owner_search_failed: 'Search failed. Try again.',
}

export function ownerSearchError(code: string | undefined): string {
  return (code && ERRORS[code]) || 'Search failed. Try again.'
}
