# Publish log

## 2026-10-08 19:21 +04 — Preview only: phone sections menu

- Deployment: `dpl_B7HUGJb5cg1aST2iKc6yckUZ5Tcy` (`map-gyi2b9lgu`, preview, not production). https://map-gyi2b9lgu-mahmoud1594-8326s-projects.vercel.app — Vercel Authentication is on. `vercel curl` returned the CRM HTML. Not promoted.
- Branch/commit: `cursor/phone-crm-menu-4cb8` / `727f86a`. `npm test` 65 passed. `npm run build` and check-bundle-pii clean.
- Summary: On a phone the sections menu crashed React (`useNavGroups` ran only after the menu opened) and the header button sits in a frosted bar that iOS does not tap, including no button at all on the full-page calendar. The hook always runs now, and a fixed 44px button on the shell opens the menu below 1100px. Desktop rail is unchanged.
- Live sites are still 404 (`x-vercel-error: NOT_FOUND`) on crm.askmontaser.ae and www.askmontaser.ae because the empty initial commit on `main` was deployed to both `map-crm` and `real-estate-landing`. Do not merge this PR until Mahmoud approves: merging would also publish the CRM over the marketing site. Last good CRM deploy before that wipe was `dpl_DcH1QgZPvfA6DiUGMGjCGW62f6sN`. Last good landing deploy was `dpl_2dyjXfXJ5MdmiL7uqqJt6k9BXyRp`.

## 2026-10-08 18:39 +04 — Planner follow-ups and desktop rail live

- Deployment: `dpl_2nz8kRoNQEehvK9tmHYEwQN77jkm` (`map-5buuat12b`, production, crm.askmontaser.ae). Approved by Mahmoud ("Confirmed go live") after preview `dpl_9XgGe7F3SWUHs6AhBHA8LBAtE3yK` (askmontaser-crm-preview.vercel.app). `crm.askmontaser.ae` returned 200. `crm.mahmouddxb.com` still 308s to it.
- Branch/commit: `cursor/crm-desktop-nav-rail-bfa4` / `c6c5e13`. `npm ci && npm run build` on that commit; check-bundle-pii clean. Promoted the existing preview so server files that are not in git stayed with the deployment.
- Backup: previous production was `dpl_w5av5ULDRK2aABZBKLWpPXfLfT3h` (`map-nch3o7m2j`, commit `4682595`). Tag `backup-20261008-1838` is on `4682595`. Rollback: `vercel promote dpl_w5av5ULDRK2aABZBKLWpPXfLfT3h` or `vercel rollback`.
- Summary: Desktop rail is live (Listing Farming, Secondary in Desk, menu order, Lost bin, follow-up bell, full-page calendar, news boards). Setting a lead's next follow-up sends a task to the Planner bot and no longer opens a Google Calendar pop-up.

## 2026-10-08 16:01 +04 — One CRM URL: crm.askmontaser.ae

- Deployment: `dpl_w5av5ULDRK2aABZBKLWpPXfLfT3h` (`map-nch3o7m2j`, production, crm.askmontaser.ae). Mahmoud asked to "make all crm in one url crm.askmontaser.ae". Preview `map-h9aexg9gv` checked first.
- Branch/commit: `cursor/askmontaser-domain-addb` / `4682595`. check-bundle-pii clean, 57 tests pass.
- Backup: previous production was `dpl_56Ax3WQkWdHepvLhHQQPV2KcupGZ` (commit `17d090f`). Tag `backup-20261008-1601` is on `17d090f`. Rollback: `vercel promote dpl_56Ax3WQkWdHepvLhHQQPV2KcupGZ`.
- Summary: `crm.mahmouddxb.com` and `map-crm-sooty.vercel.app` now send a 308 for everything, pages and API, to the same path on `crm.askmontaser.ae`. Only the bot webhooks `/api/news`, `/api/broadcast-reply` and `/api/email-events` still answer on the old hosts (token or signature required).

## 2026-10-08 15:55 +04 — crm.mahmouddxb.com pages redirect to crm.askmontaser.ae

- Deployment: `dpl_56Ax3WQkWdHepvLhHQQPV2KcupGZ` (`map-fzzi2ca8o`, production, crm.askmontaser.ae). Mahmoud asked to "shift all things to new domain … for mahmouddxb.com just redirect to askmontaser.ae". Preview `map-o5aha5zyq` checked first.
- Branch/commit: `cursor/askmontaser-domain-addb` / `17d090f`. check-bundle-pii clean, 57 tests pass.
- Backup: previous production was `dpl_85ZT14eeJpdqoHfX3SDuqfTmNaoS` (commit `796bce2`). Tag `backup-20261008-1554` is on `796bce2`. Rollback: `vercel promote dpl_85ZT14eeJpdqoHfX3SDuqfTmNaoS`.
- `vercel.json`: host `crm.mahmouddxb.com` sends a 308 for every page to the same path and query on `crm.askmontaser.ae`. `/api/*` on the old host still answers, so older bots and integrations keep working. www.mahmouddxb.com and mahmouddxb.com were already redirecting to www.askmontaser.ae (landing project).
- MailerLite webhook `200744212638992197` URL changed to `https://crm.askmontaser.ae/api/email-events`.

