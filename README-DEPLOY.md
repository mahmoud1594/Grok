# Map CRM standalone deploy

This bundle is its own Vercel project (for example `map-crm`), served at the root of `https://crm.askmontaser.ae` (the only CRM URL; `vercel.json` redirects `crm.mahmouddxb.com` and `map-crm-sooty.vercel.app` there, except the bot webhooks `/api/news`, `/api/broadcast-reply`, `/api/email-events`). It is not mounted under `www.mahmouddxb.com/crm`.

The zip root is the project root: prebuilt `index.html` and `assets/`, plus `api/`, `vercel.json`, and this file. Leave the Vercel build command empty. Do not run `npm run build` from the git repo when packing this zip (`npm run build` refreshes protected JSON). The git repo builds with `npx vite build` only.

## Environment variables

Copy these three from the www.mahmouddxb.com Vercel project into the new project. The names must match so a session signed on www is valid on crm, and the reverse:

- `LISTING_CHECK_USER`
- `LISTING_CHECK_PASS`
- `LISTING_CHECK_SECRET`

`LISTING_CHECK_SECRET` signs the session token. If it is empty, the functions fall back to `LISTING_CHECK_PASS`, same as www.

Leads come from a private Google Sheet. The variable list and the missing-variable behaviour are in [ENV-VARS.md](ENV-VARS.md).

This preview runs with `LEADS_BACKEND=mock`. If `LEADS_BACKEND` is unset and `LEADS_SHEET_ID`, `GOOGLE_SA_EMAIL`, or `GOOGLE_SA_KEY` is missing, any deploy that is not `VERCEL_ENV=production` also uses mock. In production that same gap returns 502 `store_unavailable`, and the Leads tab shows its error state with Retry. `GET /api/leads` dedupes by phone and returns `rows` as the raw count. A signed-in user can change a lead's name and write a comment about the client. The comment is stored in column X (`comment`), after `updated_at`, so existing columns stay in place. The Leads tab is read from row 1. That row is a header only when A1 is `lead_id`. A sheet that already starts with a lead is shown as-is. The server caches the sheet for 60 seconds; `?fresh=1` skips that cache. The menu has one Grok task box. `POST /api/grok` sends that text as a follow-up to a single bot. It needs `CURSOR_API_KEY` on this project. `GROK_BOT_ID` overrides which bot, and otherwise the built-in Grok bot is used. In production, delete `api/_lib/leads-seed.json` or leave it unused.

News, Calendar, and WhatsApp add `api/news.js`, `api/calendar.js`, and `api/whatsapp-links.js` (with `api/_lib/news-store.js`, `api/_lib/developers.js`, and `api/_lib/whatsapp-links.json`). Their variables are in [ENV-VARS.md](ENV-VARS.md). News needs an Upstash Redis / Vercel KV store connected to this project.

## Cookie

`mdxb_listing_check_token` stays `HttpOnly`, `Secure`, and `SameSite=Lax`.

- When the request host is `mahmouddxb.com` or a subdomain (including `crm.mahmouddxb.com` and `www.mahmouddxb.com`), the cookie `Domain` is `.mahmouddxb.com`. The same applies to `askmontaser.ae` hosts with `.askmontaser.ae`.
- On any other host (`*.vercel.app` previews, localhost), the cookie is host-only so that host can still sign in. It does not set `Domain=.mahmouddxb.com`.

## Routes

Signed out, `/` is the Owner Portal. After sign-in, `/` is Leads. `/map`, `/clients`, `/units`, `/units/off-plan`, `/news`, `/calendar`, `/whatsapp`, `/secondary`, `/leads`, and `/secondary/:communitySlug` are child routes of that shell. `/crm` redirects to `/`. `vercel.json` rewrites every path except `/api/*` and `/assets/*` to `/`, including nested paths such as `/secondary/tilal-al-ghaf`. With `cleanUrls: true`, a rewrite to `/index.html` 404s those deep links.

Sign-in is `POST /api/login` on this host. Sign-out is `POST /api/logout` from the burger menu. The app checks `GET /api/session` on load. Nothing redirects to `www.mahmouddxb.com`.

## Inventory refresh

`POST /api/inventory/refresh` is unchanged. This Vercel project does not add that route. If it is missing, the map keeps the saved inventory and shows the existing failure message.
