const BEARER_KEY = 'mdxb_listing_check_bearer'

export function readBearer(): string | null {
  try {
    const value = sessionStorage.getItem(BEARER_KEY)
    return value && value.trim() ? value : null
  } catch {
    return null
  }
}

export function storeBearer(token: string | null): void {
  try {
    if (token && token.trim()) sessionStorage.setItem(BEARER_KEY, token)
    else sessionStorage.removeItem(BEARER_KEY)
  } catch {
    /* private mode */
  }
}

function authHeaders(): HeadersInit {
  const token = readBearer()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchSession(): Promise<boolean> {
  try {
    const response = await fetch('/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; token?: string }
    if (!response.ok || body.ok === false) {
      return { ok: false, error: body.error || 'Invalid username or password' }
    }
    if (body.token) storeBearer(body.token)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach sign-in. Try again.' }
  }
}

export async function logoutRequest(): Promise<void> {
  const headers = authHeaders()
  storeBearer(null)
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
      headers,
    })
  } catch {
    /* the screen still returns to sign-in */
  }
}
