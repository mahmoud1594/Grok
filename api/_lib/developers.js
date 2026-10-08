// Mahmoud's 11 off-plan developers. Keep in sync with src/lib/developers.ts (scripts/news.test.mjs checks both).
export const DEVELOPERS = [
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
];

function plain(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9&/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One of the 11 names, or the trimmed input when it is another developer. Empty stays empty. */
export function canonicalDeveloper(value) {
  const text = plain(value);
  if (!text) return '';
  for (const developer of DEVELOPERS) {
    if (developer.aliases.includes(text)) return developer.name;
  }
  const first = text.split(/\s+(?:and|\/)\s+|\s*\/\s*/)[0];
  for (const developer of DEVELOPERS) {
    if (developer.aliases.some((alias) => first === alias || first.startsWith(`${alias} `))) return developer.name;
  }
  return String(value).trim();
}

export function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function projectKey(developer, project) {
  return `${slug(canonicalDeveloper(developer)) || 'unknown'}--${slug(project)}`;
}
