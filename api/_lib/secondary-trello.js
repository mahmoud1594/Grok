// Server-side reader for the Trello "Secondary" board (MGYdwKGJ).
// Returns only safe card fields. Card descriptions, comments, checklists and custom fields are never read or returned:
// they hold seller, fee and phone details.

export const SECONDARY_BOARD = 'MGYdwKGJ';
export const SECONDARY_BOARD_URL = 'https://trello.com/b/MGYdwKGJ/secondary';
/** Off-plan developer lists on the same board. They belong to the off-plan map, not Secondary. */
export const DEVELOPER_LISTS = ['Emaar', 'Beyond', 'Nakheel', 'Meraas', 'H&H', 'Sobha', 'Imtiaz', 'Ellington', 'Omniyat', 'Al Habtoor', 'Aldar'];
const DEV = new Set(DEVELOPER_LISTS.map((name) => name.trim().toLowerCase()));
const SOLD_RE = /^sold\b/i;
const TIMEOUT_MS = 8000;
/** Villa collections seen on Mahmoud's secondary cards (The Oasis and neighbours). Longest first. */
export const KNOWN_TYPES = [
  'Palace Ostra', 'Palace Villas', 'Address Villas', 'Ostra', 'Tierra', 'Palmiera', 'Mirage', 'Lavita', 'Elora',
  'Palma', 'Saheel', 'Alvorada', 'Casa', 'Mirador', 'Rasha', 'Yasmin', 'Lila', 'Bliss', 'Joy', 'Sun', 'Elan',
];

export function isDeveloperList(name) {
  return DEV.has(String(name || '').trim().toLowerCase());
}

export function isSoldList(name) {
  return SOLD_RE.test(String(name || '').trim());
}

/** "V-92 Tierra -6BD-20K plot" -> { unitCode: 'V-92', unitType: 'Tierra', bedrooms: 6 } */
export function parseTitle(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  const out = { unitCode: null, unitType: null, bedrooms: null };
  const code = text.match(/^([A-Za-z]{1,3})[-\s]?(\d{1,5}[A-Za-z]?)\b/);
  let rest = text;
  if (code && /\d/.test(code[2])) {
    out.unitCode = `${code[1].toUpperCase()}-${code[2].toUpperCase()}`;
    rest = text.slice(code[0].length);
  }
  const beds = text.match(/(\d{1,2})\s*-?\s*(?:bd|br|bhk|bed(?:room)?s?)\b/i);
  if (beds) out.bedrooms = Number(beds[1]);
  if (out.unitCode) {
    // Only known villa collections count as a type. Other words after the code are often a seller's first name.
    const type = rest
      .replace(/^[\s\-–—:|]+/, '')
      .split(/\s*[-–—|]\s*|\s+(?=\d)/)[0]
      .trim();
    const known = KNOWN_TYPES.find((t) => type && type.toLowerCase().startsWith(t.toLowerCase()));
    out.unitType = known || null;
  }
  return out;
}

function inDubai(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 24.6 && lat < 25.5 && lng > 54.8 && lng < 55.8;
}

