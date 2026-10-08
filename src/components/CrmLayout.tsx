import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import App from '../App'
import { fetchSession, logoutRequest } from '../lib/session'
import { matchPath, navigate, pathForTab, redirectPath, tabFromMatch, type RouteMatch } from '../lib/routes'
import AppTabs, { CrmRail, SideMenu, type AppTab } from './AppTabs'
import LoginScreen from './LoginScreen'
import NoticeBell from './NoticeBell'
import { BRAND } from '../lib/brand'

type GateStatus = 'checking' | 'in' | 'out'

const LogoutContext = createContext<() => Promise<void>>(async () => {})

export function useLogout(): () => Promise<void> {
  return useContext(LogoutContext)
}

function readMatch(): RouteMatch {
  const next = redirectPath(window.location.pathname)
  return matchPath(next ?? window.location.pathname)
}

export default function CrmLayout() {
  const [status, setStatus] = useState<GateStatus>('checking')
  const [match, setMatch] = useState<RouteMatch>(readMatch)

  useEffect(() => {
    const sync = () => {
      const next = redirectPath(window.location.pathname)
      if (next) {
        navigate(next, 'replace')
        return
      }
      setMatch(matchPath(window.location.pathname))
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchSession().then((ok) => {
      if (!cancelled) setStatus(ok ? 'in' : 'out')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status === 'checking') return
    document.getElementById('boot')?.remove()
    document.title = status === 'out' ? BRAND : `${BRAND} — Premium Dubai Real Estate`
  }, [status])

  const logout = useCallback(async () => {
    await logoutRequest()
    setStatus('out')
  }, [])

  const onTab = useCallback((tab: AppTab) => {
    navigate(pathForTab(tab))
  }, [])

  let body: ReactNode = null
  if (status === 'out') {
    body = (
      <LoginScreen
        onSuccess={() => {
          setStatus('in')
          navigate(pathForTab('leads'), 'replace')
        }}
      />
    )
  }
  if (status === 'in') {
    body = (
      <LogoutContext.Provider value={logout}>
        <div className="crm-shell">
          <AppTabs placement="fab" tab={tabFromMatch(match)} onTab={onTab} />
          <CrmRail tab={tabFromMatch(match)} onTab={onTab} />
          <SideMenu tab={tabFromMatch(match)} onTab={onTab} />
          <div className="crm-main">
            <NoticeBell />
            <App match={match} onTab={onTab} />
          </div>
        </div>
      </LogoutContext.Provider>
    )
  }

  return body
}
