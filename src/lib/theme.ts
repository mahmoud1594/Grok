// index.html applies the saved theme before the first paint (crm-theme-js); keep the two in step.
const KEY = 'crm-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export type CrmTheme = 'light' | 'dark' | 'system'

export function crmTheme(): CrmTheme {
  try {
    const saved = window.localStorage.getItem(KEY)
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  } catch {
    return 'light'
  }
}

export function resolvedCrmTheme(theme: CrmTheme = crmTheme()): 'light' | 'dark' {
  if (theme === 'system') return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  return theme
}

export function applyCrmTheme() {
  document.documentElement.dataset.theme = resolvedCrmTheme()
}

export function saveCrmTheme(theme: CrmTheme) {
  try {
    window.localStorage.setItem(KEY, theme)
  } catch {
    // Private mode: the theme still applies for this visit.
  }
  applyCrmTheme()
}

export function followSystemTheme() {
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (crmTheme() === 'system') applyCrmTheme()
  })
}
