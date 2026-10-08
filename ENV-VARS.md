# Env vars for the leads build (set on BOTH real-estate-landing (www) and map-crm unless noted)

| Var | Projects | Value |
|---|---|---|
| `LEADS_SHEET_ID` | www + crm | ID of the private "MahmoudDXB Leads" Sheet |
| `GOOGLE_SA_EMAIL` | www + crm | `client_email` from the service-account JSON |
| `GOOGLE_SA_KEY` | www + crm | `private_key` from the JSON (paste it with its line breaks or with `\n` escapes) |
| `LEADS_TAB` | www + crm | optional, defaults to `Leads` |
| `LEADS_BACKEND` | www + crm | optional: `sheets` / `mock`. Leave unset in production |
| `AIRTABLE_TOKEN` | crm | Personal access token with record read and write on the Ask MonTaser Leads base. When set, `/api/leads` uses Airtable instead of the Google Sheet |
| `AIRTABLE_BASE_ID` | crm | optional. Defaults to `appIBzGl2Pfcd8oNq` |
| `AIRTABLE_TABLE` | crm | optional. Defaults to `Leads` |
| `LEADS_ALERT` | www | `off` (default) / `telegram` / `log` / `email` (email is a stub) / `both` |
| `TELEGRAM_BOT_TOKEN` | www | already set for api/telegram.js and reused for alerts |
| `LEADS_ALERT_TELEGRAM_CHAT_ID` | www | Mahmoud's Telegram chat id. He messages the bot once, then read `getUpdates` |
| `LISTING_CHECK_USER` / `LISTING_CHECK_PASS` / `LISTING_CHECK_SECRET` | crm | unchanged, the existing session cookie |
| `CURSOR_API_KEY` | crm | Cursor user API key. The menu sends a task to one Grok bot. Leave unset and Send task says it is not connected |
| `GROK_BOT_ID` | crm | optional. Defaults to the one Grok bot already on this CRM |
| `PLANNER_BOT_ID` | crm | Planner bot agent id (`bc-…`). Lead follow-up dates are sent to it, and it adds them to mahmoud1594@gmail.com with its Google Calendar connection. Unset uses the Grok bot |
| `NEWS_INGEST_TOKEN` | crm | Secret (16+ characters) the WhatsApp reader sends to `POST /api/news`. Unset returns 503 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | crm | Upstash Redis REST URL and token for News (added by the Vercel KV / Upstash integration). `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work |
| `NEWS_BACKEND` | crm | optional: `kv` / `mock`. Leave unset in production |
| `NEWS_MAX_PER_CARD` | crm | optional, defaults to 300 messages kept per project |
| `GOOGLE_CALENDAR_EMBED_URL` | crm | The Google Calendar embed `src` (or the whole `<iframe>` code) |
| `GOOGLE_CALENDAR_ID` | crm | optional. Calendar address, used to build the embed when `GOOGLE_CALENDAR_EMBED_URL` is unset |
| `WHATSAPP_LINKS_JSON` | crm | optional. Overrides `api/_lib/whatsapp-links.json` (saved groups and contacts) |
| `CLIENTS_JSON` | crm | optional. JSON array of Clients-tab rows. Unset serves an empty list from `/api/clients`. Do not commit real client rows |
| `OWNER_PHONES_INDEX_URL` | crm | Private https URL to the owner phone index (`owner-phones.sqlite` or `.sqlite.gz`, built by `scripts/build-owner-phone-index.py`) for the Listings Check tab. Not needed when the deploy ships `api/_lib/owner-phones.sqlite.gz` (current prod does). `OWNER_DB_INDEX_URL` (full listing-check index) also works, slower. `OWNER_PHONES_DB_PATH` = local file path for dev. Never commit the index |

## Behaviour when vars are missing
- **Preview or dev** (`VERCEL_ENV` is not `production`) with no Sheet vars: mock mode. www writes to `/tmp`, which isn't persistent. crm reads the demo seed in `api/_lib/leads-seed.json`.
- **Clients**: with `CLIENTS_JSON` unset, signed-in `GET /api/clients` returns an empty list. Real rows stay in that env var or in the tracker sheet, not in git.
- **Production** with no Sheet vars: the store reports "unconfigured". The form shows an honest error with a WhatsApp fallback, and crm returns 502. Nothing is silently lost to `/tmp`.
- **News** with no KV vars: mock (a JSON file in `/tmp`) outside production, 502 `store_unavailable` in production. The News tab shows Retry and the Off-plan list still shows Trello projects.
- **Listings Check** with no owner index (no `api/_lib/owner-phones.sqlite(.gz)` in the deploy and no `OWNER_PHONES_INDEX_URL`): signed-in `/api/owner-search` returns 503 `owner_db_not_configured` and the tab says the owner database is not connected. Signed out it is always 401.
- **Calendar** with neither calendar var: the Calendar tab says it is not connected.
- If the alert fails (bad token, Telegram down), it's logged and the lead is still saved and returns 200.

## Trello (Secondary map + off-plan refresh)

- `TRELLO_KEY`, `TRELLO_TOKEN` — server-only (never `VITE_`). Read access to Mahmoud's Trello. Set on Vercel project map-crm for Production and Preview (2026-10-04).
- Used by `GET /api/secondary` (rewritten to `/api/clients?feed=secondary`, because the Hobby plan allows 12 functions) and by `api/inventory/refresh.js` when that route is deployed.
- Without them `/api/secondary` returns 503 `trello_not_configured` and the Secondary map shows "Trello offline" with Retry.