## 2026-10-08 15:53 +04 — crm.askmontaser.ae support (WhatsApp extension 1.2.0, cookie/CORS)

- Deployment: `dpl_85ZT14eeJpdqoHfX3SDuqfTmNaoS` (`map-7bbb9phfc`, production, crm.askmontaser.ae). Approved by Mahmoud ("shift all things to new domain") after the preview `map-afy1vnjem`.
- Branch/commit: `cursor/askmontaser-domain-addb` / `796bce2` (stacked on `cursor/email-building-clean-addb`; contains main). `npm ci && npm run build`, check-bundle-pii clean, 57 tests pass.
- Backup: previous production was `dpl_CUYdD5hwfzAFGzJvd5qV9M5PTMg3` (`map-mk7na7big`, commit `8397314`). Tag `backup-20261008-1552` is on `8397314`. Rollback: `vercel promote dpl_CUYdD5hwfzAFGzJvd5qV9M5PTMg3`.
- Package: `vite build` output plus `api/`, with `api/_lib/owner-phones.sqlite.gz` and `api/_lib/clients-data.js` carried over (not committed).
- Summary: WhatsApp extension 1.2.0 works on crm.askmontaser.ae. Login cookie is shared on `.askmontaser.ae` and CORS allows askmontaser.ae sites. Docs and agent rules name crm.askmontaser.ae as the live CRM.

## 2026-10-08 15:36 +04 — Email contacts: building-name cleanup on import

- Deployment: `dpl_CUYdD5hwfzAFGzJvd5qV9M5PTMg3` (`map-mk7na7big`, production, crm.mahmouddxb.com). Approved by Mahmoud ("publish") after the preview `map-j9itjriar` (askmontaser-crm-preview.vercel.app).
- Branch/commit: `cursor/email-building-clean-addb` / `5e0250f` (stacked on `cursor/email-contacts-addb` `c51534d`; contains main). `npm ci && npm run build`, check-bundle-pii clean, 55 tests pass.
- Backup: previous production was `dpl_7QHYsZnpoftnMSgpWGcz8TadFjYe` (`map-orgrhzq13`, commit `e56fcb5`). Tag `backup-20261008-1535` is on `e56fcb5`. Rollback: `vercel promote dpl_7QHYsZnpoftnMSgpWGcz8TadFjYe`.
- Package: `vite build` output plus `api/`, with `api/_lib/owner-phones.sqlite.gz` and `api/_lib/clients-data.js` carried over from production (not committed).
- Data: Phase 1 file (Business Bay 6,298 + Downtown Dubai 7,812 = 14,110 rows, 2,267 without phone) was written to the EmailContacts tab at 11:49 through a preview using a one-off `EMAIL_IMPORT_TOKEN`. The token was then removed and that preview deleted. The token is not set in any environment.
- Summary: imports now cut building cells to the tower name (unit codes, address tails, spelling variants), so Phase 1 groups by 229 buildings instead of 1,409. An optional `EMAIL_IMPORT_TOKEN` allows a server-side import when set.

## 2026-10-08 11:35 +04 — Email contacts tab and webhook, Settings, CRM dark mode, WhatsApp number-box fix

- Deployment: `dpl_7QHYsZnpoftnMSgpWGcz8TadFjYe` (`map-orgrhzq13`, production, crm.mahmouddxb.com). Approved by Mahmoud ("publish") after the preview `dpl_FN3hv7UjK2oo1E1Q7f1e1MZyo4G5` (askmontaser-crm-preview.vercel.app).
- Branch/commit: `cursor/email-contacts-addb` / `e56fcb5` (stacked on `cursor/whatsapp-web-qr-addb` `febdc1a`; contains main `55a95e3`). `npm ci && npm run build`, check-bundle-pii clean, 54 tests pass.
- Backup: previous production was `dpl_3hutbaWKEqQfy9KQ122uLJU2p16T` (`map-6qgzrpm76`, commit `656c309`). Tag `backup-20261008-1134` is on `656c309`. Rollback: `vercel promote dpl_3hutbaWKEqQfy9KQ122uLJU2p16T`.
- Package: `vite build` output plus `api/`, with `api/_lib/owner-phones.sqlite.gz` and `api/_lib/clients-data.js` carried over from production (byte-identical, not committed).
- Env: `EMAIL_WEBHOOK_SECRET` added (Production + Preview). MailerLite webhook `200744212638992197` → `https://crm.mahmouddxb.com/api/email-events` (open, click, unsubscribed, bounced, spam_reported; batched) switched on after the deploy.
- Summary: new Email contacts tab (EmailContacts sheet tab, grouped by community and building, search, filters, file import, CSV export, unsubscribe list via StopList), email webhook, Settings with CRM and WhatsApp light/dark themes, and the WhatsApp number box no longer loses focus to WhatsApp or password managers.

