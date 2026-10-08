import { readBearer } from './session'

export interface GrokSendResult {
  ok: true
  url: string
}

function headers(): HeadersInit {
  const token = readBearer()
  const base: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) base.Authorization = `Bearer ${token}`
  return base
}

export async function sendGrokTask(task: string): Promise<GrokSendResult> {
  const response = await fetch('/api/grok', {
    method: 'POST',
    credentials: 'same-origin',
    headers: headers(),
    body: JSON.stringify({ task }),
  })
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; url?: string }
  if (!response.ok || !body.ok || !body.url) {
    const error = new Error(body.error || 'grok_unavailable')
    throw error
  }
  return { ok: true, url: body.url }
}
