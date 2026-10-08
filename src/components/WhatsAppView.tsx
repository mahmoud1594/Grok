import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import AppTabs, { type AppTab } from './AppTabs'
import { useLogout } from './CrmLayout'
import { ApiError, getJson } from '../lib/news'
import { whatsappDigits } from '../lib/phone'
import WhatsAppIcon from './WhatsAppIcon'
import { BrandMark, brandText } from '../lib/brand'
import {
  EXTENSION_ZIP,
  WA_WEB_HOME,
  defaultWaMode,
  hasEmbedExtension,
  openWhatsAppWeb,
  saveWaMode,
  toWhatsAppWeb,
  waFrameColorScheme,
  waTheme,
  type WaOpenMode,
} from '../lib/whatsapp-web'
import { resolvedCrmTheme } from '../lib/theme'

interface WhatsAppViewProps {
  onTab: (tab: AppTab) => void
}

interface QuickLink {
  id: string
  name: string
  note: string
  href: string
  developer?: string
}

type OpenChat = (event: MouseEvent<HTMLAnchorElement>, href: string) => void

function LinkGrid({ links, empty, onOpen }: { links: QuickLink[]; empty: string; onOpen: OpenChat }) {
  if (links.length === 0) return <p className="wa-empty">{empty}</p>
  return (
    <div className="wa-grid">
      {links.map((link) => (
        <a key={link.id} className="wa-button" href={link.href} target="_blank" rel="noreferrer" onClick={(event) => onOpen(event, link.href)}>
          <WhatsAppIcon className="wa-glyph" />
          <span>
            <strong>{brandText(link.name)}</strong>
            {link.note || link.developer ? <small>{[link.developer, link.note].filter(Boolean).join(' · ')}</small> : null}
          </span>
        </a>
      ))}
    </div>
  )
}

function ModeSwitch({ mode, onChange }: { mode: WaOpenMode; onChange: (mode: WaOpenMode) => void }) {
  return (
    <div className="wa-mode" role="radiogroup" aria-label="Open chats in">
      <button type="button" role="radio" aria-checked={mode === 'web'} className={mode === 'web' ? 'active' : ''} onClick={() => onChange('web')}>
        WhatsApp Web
      </button>
      <button type="button" role="radio" aria-checked={mode === 'app'} className={mode === 'app' ? 'active' : ''} onClick={() => onChange('app')}>
        Phone app
      </button>
    </div>
  )
}