## 2026-10-07 20:42 +04 — docked side menu, WhatsApp Message-a-number box

- Deployment: `dpl_3hutbaWKEqQfy9KQ122uLJU2p16T` (`map-6qgzrpm76`, production, crm.mahmouddxb.com). Approved by Mahmoud after the preview `dpl_2W81NDhMzEm76PL47yWXVQDVH9Pa` (askmontaser-crm-preview.vercel.app).
- Branch/commit: `cursor/whatsapp-web-qr-addb` / `656c309`, on top of main `55a95e3` (`npm ci && npm run build`, check-bundle-pii clean, 46 tests pass).
- Backup: previous production was `dpl_E2YXJ78rqrZQvZu2Nq8iL6o4aGc4` (`map-q2nzxj0j3`, commit `358e687`). Tag `backup-20261007-2041` is on `358e687`. Rollback: `vercel promote dpl_E2YXJ78rqrZQvZu2Nq8iL6o4aGc4`.
- Package: `vite build` output plus `api/`, with `api/_lib/owner-phones.sqlite.gz` and `api/_lib/clients-data.js` carried over from production (not committed).
- Summary: on wide screens the side menu docks beside the page instead of covering it. The WhatsApp tab drops the bar, the Web/App switch and the Eazybe button, and adds a header box that opens a chat with any number in the embedded WhatsApp.

## 2026-10-07 20:14 +04 — full-width WhatsApp Web, no lead message list

- Deployment: `dpl_E2YXJ78rqrZQvZu2Nq8iL6o4aGc4` (`map-q2nzxj0j3`, production, crm.mahmouddxb.com). Approved by Mahmoud after the preview `map-nd66ycph3` (askmontaser-crm-preview.vercel.app). An identical package was deployed a minute earlier as `map-oczugoo82` and was superseded.
- Branch/commit: `cursor/whatsapp-web-qr-addb` / `358e687`, on top of main `55a95e3` (`npm ci && npm run build`, check-bundle-pii clean, 46 tests pass).
- Backup: previous production was `dpl_Hq2SQaHQhYdBwDiFLV1Jz7RPyPuo` (`map-o97ghkvy0`, commit `4cdf07a`). Tag `backup-20261007-2013` is on `4cdf07a`. Rollback: `vercel promote dpl_Hq2SQaHQhYdBwDiFLV1Jz7RPyPuo`.
- Package: `vite build` output plus `api/`, with `api/_lib/owner-phones.sqlite.gz` and `api/_lib/clients-data.js` carried over from production (not committed).
- Summary: with the extension, the WhatsApp tab is WhatsApp Web at full width, with an "Open in a WhatsApp tab (Eazybe)" button. The side list and the prefilled "Message a lead" list are removed.

## 2026-10-07 19:53 +04 — WhatsApp Web in the WhatsApp tab

- Deployment: `dpl_Hq2SQaHQhYdBwDiFLV1Jz7RPyPuo` (`map-o97ghkvy0`, production, crm.mahmouddxb.com). Approved by Mahmoud after the preview.
- Branch/commit: `cursor/whatsapp-web-qr-addb` / `4cdf07a5357c2a06f2a43ff9b9123c5c8c7cb44a`, built from main `55a95e3` (`npm ci && npm run build`, check-bundle-pii clean, 46 tests pass).
- Backup: previous production was `dpl_4Hf9FC95Z2swGV8TpoNyoHZfMxRg` (`map-9nvkhm2og`). It was a CLI deploy with no git commit. Its Leads changes (Source/Status menus, WhatsApp avatars, no Owner column, Ask MonTaser logo) are now in source in the commit above. Tag `backup-20261007-1953` is on main `55a95e3`, the nearest commit. Rollback: `vercel promote dpl_4Hf9FC95Z2swGV8TpoNyoHZfMxRg`.
- Package: `vite build` output plus `api/`, with two server files carried over from the previous production deployment and not committed: `api/_lib/owner-phones.sqlite.gz` (owner search) and `api/_lib/clients-data.js` (client rows; production has no `CLIENTS_JSON`).
- Summary: the WhatsApp tab shows WhatsApp Web inside the CRM with the Ask MonTaser Chrome extension (`/whatsapp-crm-extension.zip`), or opens it in a docked window without it. Every Message and Open chat button goes to that linked WhatsApp Web.

## 2026-10-04 08:32 +04 — repo sync of production (no deploy)

- Deployment: `dpl_AnHz59SJPVbayEVR7FdLm3n7CzAD` (Vercel project `map-crm`, already live). This change only syncs the repo to that production source. No deploy.
- Branch/commit: `cursor/secondary-live-trello-sync-0c9a` / `db57cfffb4876abdd3573b6ac6c3af1dd9f6830a` merged to `main`
- Summary: Secondary map loads live from the Trello Secondary board. `/api/secondary` is the first rewrite to `/api/clients?feed=secondary` (no new serverless function). Side panel text no longer doubles "the" (The Oasis reads "Near The Oasis centre").
