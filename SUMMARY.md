# MahmoudDXB map — review

For Mahmoud’s sales team and the marketing review. Inventory is the Trello Dubai board export, not a made-up seed.

## Phase 3 — Clients

A **Clients** tab sits next to **Map**. Signed-in users load broadcast replies from `/api/clients`. Real client rows are not in this repo: `src/data/broadcast-replies.json` keeps an empty `clients` array, and the server reads `CLIENTS_JSON` when that variable is set. WhatsApp on a client card opens that person’s number, with a follow-up that names the project. Map cards still use +971 54 200 0142. The browser does not call Google Sheets. Blank sheet cells stay **Not on sheet**.

## Phase 2 on the same map

Inspired by a map-first brokerage layout (area select, dense pins, layer switches, a booking CTA). The Dubai book stays MahmoudDXB: ink, neutrals, rose, Liquid Glass, Street/Satellite, and WhatsApp +971 54 200 0142.

- **Drop radius** places a pin and a circle. **Draw area** drags a rectangle. **Clear** resets the area. Attribute filters still apply, and the chip counts projects inside.
- Pins that share a community are spaced around that centroid, with a light **community network** (area and links). Nothing new was added to the inventory.
- Layers are **Our listings**, **Has starting price**, **Price not on card**, **Community network**, and **Stated unit count**. Competitor and off-market layers are not shown.
- **Book a viewing** opens WhatsApp to +971 54 200 0142 with the project name filled in. The general WhatsApp share stays on the card.
- The badge still reads **LIVE · Trello Dubai**, with **Inventory from Trello Dubai** and the export date beside it.
- **Refresh** of the Trello board is `npm run refresh-inventory`. It needs `TRELLO_KEY` and `TRELLO_TOKEN` on the machine that runs it. Those names are not `VITE_` variables, so they are not shipped to the browser. The deployed app does not expose an unauthenticated `/api/inventory/refresh` route. Without the credentials, the saved JSON stays as it is.
- The standalone app is served at `/` on **https://crm.askmontaser.ae** (old https://crm.mahmouddxb.com redirects). Sign-in is the in-app screen and same-origin `/api/login`, `/api/session`, and `/api/logout`. It does not redirect to www.

## Trello linkage

- Source file: `src/data/trello-dubai.json` (user-trello MCP live pull, 87 project pins; the 9 **WHAT IS THE UPDATE** cards are not pins)
- Board: [Dubai](https://trello.com/b/HdegR3Aa/dubai) (`HdegR3Aa`)
- Export timestamp on the file: `exportedAt` (shown in the **LIVE · Trello Dubai** badge tooltip)
- Parser: `src/lib/inventory.ts`
- Pins: cards whose list is a community. The list **WHAT IS THE UPDATE** is excluded.
- Abu Dhabi, RAK, and Oasis are not loaded.
- Missing prices, handover, plans, and unit counts stay blank. The card says **Not on card**.
- Coordinates are community or list centroids (or a `Lat/Lng:` line if a card has one). They are not invented plot points.
- **Open in Trello** uses the card URL from the export.
- Refresh is a server pull of board `HdegR3Aa` into `src/data/trello-dubai.json`. The map button and `npm run refresh-inventory` share that pull. The browser has no Trello API key.

## What changed from the sample-data demo

- The 24 invented projects (including the Samana samples) are gone.
- The toolbar badge is **LIVE · Trello Dubai**, replacing **DEMO DATA**.
- Pin color is price on the card (rose) or price not stated (gray). Available / hot / sold out is not invented.
- Every pin is an **Our listing**, because this board is Mahmoud’s Dubai inventory.
- Project cards, the list, the brochure, and WhatsApp use only fields parsed from the card, plus the Trello link.

Branding from the previous review still holds:

- **MahmoudDXB — Premium Dubai Real Estate**, ink `#1d1d1f`, rose `#c45c5c`, matching [mahmouddxb.com](https://www.mahmouddxb.com).
- Frosted Liquid Glass chrome over a full-bleed map.
- **Street** and **Satellite** switch without dropping pins. Street is OpenFreeMap Positron. Satellite is Esri World Imagery. Neither needs an API key.
- WhatsApp shares go to **+971 54 200 0142** (`wa.me/971542000142`).

## What you can do

- Scan the Dubai board on a street map or satellite
- Search a project, community, area, or developer
- Draw an area or drop a radius
- Switch to a list of the same cards
- Filter by developer, bedrooms, payment plan, handover year, and price (cards without a price are left out of a price filter)
- Turn layers on and off. Only **Our listings** has pins on this export. **Units available** keeps cards that state a unit count.
- Open a project card, preview a brochure, open the Trello card, or send it on WhatsApp

## What this build does not include

- Sales pipeline
- WhatsApp inbox
- A client-side Trello key, or a second landlord password
- Abu Dhabi, RAK, or Oasis boards