export default function WhatsAppView({ onTab }: WhatsAppViewProps) {
  const logout = useLogout()
  const [groups, setGroups] = useState<QuickLink[]>([])
  const [contacts, setContacts] = useState<QuickLink[]>([])
  const [linksPhase, setLinksPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [number, setNumber] = useState('')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<WaOpenMode>(defaultWaMode)
  const [webWindow, setWebWindow] = useState<Window | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [embedded] = useState(hasEmbedExtension)
  const inline = embedded
  const [theme] = useState(waTheme)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const numberRef = useRef<HTMLInputElement>(null)
  const numberTouchedAt = useRef(0)
  const frameReports = useRef(false)
  const framePointerAt = useRef(0)

  useEffect(() => {
    const onMessage = (event: globalThis.MessageEvent) => {
      if (event.origin !== 'https://web.whatsapp.com' || event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { source?: string; type?: string } | null
      if (data?.source !== 'askmontaser-wa') return
      frameReports.current = true
      if (data.type === 'pointerdown') framePointerAt.current = Date.now()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const touchNumber = () => {
    numberTouchedAt.current = Date.now()
  }

  // WhatsApp Web focuses its own search or compose box as it loads and on its timers, which pulls
  // focus out of this box. Extension 1.1+ reports real clicks inside WhatsApp; older installs fall
  // back to treating a focus move soon after the user used this box as WhatsApp's doing.
  const keepNumberFocus = () => {
    window.setTimeout(() => {
      if (document.activeElement !== frameRef.current) return
      const userClickedFrame = Date.now() - framePointerAt.current < 1000
      const stolen = frameReports.current ? !userClickedFrame : Date.now() - numberTouchedAt.current < 1500
      if (stolen) numberRef.current?.focus()
    }, 150)
  }

  useEffect(() => {
    if (!webWindow) return
    const timer = window.setInterval(() => {
      if (webWindow.closed) setWebWindow(null)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [webWindow])

  const launchWeb = useCallback((href: string = WA_WEB_HOME) => {
    const win = openWhatsAppWeb(href)
    setBlocked(!win)
    if (win) setWebWindow(win)
    return Boolean(win)
  }, [])

  const openChat = useCallback<OpenChat>(
    (event, href) => {
      if (mode !== 'web' || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      if (!launchWeb(href)) window.open(href, '_blank', 'noopener')
    },
    [mode, launchWeb],
  )

  const chooseMode = (next: WaOpenMode) => {
    setMode(next)
    saveWaMode(next)
  }

  useEffect(() => {
    if (inline) return
    let cancelled = false
    getJson<{ groups?: QuickLink[]; contacts?: QuickLink[] }>('/api/whatsapp-links')
      .then((body) => {
        if (cancelled) return
        setGroups(body.groups ?? [])
        setContacts(body.contacts ?? [])
        setLinksPhase('ready')
      })
      .catch(async (error) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          await logout()
          return
        }
        setLinksPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [inline, logout])

  const digits = whatsappDigits(number)
  const directHref = digits ? `https://wa.me/${digits}${text.trim() ? `?text=${encodeURIComponent(text.trim())}` : ''}` : null

  return (
    <section className="clients-screen people-screen wa-screen" aria-label="WhatsApp">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="whatsapp" onTab={onTab} />
          <span className="live-stack">
            <span className="live-chip">WhatsApp</span>
            <span className="freshness">
              {inline ? 'WhatsApp Web is inside the CRM' : mode === 'app' ? 'Chats open in the WhatsApp app' : 'Chats open in your linked WhatsApp Web window'}
            </span>
          </span>
        </div>
        {inline ? (
          <form
            className="wa-head-actions"
            onSubmit={(event) => {
              event.preventDefault()
              if (!digits || !frameRef.current) return
              numberRef.current?.blur()
              frameRef.current.src = toWhatsAppWeb(`https://wa.me/${digits}`)
              setNumber('')
            }}
          >
            <input
              ref={numberRef}
              className="wa-head-number"
              type="text"
              inputMode="tel"
              name="wa-chat-number"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              placeholder="Message a number, e.g. 050 123 4567"
              aria-label="Phone number to message"
              value={number}
              onPointerDown={touchNumber}
              onFocus={touchNumber}
              onKeyDown={touchNumber}
              onBlur={keepNumberFocus}
              onChange={(event) => setNumber(event.target.value)}
            />
            <button type="submit" className="btn whatsapp wa-head-send" disabled={!digits}>
              Message
            </button>
          </form>
        ) : null}
      </header>
      {inline ? (
        <div className="wa-full">
          <div className="wa-embed">
            <iframe
              ref={frameRef}
              src={WA_WEB_HOME}
              style={{ colorScheme: waFrameColorScheme(theme, resolvedCrmTheme()) }}
              title="WhatsApp Web"
              allow="clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      ) : (
        <div className="wa-scroll">
          <section className="wa-section wa-web" aria-label="WhatsApp Web">
            <div className="wa-section-head">
              <h2>WhatsApp Web</h2>
              <ModeSwitch mode={mode} onChange={chooseMode} />
            </div>
            <div className="wa-web-body">
              <ol className="wa-steps">
                <li>
                  Click <strong>Open WhatsApp Web</strong>. It opens docked on the right of your screen with the QR code.
                </li>
                <li>
                  On your phone open WhatsApp, then <strong>Settings → Linked devices → Link a device</strong>, and scan the QR.
                </li>
                <li>Done. It stays linked in this browser. Eazybe, if you use it, works in that window too.</li>
              </ol>
              <div className="wa-web-actions">
                <button type="button" className="btn whatsapp wa-web-open" onClick={() => launchWeb()}>
                  <WhatsAppIcon className="wa-web-icon" />
                  {webWindow ? 'Show WhatsApp Web' : 'Open WhatsApp Web'}
                </button>
                <small className={`wa-web-status${webWindow ? ' on' : ''}`}>
                  {blocked
                    ? 'Your browser blocked the window. Allow pop-ups for this site, then click again.'
                    : webWindow
                      ? 'WhatsApp Web window is open'
                      : 'WhatsApp Web window is closed'}
                </small>
              </div>
            </div>
            {!embedded && mode === 'web' ? (
              <details className="wa-install">
                <summary>Show WhatsApp Web inside the CRM instead (one-time setup, Chrome or Edge on a computer)</summary>
                <ol className="wa-steps">
                  <li>
                    <a href={EXTENSION_ZIP} download>
                      Download the Ask MonTaser WhatsApp extension
                    </a>{' '}
                    and unzip it.
                  </li>
                  <li>
                    Open <code>chrome://extensions</code> (or <code>edge://extensions</code>), turn on <strong>Developer mode</strong>,
                    click <strong>Load unpacked</strong> and pick the unzipped folder.
                  </li>
                  <li>Reload this page. WhatsApp Web then fills this tab with its QR code.</li>
                </ol>
              </details>
            ) : null}
          </section>
          <section className="wa-section" aria-label="Groups">
            <h2>Groups</h2>
            {linksPhase === 'loading' ? <p className="wa-empty">Loading saved links…</p> : null}
            {linksPhase === 'error' ? <p className="wa-empty">Saved links could not be loaded.</p> : null}
            {linksPhase === 'ready' ? (
              <LinkGrid links={groups} onOpen={openChat} empty="No groups saved yet. Add invite links to api/_lib/whatsapp-links.json." />
            ) : null}
          </section>
          <section className="wa-section" aria-label="Contacts">
            <h2>Contacts</h2>
            {linksPhase === 'ready' ? (
              <LinkGrid links={contacts} onOpen={openChat} empty="No contacts saved yet. Add them to api/_lib/whatsapp-links.json." />
            ) : null}
          </section>
          <section className="wa-section" aria-label="Message a number">
            <h2>Message a number</h2>
            <form
              className="wa-direct"
              onSubmit={(event) => {
                event.preventDefault()
                if (!directHref) return
                if (mode === 'web' && launchWeb(directHref)) return
                window.open(directHref, '_blank', 'noopener')
              }}
            >
              <input
                type="tel"
                inputMode="tel"
                placeholder="+971 50 123 4567"
                aria-label="Phone number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
              <input
                type="text"
                placeholder="Message (optional)"
                aria-label="Message"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <button type="submit" className="btn whatsapp" disabled={!directHref}>
                Open chat
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