/** Coordinates from a Google Maps URL or a plain "25.1, 55.2" pair. */
export function coordsFromText(value) {
  const text = String(value || '');
  const patterns = [
    /@(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,
    /!3d(-?\d{1,2}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/,
    /[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d{3,})(?:,|%2C)\s*(-?\d{1,3}\.\d{3,})/i,
    /(?:^|[\s(])(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})(?:$|[\s)])/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (inDubai(lat, lng)) return { lat, lng };
  }
  return null;
}

function isMapsUrl(url) {
  return /^https:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(String(url || ''));
}

function authHeader(key, token) {
  return `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`;
}

async function trelloGet(path, params, creds) {
  const url = new URL(`https://api.trello.com/1${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader(creds.key, creds.token), Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`trello_${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveShortMapsLink(url) {
  if (!/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
    return coordsFromText(res.headers.get('location') || '');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function trelloCreds() {
  const key = String(process.env.TRELLO_KEY || '').trim();
  const token = String(process.env.TRELLO_TOKEN || '').trim();
  return key && token ? { key, token } : null;
}

/** Map one raw Trello card to the public shape. Never touches card.desc. */
export function shapeCard(card, listName, extra = {}) {
  const sold = isSoldList(listName) || (card.labels || []).some((l) => /^sold$/i.test(String(l.name || '').trim()));
  const parsed = parseTitle(card.name);
  const attachments = Array.isArray(card.attachments) ? card.attachments : [];
  const cover = card.idAttachmentCover ? attachments.find((a) => a.id === card.idAttachmentCover) : null;
  const coverIsImage = cover && (!cover.mimeType || /^image\//i.test(cover.mimeType));
  const publicCover = card.cover && card.cover.sharedSourceUrl && /^https:\/\//.test(card.cover.sharedSourceUrl) ? card.cover.sharedSourceUrl : null;
  const titlePoint = coordsFromText(card.name);
  const point = titlePoint || extra.point || null;
  const pointSource = titlePoint ? 'title' : point ? extra.pointSource || 'maps-link' : null;
  return {
    id: card.id,
    title: String(card.name || '').trim(),
    unitCode: parsed.unitCode,
    unitType: parsed.unitType,
    bedrooms: parsed.bedrooms,
    listName,
    community: sold ? extra.previousList || null : listName,
    sold,
    url: card.shortUrl || card.url || null,
    labels: (card.labels || []).filter((l) => l && (l.name || l.color)).map((l) => ({ name: String(l.name || ''), color: l.color || null })),
    coverUrl: publicCover || (coverIsImage ? `/api/secondary?cover=${encodeURIComponent(card.id)}` : null),
    lat: point ? point.lat : null,
    lng: point ? point.lng : null,
    pointSource,
    position: Number(card.pos) || 0,
    lastActivityAt: card.dateLastActivity || null,
  };
}

/** Full board read: open lists, open cards, minus developer lists. */
export async function readSecondaryBoard(creds) {
  const [board, lists, cards] = await Promise.all([
    trelloGet(`/boards/${SECONDARY_BOARD}`, { fields: 'name,shortUrl,url' }, creds),
    trelloGet(`/boards/${SECONDARY_BOARD}/lists`, { filter: 'open', fields: 'name,pos' }, creds),
    trelloGet(
      `/boards/${SECONDARY_BOARD}/cards`,
      {
        filter: 'open',
        fields: 'name,idList,shortUrl,url,labels,pos,idAttachmentCover,cover,dateLastActivity',
        attachments: 'true',
        attachment_fields: 'name,url,mimeType,isUpload',
      },
      creds,
    ),
  ]);
  const listName = new Map(lists.map((l) => [l.id, String(l.name || '').trim()]));
  const kept = lists.filter((l) => !isDeveloperList(l.name));
  const keptIds = new Set(kept.map((l) => l.id));
  const rows = cards.filter((c) => keptIds.has(c.idList));

  const out = [];
  for (const card of rows) {
    const name = listName.get(card.idList) || '';
    const extra = {};
    // Link attachments (not uploads) that point at Google Maps can carry a position.
    for (const att of card.attachments || []) {
      if (att.isUpload || !isMapsUrl(att.url)) continue;
      const point = coordsFromText(att.url) || (await resolveShortMapsLink(att.url));
      if (point) {
        extra.point = point;
        extra.pointSource = 'maps-link';
        break;
      }
    }
    if (isSoldList(name)) {
      // Where did the card live before SOLD? One small call per sold card.
      try {
        const actions = await trelloGet(`/cards/${card.id}/actions`, { filter: 'updateCard:idList,moveCardToBoard', fields: 'type,data,date', limit: '30' }, creds);
        const moved = actions.find((a) => a && a.data && a.data.listAfter && isSoldList(a.data.listAfter.name) && a.data.listBefore);
        let before = moved ? String(moved.data.listBefore.name || '').trim() : '';
        if (!before) {
          // Card came from another board (e.g. the old per-community "The Oasis" board): use that board's name.
          const boardMove = actions.find((a) => a && a.type === 'moveCardToBoard' && a.data && a.data.boardSource && a.data.boardSource.id);
          if (boardMove) {
            const src = await trelloGet(`/boards/${boardMove.data.boardSource.id}`, { fields: 'name' }, creds).catch(() => null);
            before = src && src.name ? String(src.name).trim() : '';
          }
        }
        if (before && !isSoldList(before) && !isDeveloperList(before) && before.toLowerCase() !== 'secondary') extra.previousList = before;
      } catch {
        /* unknown community; card is listed but not pinned */
      }
    }
    out.push(shapeCard(card, name, extra));
  }
  out.sort((a, b) => a.position - b.position);
  return {
    board: { id: SECONDARY_BOARD, name: board.name || 'Secondary', url: board.shortUrl || board.url || SECONDARY_BOARD_URL },
    lists: kept.map((l) => ({ name: String(l.name || '').trim(), sold: isSoldList(l.name), count: rows.filter((c) => c.idList === l.id).length })),
    excludedLists: lists.filter((l) => isDeveloperList(l.name)).map((l) => String(l.name || '').trim()),
    cards: out,
  };
}

/** Bytes of a card's cover image (smallest preview at least 300px wide). Only for non-developer cards. */
export async function readCoverImage(cardId, creds) {
  if (!/^[a-f0-9]{24}$/i.test(String(cardId || ''))) return { status: 400 };
  const card = await trelloGet(`/cards/${cardId}`, { fields: 'idBoard,idList,idAttachmentCover', list: 'true', list_fields: 'name' }, creds);
  if (!card || !card.idAttachmentCover) return { status: 404 };
  const board = await trelloGet(`/boards/${card.idBoard}`, { fields: 'shortLink' }, creds);
  if (board.shortLink !== SECONDARY_BOARD) return { status: 404 };
  if (card.list && isDeveloperList(card.list.name)) return { status: 404 };
  const att = await trelloGet(`/cards/${cardId}/attachments/${card.idAttachmentCover}`, { fields: 'url,mimeType,previews,isUpload' }, creds);
  if (att.mimeType && !/^image\//i.test(att.mimeType)) return { status: 404 };
  const previews = (att.previews || []).filter((p) => p && p.url).sort((a, b) => a.width - b.width);
  const pick = previews.find((p) => p.width >= 300) || previews[previews.length - 1];
  const src = pick ? pick.url : att.url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(src, { headers: { Authorization: authHeader(creds.key, creds.token) }, signal: ctrl.signal });
    if (!res.ok) return { status: 502 };
    const type = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//i.test(type)) return { status: 404 };
    return { status: 200, type, body: Buffer.from(await res.arrayBuffer()) };
  } finally {
    clearTimeout(timer);
  }
}
