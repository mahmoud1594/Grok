import { useState, type FormEvent } from 'react'
import { loginRequest } from '../lib/session'
import { BrandMark } from '../lib/brand'

interface LoginScreenProps {
  onSuccess: () => void
}

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const result = await loginRequest(username.trim(), password)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSuccess()
  }

  return (
    <main className="login-screen" aria-label="Sign in">
      <div className="portal">
        <h1 className="login-brand">
          <BrandMark />
        </h1>
        <p className="portal-sub">Sign in to the Map CRM.</p>
        <form className="login-card" onSubmit={(event) => void onSubmit(event)} aria-busy={loading}>
          <label className="login-field">
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
