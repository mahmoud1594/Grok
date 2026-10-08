# MahmoudDXB — Premium Dubai Real Estate

Agents working in this repo must follow [AGENTS.md](AGENTS.md).

Phase 1 map for Mahmoud’s off-plan advisory. Desktop-first, English, full-viewport map of Dubai. Pins come from the Trello board **Dubai** ([trello.com/b/HdegR3Aa/dubai](https://trello.com/b/HdegR3Aa/dubai)). The toolbar badge reads **LIVE · Trello Dubai**.

The browser never holds a Trello key. Refresh goes through a server endpoint or a Node script. The committed JSON is the bootstrap cache, so the app still builds when those secrets are absent.

## Run

```bash
npm install && npm run dev
```

Open http://localhost:5173/ . Vite `base` is `/`. Dev and preview also serve `/api/login`, `/api/session`, and `/api/logout`. A legacy `/crm/` build is `CRM_BASE=/crm/ npx vite build`.

After `npx vite build`, `node scripts/serve-standalone.mjs` serves `dist` and the auth functions together (port 4173). Set `LISTING_CHECK_USER`, `LISTING_CHECK_PASS`, and `LISTING_CHECK_SECRET` first, or the functions use the same defaults as www when those are unset.

The standalone site is **https://crm.askmontaser.ae** (the only CRM URL: crm.mahmouddxb.com and map-crm-sooty.vercel.app redirect there, except the bot webhooks `/api/news`, `/api/broadcast-reply`, `/api/email-events`). Signed out, `/` is the Owner Portal. Signed in, `/` is Leads. The shell also serves `/map`, `/clients`, `/units`, `/units/off-plan`, `/leads`, `/news`, `/calendar`, `/whatsapp`, `/secondary`, and `/secondary/:communitySlug`. `/crm` redirects to `/`. See `README-DEPLOY.md`.

`npm run dev` also serves `/api/leads`, `/api/news`, `/api/calendar`, and `/api/whatsapp-links` with the same handlers Vercel runs. Without store credentials, Leads and News use their mock backends.

```bash
npx vite build
```

Do not use `npm run build` to pack a deploy. That script refreshes protected JSON.

## Sign-in

The map has its own login screen. On load it calls same-origin `GET /api/session`. The form posts to `POST /api/login`. Logout in the burger menu posts to `POST /api/logout`. Nothing redirects to www.mahmouddxb.com.

`api/login.js`, `api/session.js`, and `api/logout.js` use `LISTING_CHECK_USER`, `LISTING_CHECK_PASS`, and `LISTING_CHECK_SECRET`, the same names as www. The session cookie is `Domain=.askmontaser.ae` or `Domain=.mahmouddxb.com` only when the request host is that domain or a subdomain. Other hosts get a host-only cookie. Flags stay `HttpOnly`, `Secure`, and `SameSite=Lax`. A `Bearer` token still authenticates `/api/session`.

## Inventory source

The map reads `src/data/trello-dubai.json`, a snapshot of the Dubai board only. `src/lib/inventory.ts` turns those cards into pins. `src/data/projects.ts` re-exports the parsed list.

Rules the parser follows:

- A pin is a card whose list is an area (Meydan, Business Bay, Downtown, Dubai South, and the other community lists).
- Cards on the list **WHAT IS THE UPDATE** are skipped. Those are toolkit and news notes, not projects.
- Abu Dhabi, RAK, and Oasis boards are not in this file.
- Developer, starting price, layouts, bedrooms, handover, and unit notes are taken from the title and description when the card states them. Empty fields stay empty. The UI shows **Not on card**.
- Community is the Trello list name.
- A `Lat/Lng:` line on a card is the pin. Otherwise a published community point is used when the card or the project name identifies one (OpenStreetMap). Cards that only say “Other inland” or “Other waterfront” stay in a tight cluster on that list. Pins are not scattered across Dubai, and they are not plot coordinates. Connector lines between pins are not drawn.
- **Secondary** is its own map of `src/data/units.json`. A listing is pinned only when its community or project name matches a coordinate already verified for the off-plan map or the secondary communities. Rows with no match stay in **Not on map**. No coordinates, owners, or communities are invented.
- Portal coordinates override a community guess. A project with no portal pin stays in the list and is not given a map pin.
- On a narrow screen the map keeps search, Street, and Satellite visible. Draw, list, and filters sit behind **Tools**. Layers starts collapsed.
- Each project card keeps its Trello URL (**Open in Trello**).

### How to refresh

The toolbar shows **Inventory from Trello Dubai** and the export date (`exportedAt`, Asia/Dubai). **Refresh** on the map asks the server to pull the Dubai board. The browser posts to `/api/inventory/refresh` and never sees `TRELLO_KEY` or `TRELLO_TOKEN`.

Set the credentials on the machine that runs Node. Do not prefix them with `VITE_`. Do not commit them.

1. Create a key at [trello.com/power-ups/admin](https://trello.com/power-ups/admin).
2. Authorize read access (replace `YOUR_KEY`):
   `https://trello.com/1/authorize?expiration=30days&name=MahmoudDXB&scope=read&response_type=token&key=YOUR_KEY`
3. Put both values in the shell, or in a gitignored `.env` next to `package.json`:

```bash
TRELLO_KEY=your_key
TRELLO_TOKEN=your_token
```

Then either:

```bash
npm run refresh-inventory
```

or start `npm run dev` / `npm run preview` and press **Refresh**. Both paths use `server/trello-inventory.mjs`. A successful pull rewrites `src/data/trello-dubai.json` and returns the cards. The map re-parses that payload with `src/lib/inventory.ts`. The list **WHAT IS THE UPDATE** stays off the map.

If the key or token is missing, the script exits with setup steps and the endpoint returns HTTP 503 with the same steps. Neither writes a file and neither invents cards. The map keeps the last saved JSON.

`npm run build` does not need the secrets. The zip is static and contains no Trello key. Rewriting `src/data/trello-dubai.json` happens from `npm run refresh-inventory` on a writable checkout. That script reads only `TRELLO_KEY` and `TRELLO_TOKEN`. Without them it prints setup steps and does not invent cards. The deployed app does not include an unauthenticated `api/inventory/refresh.js`.

You can also replace `src/data/trello-dubai.json` with a **user-trello MCP** export of board `HdegR3Aa`, or any JSON that has `board`, `boardUrl`, `exportedAt`, and `cards` with `listName`, `name`, `desc`, `url`, and `labels`. Extra fields are kept. The parser still skips **WHAT IS THE UPDATE** when those cards are in the file. It does not invent cards. A price that did not scale, or a pin outside Dubai, throws when the file is loaded.

The file in this branch is the MCP live pull from 2026-09-23 (`exportedAt` `2026-09-23T16:48:50.778716+04:00`, `boardLastActivityAt` `2026-09-21T11:55:25.876Z`): 96 open cards, 9 on **WHAT IS THE UPDATE** (not stored as pins), 87 map pins.

## Clients

The **Clients** tab lists people who replied to WhatsApp campaigns. Signed-in users load those rows from `GET /api/clients`. The rows are not in the JavaScript bundle. `src/data/broadcast-replies.json` keeps the sheet metadata and an empty `clients` array. Real names and phones are not committed. Set `CLIENTS_JSON` to a JSON array of sheet-shaped objects (Date, Campaign, Reply / Interest, Phone, Project, Size, Layout (beds), Owner DB match, Comment, Last message, Reminder) when the tab should show replies. The tracker sheet is the [Eazybe Broadcast Replies Tracker](https://docs.google.com/spreadsheets/d/1rVIy9tc-a1m-yUpoZcZ9TltdC5uIULUeCFNd5pnWFAg/edit).

`src/lib/clients.ts` turns the API rows into cards. The browser does not call Google Sheets. Empty cells stay empty and the card says **Not on sheet**.

Each card’s WhatsApp button opens `wa.me` with **that client’s phone**, and a short follow-up that names the project. Map project cards still message +971 54 200 0142.

The Clients badge shows **LIVE · Eazybe replies** and the export date. `npm run refresh-clients` can still rewrite `src/data/broadcast-replies.json` when `GOOGLE_SHEETS_API_KEY` or `GOOGLE_ACCESS_TOKEN` is set. Do not commit that file once it contains real replies.

## Leads

The **Leads** tab is separate from Clients. Signed-in users load rows from `GET /api/leads`, which reads the private Leads sheet. Outside production, a missing sheet configuration uses the demo seed in `api/_lib/leads-seed.json`. The browser does not call Bitrix or Google Sheets. Empty cells say **Not on sheet**. A card’s WhatsApp button uses that lead’s phone. It does not message +971 54 200 0142. **Open deal** opens `dealUrl` in a new tab when the row has one. **Open Google Sheet** opens the Leads spreadsheet.

`src/data/bitrix-leads.json` and `shared/bitrix-leads-2026-10-01.json` are empty placeholders. `shared/leads-seed.json` is the same demo seed as `api/_lib/leads-seed.json`. Real lead names, phones, and emails are not committed.

### How to refresh leads

Sheet: [Bitrix leads](https://docs.google.com/spreadsheets/d/1UzHKQiuYcC_OUVOcJoEGs02QqRMLy1nLRo5VNHKovr4/edit) (`1UzHKQiuYcC_OUVOcJoEGs02QqRMLy1nLRo5VNHKovr4`).

```bash
npm run refresh-leads
```

With `GOOGLE_SHEETS_API_KEY` or `GOOGLE_ACCESS_TOKEN`, the script reads that sheet. Without those, it copies `/workspace/bitrix-leads/map-crm/bitrix-leads.json` when that file is present. `npm run build` runs the same copy when the box file is there. Do not commit the written JSON when it contains real contacts. Neither path runs in the browser.

## Units

The **Units** grid and the **Secondary** map both read `src/data/units.json`. That file is a snapshot of the private sheet **Map CRM - Secondary Units (Pocket & Owners)** (`1-53TnNTQos0kkaUgo8ewT8QZfQlTDdSswTM6w_O9Z_8`), tab `Units`. It is not a tab on the Bitrix leads sheet. The committed file starts empty. The browser does not call Google Sheets, and the page does not invent rows. Empty cells say **Not on sheet**. A row’s WhatsApp icon uses that owner’s phone and stays hidden when the phone is empty. It does not message +971 54 200 0142.

Both screens have a segmented control: **All**, **Pocket listings** (`pocketListing` Yes), and **Owners** (`pocketListing` No or blank). Data health labels this feed **Secondary Units sheet**.

### How to refresh units

Sheet: [Map CRM - Secondary Units (Pocket & Owners)](https://docs.google.com/spreadsheets/d/1-53TnNTQos0kkaUgo8ewT8QZfQlTDdSswTM6w_O9Z_8/edit). The script reads the named range `Units!A1:M` and checks that the header starts with `unitId`. Columns are matched by name, ignoring case. `trelloUrl` (column M) is optional, so an older A–L export still loads. Only `https://trello.com/c/` and `https://trello.com/b/` links are kept. Any other value is stored blank, and the Trello button stays hidden. The script does not hardcode a gid and it does not fall back to another tab.

```bash
npm run refresh-units
```

Order:

1. If `/workspace/secondary-units/map-crm/units.json` is present, it is copied as-is (this is the primary path; a JSON file wins over a CSV in the same folder).
2. Otherwise, if `/workspace/secondary-units/map-crm/units.csv` is present, it is parsed and written to `src/data/units.json`.
3. Otherwise, `GOOGLE_ACCESS_TOKEN` (OAuth) reads the private sheet.
4. `GOOGLE_SHEETS_API_KEY` only works for public sheets. This sheet is private, so a key alone does not pull it. Without `--if-available` the command exits 1 and leaves the JSON unchanged. With `--if-available` it prints that explanation and exits 0.

`npm run build` runs `refresh-units --if-available` before the leads refresh. When no local file and no `GOOGLE_ACCESS_TOKEN` are present, the committed empty `src/data/units.json` is kept. Neither path runs in the browser. Keep the env var names exact so Vite does not copy them into the bundle.

## Secondary map (live Trello)

`/secondary` and `/secondary/<community>` load **live** from the Trello board **Secondary** ([trello.com/b/MGYdwKGJ/secondary](https://trello.com/b/MGYdwKGJ/secondary)) through `GET /api/secondary` (signed-in only, same check as `/api/clients`). The server reads open lists and cards with `TRELLO_KEY` / `TRELLO_TOKEN` and returns per card: id, title, unit code, known villa type, bedrooms, list name, community, card link, labels, cover (proxied via `/api/secondary?cover=<cardId>`), sold flag. It never reads or returns card descriptions, comments, checklists or custom fields (seller, fee and phone details live there). The 11 developer lists (Emaar, Beyond, Nakheel, Meraas, H&H, Sobha, Imtiaz, Ellington, Omniyat, Al Habtoor, Aldar) are excluded. SOLD cards get the community of the list or board they came from, are hidden by default and shown grey with **Show sold**.

Caching: per-instance memory cache, 5 minutes fresh, up to 1 hour stale while it refreshes; browser `private, max-age=60, stale-while-revalidate=300`. No shared CDN cache, so a signed-out request can never get a cached copy.

Pins: a coordinate or Google Maps link in the card title or a link attachment wins; otherwise the card goes near its community point in `src/data/secondary.ts` on a small spiral so cards do not stack. List names map to communities by label, title or `aliases` (the Trello list "Arabian Ranches" → AR 1 unless the card names 2 or 3; "Emirates Living" is its own community, Emirates Hills stays). Rows in `src/data/units.json` (Units sheet) still load and join a card by unit ID or Trello link.

## Units & Projects

The burger menu item **Units & Projects** opens one page with two sections, switched at the top:

- **Secondary units** (`/units`) is the Units grid described above.
- **Off-plan projects** (`/units/off-plan`) lists the Trello Dubai projects grouped by Mahmoud’s 11 developers, in this order: Emaar, Palm Properties, H&H, Ellington, Beyond, Omniyat, Al Habtoor, Aldar, Modon, Meraas, Nakheel. A developer with no card on the board still gets a group that says so. **Other developers** adds the rest of the board.
  - **Waterfront / Inland**: waterfront when the Trello list or area names a coast, island, creek, harbour, marina, Palm, or La Mer. The list **Other inland** is always inland.
  - **Floors** is read from the card (`G+45`, `2B+G+4P+38`, `52-storey`), then from that project’s WhatsApp news. When neither says, it shows **Not on card**.
  - **New launch** is shown when the card text mentions a launch (but not “not a new launch”), and for every project that first appeared in WhatsApp news with no Trello card.
  - Each card links to its Trello card and to that project’s News card.

Developer names are folded onto the 11 by `src/lib/developers.ts` and `api/_lib/developers.js` (for example `Emaar Properties` → Emaar, `Meraas and Brookfield Properties` → Meraas). The two lists must match; `scripts/news.test.mjs` checks it.

## News

**News** (`/news`) is a board of cards, one per project, grouped by developer. Each WhatsApp message about a project is a comment inside its card, newest first, with the Dubai date and time, the source group, the hidden sender label, and any images or files. A card whose project has no Trello card is flagged **New launch**. Cards with a comment from the last 24 hours get a rose outline and a **Last 24h** tag.

Search covers project, developer, group, and message text. Filters are developer, a range (24h, 7 days, 30 days), and a single Dubai day. **Projects with no news** adds empty cards for the 11 developers’ Trello projects. The board refreshes every minute while the tab is visible.

Data lives in Upstash Redis (the Vercel KV / Upstash marketplace integration) through its REST API, so there is no extra npm dependency. Without `KV_REST_API_URL` / `KV_REST_API_TOKEN`, dev and preview use a JSON file in `/tmp`; production returns 502 and the tab shows Retry. Each project keeps its newest 300 messages (`NEWS_MAX_PER_CARD`).

### News ingest: `POST /api/news`

The WhatsApp group reader is a separate service (not in this repo). It posts each message here.

- Auth: `Authorization: Bearer <NEWS_INGEST_TOKEN>` or `X-Ingest-Token: <NEWS_INGEST_TOKEN>`. The token must be at least 16 characters. When it is unset the endpoint returns 503 `ingest_not_configured`. A wrong token returns 401.
- Body: one message object, an array of up to 100, or `{ "messages": [...] }`. JSON, at most 1 MB.

```json
{
  "developer": "Emaar",
  "project": "Creek Haven",
  "group": "Emaar Brokers Updates",
  "sender_hidden": "Emaar sales",
  "text": "Phase 2 price list is out. 1BR from AED 1.6M.",
  "media_urls": ["https://files.example.com/creek-haven-phase2.jpg", "https://files.example.com/price-list.pdf"],
  "timestamp": "2026-10-03T09:15:00+04:00",
  "id": "optional-whatsapp-message-id"
}
```

| Field | Required | Notes |
|---|---|---|
| `project` | yes | Up to 160 characters. Matched to a Trello project by name; an unknown project creates a new card flagged **New launch**. |
| `developer` | no | Folded onto the 11 developers when it matches (`Emaar Properties` → Emaar). The card key is developer + project. |
| `group` | no | Source WhatsApp group name, shown on the comment. |
| `sender_hidden` | no | A label for the sender, never a number. Anything that looks like a phone number becomes `Hidden`. |
| `text` | `text` or `media_urls` | Up to 8,000 characters. Phone numbers and `wa.me` links in the text are replaced with `[number hidden]` before storage. |
| `media_urls` | `text` or `media_urls` | Up to 20 `https://` URLs (strings, or `{ "url", "name", "mime" }`). Images show as thumbnails; video and other files show as links. Non-https URLs are dropped. Host the files yourself (for example Vercel Blob or S3). |
| `timestamp` | no | ISO 8601, or Unix seconds / milliseconds. Defaults to the time received. Rejected if before 2015 or more than a day in the future. |
| `id` | no | The WhatsApp message id. Used to skip duplicates; without it, a hash of project, time, group, text, and media is used. Duplicates are skipped for 90 days. |

Response:

```json
{ "ok": true, "backend": "kv", "accepted": 1, "duplicates": 0,
  "results": [{ "id": "…", "key": "emaar--creek-haven", "status": "new_card" }], "rejected": [] }
```

`status` is `new_card`, `added`, or `duplicate`. Invalid items are listed in `rejected` with their index and an error (`project_required`, `text_or_media_required`, `bad_timestamp`). If no item is valid the response is 400.

```bash
curl -X POST https://crm.askmontaser.ae/api/news \
  -H "Authorization: Bearer $NEWS_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{"developer":"Nakheel","project":"Palm Central","group":"Nakheel Agents","text":"New inventory released"}'
```

`GET /api/news` (signed-in session) returns `{ ok, cards: [{ key, developer, project, created_at, last_at, count, messages: [...] }] }`.

## Calendar

**Calendar** (`/calendar`) shows Mahmoud’s Google Calendar in an embed, with Agenda, Week, and Month views (Agenda by default on a phone) and an **Open in Google Calendar** link. The URL comes from signed-in `GET /api/calendar`, so the calendar address is not in the bundle. Set `GOOGLE_CALENDAR_EMBED_URL` to the embed `src` (Google Calendar → Settings → the calendar → Integrate calendar → Embed code; pasting the whole `<iframe>` also works), or set `GOOGLE_CALENDAR_ID` to the calendar address. A private calendar only shows events to a browser signed in to a Google account that can see it. Without either variable the tab explains how to connect it.

## WhatsApp

WhatsApp Web cannot be embedded, so **WhatsApp** (`/whatsapp`) is a page of quick-open buttons:

- **Groups** and **Contacts** come from signed-in `GET /api/whatsapp-links`, which reads `api/_lib/whatsapp-links.json`. The list stays on the server so contact numbers are not in the bundle. Set `WHATSAPP_LINKS_JSON` to the same JSON to override the file without a commit. Groups need an invite link (`https://chat.whatsapp.com/…`); contacts need a phone and can carry a prefilled `message`.

```json
{
  "groups": [{ "name": "Emaar Brokers Updates", "url": "https://chat.whatsapp.com/XXXXXXXX", "developer": "Emaar", "note": "Price lists" }],
  "contacts": [{ "name": "Nakheel sales manager", "phone": "+971 50 000 0000", "note": "Palm Jebel Ali", "message": "Hi, Mahmoud from MahmoudDXB" }]
}
```

- **Message a lead** searches the Leads sheet (same `GET /api/leads`) and opens `wa.me` for that lead with the usual follow-up line.
- **Message a number** opens a chat with any number typed in.

On the Leads tab, each phone card has a **Message this lead** button and each grid row keeps its WhatsApp icon.

## Features

- Full-viewport map centered on Dubai (MapLibre GL JS, no API key)
  - **Street** — OpenFreeMap Positron (OpenStreetMap / OpenMapTiles)
  - **Satellite** — Esri World Imagery
  - Switching basemap keeps the camera, pins, filters, and draw tools
- Floating glass toolbar:
  - Search by project, community, area, or developer
  - **Draw area** drags a rectangle. **Drop radius** places a pin and a 2–12 km circle. **Clear** removes the area. Both work together with the other filters. The chip shows how many projects sit inside.
  - Street / Satellite toggle
  - List view of the same filtered projects
  - Filters for developer, bedrooms, payment plan, handover year, and price range
  - Cards with no stated price drop out of a numeric price filter
- Floating layer toggles (no invented competitor or off-market stock):
  - **Our listings** is the Trello Dubai inventory
  - **Has starting price** and **Price not on card** show or hide the rose and gray pins
  - **Community network** draws a light area and links around each Trello list
  - **Stated unit count** keeps only cards that state a single unit count and draws a ring
- Cards that share a community are spaced around that centroid so the map stays readable. Rose pins have a starting price. Gray pins do not. Both have a white halo on the street map and on satellite.
- Project card: fields copied from Trello, layout prices, files linked on the card, the pin note, and **Open in Trello**
- Brochure is a one-page sheet of the same card
- WhatsApp opens `https://wa.me/971542000142` with a prefilled project summary (+971 54 200 0142)
- **Book a viewing** opens the same WhatsApp number with a message that names the project
- Chrome follows the MahmoudDXB site: ink `#1d1d1f`, canvas neutrals, rose `#c45c5c`, Inter (self-hosted from `@fontsource-variable/inter`), and frosted Liquid Glass panels

## Stack

Vite, React, TypeScript, MapLibre GL JS.
