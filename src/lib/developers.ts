/** Mahmoud's 11 off-plan developers. Keep in sync with api/_lib/developers.js (scripts/news.test.mjs checks both). */
export const DEVELOPERS: { name: string; aliases: string[] }[] = [
  { name: 'Emaar', aliases: ['emaar', 'emaar properties', 'emaar development'] },
  { name: 'Palm Properties', aliases: ['palm properties', 'palm property'] },
  { name: 'H&H', aliases: ['h&h', 'h & h', 'h and h', 'h&h development', 'h&h developments', 'hh development'] },
  { name: 'Ellington', aliases: ['ellington', 'ellington properties'] },
  { name: 'Beyond', aliases: ['beyond', 'beyond developments', 'beyond by omniyat'] },
  { name: 'Omniyat', aliases: ['omniyat', 'omniyat group'] },
  { name: 'Al Habtoor', aliases: ['al habtoor', 'habtoor', 'al habtoor group', 'al habtoor properties'] },
  { name: 'Aldar', aliases: ['aldar', 'aldar properties'] },
  { name: 'Modon', aliases: ['modon', 'modon properties', 'modon holding'] },
  { name: 'Meraas', aliases: ['meraas', 'meraas and brookfield properties', 'meraas / brookfield', 'dubai holding meraas'] },
  { name: 'Nakheel', aliases: ['nakheel', 'nakheel properties'] },
]

export const DEVELOPER_NAMES = DEVELOPERS.map((developer) => developer.name)

function plain(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9&/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One of the 11 names, or the trimmed input when it is another developer. Empty stays empty. */
export function canonicalDeveloper(value: string | null | undefined): string {
  const text = plain(value)
  if (!text) return ''
  for (const developer of DEVELOPERS) {
    if (developer.aliases.includes(text)) return developer.name
  }
  const first = text.split(/\s+(?:and|\/)\s+|\s*\/\s*/)[0]
  for (const developer of DEVELOPERS) {
    if (developer.aliases.some((alias) => first === alias || first.startsWith(`${alias} `))) return developer.name
  }
  return String(value).trim()
}

export function isCoreDeveloper(name: string): boolean {
  return DEVELOPER_NAMES.includes(name)
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 1 && !['the', 'at', 'by', 'and', 'for', 'of', 'residences', 'tower', 'towers'].includes(word))
}

export function normalizedName(value: string): string {
  return tokens(value).join(' ')
}

/** Same developer (when both are known) and the shorter name's words all appear in the other. */
export function sameProject(
  a: { developer: string | null; name: string },
  b: { developer: string | null; name: string },
): boolean {
  const devA = canonicalDeveloper(a.developer)
  const devB = canonicalDeveloper(b.developer)
  if (devA && devB && devA.toLowerCase() !== devB.toLowerCase()) return false
  const left = tokens(a.name)
  const right = tokens(b.name)
  if (left.length === 0 || right.length === 0) return false
  if (left.join(' ') === right.join(' ')) return true
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  return short.join('').length >= 4 && short.every((word) => long.includes(word))
}

export function findProject<T extends { developer: string | null; name: string }>(
  projects: T[],
  developer: string | null,
  name: string,
): T | null {
  return projects.find((project) => sameProject(project, { developer, name })) ?? null
}
