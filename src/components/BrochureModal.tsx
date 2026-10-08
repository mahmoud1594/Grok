import type { Project } from '../types'
import { formatAed, formatAedOrMissing, formatOrDash, MISSING, projectFacts, WHATSAPP_DISPLAY } from '../lib/format'
import { BRAND } from '../lib/brand'

interface BrochureModalProps {
  project: Project
  onClose: () => void
}

function show(value: string | null | undefined): string {
  return formatOrDash(value)
}

function FactLine({ label, value, missing }: { label: string; value: string; missing: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={missing ? 'missing' : undefined}>{value}</dd>
    </>
  )
}

export default function BrochureModal({ project, onClose }: BrochureModalProps) {
  return (
    <div
      className="modal-back"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article className="sheet" role="dialog" aria-label={`${project.name} brochure`}>
        <p className="sheet-kicker">{BRAND} · Trello Dubai</p>
        <h2>{project.name}</h2>
        <p className="sub">
          {show(project.developer)} · {project.community}
        </p>
        <p className="price">{formatAedOrMissing(project.startingPriceAed)}</p>
        <p className="price-note">Starting price copied from the Trello card.</p>
        <dl className="facts">
          {projectFacts(project).map((fact) => (
            <FactLine key={fact.label} label={fact.label} value={fact.value} missing={fact.missing} />
          ))}
        </dl>
        {project.paymentPlanNotes ? <p className="pin-note">{project.paymentPlanNotes}</p> : null}
        {project.layouts.length > 0 ? (
          <>
            <h3>Starting prices by layout</h3>
            <ul className="layouts">
              {project.layouts.map((layout) => (
                <li key={`${layout.label}-${layout.text}`}>
                  <span>{layout.label}</span>
                  <span>{layout.amountAed != null ? formatAed(layout.amountAed) : layout.text || MISSING}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="pin-note">{project.pinNote}</p>
        <p className="sheet-foot">
          {BRAND} · Premium Dubai Real Estate · WhatsApp {WHATSAPP_DISPLAY}. Figures are the Trello Dubai
          card as exported. Blank fields were not on the card. This is not an offer and not a substitute for
          the sales purchase agreement.
        </p>
        <div className="sheet-actions no-print">
          <a className="btn" href={project.trelloUrl} target="_blank" rel="noreferrer">
            Open in Trello
          </a>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </article>
    </div>
  )
}
