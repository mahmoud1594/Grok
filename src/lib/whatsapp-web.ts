export const WA_WEB_HOME = 'https://web.whatsapp.com/'
// Every chat reuses this one named window, so the QR is scanned once and stays linked in this browser.
const WA_WINDOW_NAME = 'askmontaser-whatsapp-web'
const MODE_KEY = 'wa-open-in'
export const EXTENSION_ZIP = '/whatsapp-crm-extension.zip'

export type WaOpenMode = 'web' | 'app'

export function defaultWaMode(): WaOpenMode {
  if (typeof window === 'undefined') return 'app'
  const saved = window.localStorage.getItem(MODE_KEY)
  if (saved === 'web' || saved === 'app') return saved
  const desktop = window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 900
  return desktop ? 'web' : 'app'
}

// Set by the Ask MonTaser WhatsApp extension (extension/content.js), which lets web.whatsapp.com load in a CRM iframe.
export function hasEmbedExtension(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.waEmbed === '1'
}

export function saveWaMode(mode: WaOpenMode) {
  window.localStorage.setItem(MODE_KEY, mode)
}

const THEME_KEY = 'wa-theme'

export type WaTheme = 'crm' | 'light' | 'dark'

export function waTheme(): WaTheme {
  if (typeof window === 'undefined') return 'crm'
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'crm'
}

export function saveWaTheme(theme: WaTheme) {
  window.localStorage.setItem(THEME_KEY, theme)
}

// The embedded WhatsApp Web reads prefers-color-scheme from the iframe's color-scheme, so this picks
// its theme while WhatsApp's own Theme setting is "System default". It applies when the frame loads.
export function waFrameColorScheme(theme: WaTheme, crm: 'light' | 'dark'): 'light' | 'dark' {
  return theme === 'crm' ? crm : theme
}

// wa.me and chat.whatsapp.com links reload the app on phones; WhatsApp Web has its own routes for the same actions.
export function toWhatsAppWeb(href: string): string {
  try {
    const url = new URL(href)
    if (url.hostname === 'web.whatsapp.com') return url.href
    if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') {
      const phone = url.hostname === 'wa.me' ? url.pathname.replace(/\D/g, '') : (url.searchParams.get('phone') ?? '').replace(/\D/g, '')
      if (!phone) return WA_WEB_HOME
      const out = new URL('https://web.whatsapp.com/send')
      out.searchParams.set('phone', phone)
      const text = url.searchParams.get('text')
      if (text) out.searchParams.set('text', text)
      return out.href
    }
    if (url.hostname === 'chat.whatsapp.com') {
      const code = url.pathname.split('/').filter(Boolean)[0]
      return code ? `https://web.whatsapp.com/accept?code=${encodeURIComponent(code)}` : WA_WEB_HOME
    }
  } catch {
    /* not a URL */
  }
  return WA_WEB_HOME
}

function dockFeatures(): string {
  const screenLeft = (window.screen as Screen & { availLeft?: number }).availLeft ?? 0
  const screenTop = (window.screen as Screen & { availTop?: number }).availTop ?? 0
  const width = Math.round(Math.min(960, Math.max(560, window.screen.availWidth * 0.45)))
  const height = window.screen.availHeight
  const left = screenLeft + window.screen.availWidth - width
  return `popup=yes,width=${width},height=${height},left=${left},top=${screenTop}`
}

export function openWhatsAppWeb(href: string = WA_WEB_HOME): Window | null {
  const win = window.open(toWhatsAppWeb(href), WA_WINDOW_NAME, dockFeatures())
  win?.focus()
  return win
}
