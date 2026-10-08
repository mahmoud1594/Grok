import logoMap from '../data/developer-logos.json' with { type: 'json' }

interface LogoMap {
  byCard: Record<string, string>
  byDeveloper: Record<string, string>
}

const logos = logoMap as LogoMap

const SKIPPED_WORDS = new Set(['by', 'the', 'of', 'and', 'for', 'at'])

/** Asset prefix from the Vite base. The standalone app is served at `/`. */
export function assetRoot(_hostname?: string): string {
  const raw = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  if (!raw || raw === '/') return '/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

export function developerInitials(name: string): string {
  const words = name
    .split(/[\s/]+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter((word) => word.length > 0 && !SKIPPED_WORDS.has(word.toLowerCase()))
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

/** Slug of a baked logo file, or null when this project has no verified image. */
export function logoSlug(projectId: string, developer: string | null): string | null {
  const onCard = logos.byCard[projectId]
  if (onCard) return onCard
  if (developer && logos.byDeveloper[developer]) return logos.byDeveloper[developer]
  return null
}

export function logoUrl(slug: string, hostname: string): string {
  return `${assetRoot(hostname)}assets/developer-logos/${slug}.png`
}

export type DeveloperMarkKind = 'logo' | 'initials' | 'none'

export function developerMarkKind(projectId: string, developer: string | null): DeveloperMarkKind {
  if (logoSlug(projectId, developer)) return 'logo'
  if (developer && developerInitials(developer)) return 'initials'
  return 'none'
}
