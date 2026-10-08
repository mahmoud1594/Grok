import { useCallback, useEffect, useState, type FormEvent } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { useLogout } from './CrmLayout'
import { ApiError } from '../lib/news'
import { ownerDbStatus, ownerSearch, ownerSearchError, type OwnerResult } from '../lib/owner-search'
import { BrandMark } from '../lib/brand'

interface ListingsCheckViewProps {
  onTab: (tab: AppTab) => void
}

const dash = (value: string) => (value && value.trim() ? value : '—')

function waHref(phone: string): string | null {
  const first = phone.split(/[|,;/]/)[0] ?? ''
  let digits = first.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('05') && digits.length === 10) digits = `971${digits.slice(1)}`
  if (digits.startsWith('5') && digits.length === 9) digits = `971${digits}`
  return digits.length >= 9 ? `https://wa.me/${digits}` : null
}

export default function ListingsCheckView({ onTab }: ListingsCheckViewProps) {
  const logout = useLogout()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OwnerResult[] | null>(null)
  const [searched, setSearched] = useState('')
  const [badge, setBadge] = useState('Database')

  useEffect(() => {
    let cancelled = false
    ownerDbStatus()
      .then((status) => {
        if (cancelled) return
        setBadge(status.available ? (status.rows ? `${status.rows.toLocaleString('en-US')} records` : 'DB ready') : 'DB offline')
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) void logout()
        else if (!cancelled) setBadge('DB offline')
      })
    return () => {
      cancelled = true
    }
  }, [logout])

  const run = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      const q = query.trim()
      setError(null)
      setRows(null)
      if (q.length < 2) {
        setError('Type a name or phone number (at least 2 characters).')
        return
      }
      setBusy(true)
      try {
        const body = await ownerSearch(q, 100)
        if (!body.ok && !body.results.length) {
          setError(ownerSearchError(body.error))
          return
        }
        setSearched(body.query || q)
        setRows(body.results)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await logout()
          return
        }
        setError('Search request failed. Try again.')
      } finally {
        setBusy(false)
      }
    },
    [query, logout],
  )

  const units = rows ? rows.filter((row) => row.unit_number).length : 0
  const phones = rows ? new Set(rows.map((row) => row.owner_mobile).filter(Boolean)).size : 0

  return (
    <section className="clients-screen people-screen listings-check-screen" aria-label="Listings Check">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="listings" onTab={onTab} />
          <span className="live-stack">
            <span className="live-chip">Owner &amp; phone search</span>
            <span className="freshness">{badge}</span>
          </span>
        </div>
        <form className="search owner-search-form" onSubmit={run} role="search">
          <input
            type="search"
            inputMode="text"
            autoComplete="off"
            placeholder="Phone (+971 50…, 050…, 00971…) or owner name"
            value={query}
            aria-label="Owner phone or name"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="leads-refresh" disabled={busy}>
            {busy ? 'Searching…' : 'Search database'}
          </button>
        </form>
      </header>
      {error ? (
        <p className="clients-empty" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <p className="clients-empty">Searching the owner database…</p> : null}
      {rows && !busy ? (
        rows.length === 0 ? (
          <p className="clients-empty">No match in the owner database for “{searched}”.</p>
        ) : (
          <>
            <p className="owner-search-summary">
              <strong>{rows.length}</strong> match{rows.length === 1 ? '' : 'es'} · <strong>{units}</strong> unit{units === 1 ? '' : 's'} owned
              {phones ? ` · ${phones} phone${phones === 1 ? '' : 's'}` : ''} for “{searched}”
            </p>
            <div className="sheet-scroll">
              <table className="excel owner-results">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Unit</th>
                    <th>Community / tab</th>
                    <th>Land</th>
                    <th>Source file</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const place = row.cluster || row.building
                    const href = waHref(row.owner_mobile)
                    return (
                      <tr key={`${row.owner_mobile}-${row.unit_number}-${index}`}>
                        <td title={row.owner_name}>
                          <span className="excel-clip">{dash(row.owner_name)}</span>
                        </td>
                        <td className="owner-phone">
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer">
                              {row.owner_mobile}
                            </a>
                          ) : (
                            dash(row.owner_mobile)
                          )}
                        </td>
                        <td>{dash(row.unit_number)}</td>
                        <td title={place}>
                          <span className="excel-clip">{dash(place)}</span>
                        </td>
                        <td>{dash(row.land_no)}</td>
                        <td title={row.source_file}>
                          <span className="excel-clip">{dash(row.source_file)}</span>
                        </td>
                        <td>{dash(row.match_type)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : null}
      {!rows && !busy && !error ? (
        <p className="clients-empty">
          Type an owner’s phone number in any format (+971 50 123 4567, 00971…, 050-123-4567) or a name. Shows every matching unit in the owner database.
        </p>
      ) : null}
    </section>
  )
}
