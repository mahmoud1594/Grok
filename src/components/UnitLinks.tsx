import { formatUnitPhone, unitTrelloHref, unitWhatsappHref, type Unit } from '../lib/units'

function TrelloIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6.5" y="6.5" width="4.5" height="8" rx="1" fill="currentColor" />
      <rect x="13" y="6.5" width="4.5" height="5" rx="1" fill="currentColor" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.4a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2Zm5.76 14.15c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.12.1-1.81-.11-.41-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.26.64-.38 1.02-.38h.73c.23 0 .54-.09.85.65.32.77 1.08 2.64 1.17 2.83.1.19.16.42.03.67-.13.26-.2.42-.39.64-.19.23-.4.5-.58.68-.19.19-.39.39-.17.74.23.35 1 1.65 2.15 2.67 1.48 1.32 2.72 1.73 3.1 1.92.38.19.6.16.82-.1.23-.26.96-1.12 1.22-1.5.26-.39.51-.32.85-.19.35.13 2.2 1.04 2.58 1.23.38.19.63.29.72.45.1.16.1.94-.14 1.62Z"
      />
    </svg>
  )
}

function WhatsAppIconLink({ unit }: { unit: Unit }) {
  const href = unitWhatsappHref(unit)
  if (!href || !unit.phone) return null
  const label = `WhatsApp ${formatUnitPhone(unit.phone)}`
  return (
    <a className="unit-icon unit-icon-wa" href={href} target="_blank" rel="noopener" aria-label={label} title={label}>
      <WhatsAppIcon />
    </a>
  )
}

/** WhatsApp and Trello icons, same size. Each stays hidden when that row has no link. */
export function UnitIconPair({ unit }: { unit: Unit }) {
  const trelloHref = unitTrelloHref(unit.trelloUrl)
  const href = unitWhatsappHref(unit)
  if (!href && !trelloHref) return null
  return (
    <div className="unit-icon-links">
      <WhatsAppIconLink unit={unit} />
      {trelloHref ? (
        <a className="unit-icon unit-icon-trello" href={trelloHref} target="_blank" rel="noopener" aria-label="Open in Trello" title="Open in Trello">
          <TrelloIcon />
        </a>
      ) : null}
    </div>
  )
}

/** Open in Trello on the details panel and the secondary card. The large WhatsApp button stays separate. */
export function UnitTrelloRow({ unit }: { unit: Unit }) {
  const trelloHref = unitTrelloHref(unit.trelloUrl)
  if (!trelloHref) return null
  return (
    <div className="unit-icon-links">
      <a className="btn ghost" href={trelloHref} target="_blank" rel="noopener">
        Open in Trello
      </a>
    </div>
  )
}
