import { useEffect, useRef, useState } from 'react'
import DeveloperMark from './DeveloperMark'
import type { MaterialKind, MaterialLink, Project, ProjectPhoto } from '../types'
import ReportIssueButton from './ReportIssue'
import {
  bookingHref,
  formatAed,
  projectFacts,
  sourceLabel,
  WHATSAPP_DISPLAY,
  whatsappHref,
} from '../lib/format'

interface ProjectDrawerProps {
  project: Project
  hiddenByFilters: boolean
  onClose: () => void
  onBrochure: () => void
}

const KIND_LABEL: Record<MaterialKind, string> = {
  brochure: 'Brochure',
  'floor-plan': 'Floor plans',
  'payment-plan': 'Payment plan',
  'price-list': 'Price list',
  'fact-sheet': 'Fact sheet',
  masterplan: 'Masterplan',
  file: 'File',
}

function chipsFor(project: Project): string[] {
  const chips: string[] = []
  if (project.startingPriceAed != null) chips.push(`From ${formatAed(project.startingPriceAed)}`)
  const beds = projectFacts(project).find((fact) => fact.label === 'Bedrooms')
  if (beds && !beds.missing) chips.push(beds.value)
  if (project.handover) chips.push(project.handover)
  if (project.propertyType) chips.push(project.propertyType)
  if (project.paymentPlan) chips.push(project.paymentPlan)
  if (project.postHandover && project.paymentPlan !== 'Post-handover') chips.push('Post-handover')
  return chips
}

function narrative(notes: string, project: Project): string {
  const echoed = new Set(
    [project.developer, project.area, project.propertyType, project.paymentPlan, project.handover, project.unitsNote, project.psf, project.serviceCharge]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  )
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (/^(type|area|developer \/ project|materials|starting prices by layout|last update|payment plan|payment|pending|handover|units\/stock note|psf|source|completion|handover \/ completion)\b/i.test(line)) {
        return false
      }
      if (line.startsWith('- ')) return false
      if (echoed.has(line.toLowerCase())) return false
      return true
    })
    .join('\n')
    .trim()
}

function Fact({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={missing ? 'missing' : undefined}>{value}</dd>
    </>
  )
}

function Hero({
  project,
  photos,
}: {
  project: Project
  photos: ProjectPhoto[]
}) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const startX = useRef<number | null>(null)
  const count = photos.length
  const safeIndex = count === 0 ? 0 : index % count

  useEffect(() => {
    setIndex(0)
    setOpen(false)
  }, [project.id])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % count)
      if (event.key === 'ArrowLeft') setIndex((current) => (current - 1 + count) % count)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, count])

  if (count === 0) {
    return (
      <div className="hero hero-empty">
        <DeveloperMark projectId={project.id} developer={project.developer} />
        <p>No building photo on this card</p>
      </div>
    )
  }

  const photo = photos[safeIndex]
  function step(delta: number) {
    setIndex((current) => (current + delta + count) % count)
  }

  const frame = (
    <div
      className="hero-frame"
      onPointerDown={(event) => {
        startX.current = event.clientX
      }}
      onPointerUp={(event) => {
        if (startX.current == null) return
        const delta = event.clientX - startX.current
        startX.current = null
        if (delta > 40) step(-1)
        else if (delta < -40) step(1)
      }}
    >
      <button type="button" className="hero-open" onClick={() => setOpen(true)} aria-label="View photo full screen">
        <img src={photo.src} alt={photo.alt} />
      </button>
      {count > 1 ? (
        <>
          <button
            type="button"
            className="hero-nav prev"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => step(-1)}
            aria-label="Previous photo"
          >
            ‹
          </button>
          <button
            type="button"
            className="hero-nav next"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => step(1)}
            aria-label="Next photo"
          >
            ›
          </button>
          <div className="hero-dots" role="tablist" aria-label="Photos">
            {photos.map((item, dot) => (
              <button
                key={item.src}
                type="button"
                className={dot === safeIndex ? 'on' : ''}
                aria-label={`Photo ${dot + 1}`}
                onClick={() => setIndex(dot)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <>
      {frame}
      {open ? (
        <div className="lightbox" role="dialog" aria-label={`${project.name} photo`}>
          <button type="button" className="lightbox-close" onClick={() => setOpen(false)} aria-label="Close photo">
            ×
          </button>
          <img src={photo.src} alt={photo.alt} />
          {count > 1 ? (
            <div className="lightbox-nav">
              <button type="button" onClick={() => step(-1)} aria-label="Previous photo">
                ‹
              </button>
              <span>
                {safeIndex + 1} / {count}
              </span>
              <button type="button" onClick={() => step(1)} aria-label="Next photo">
                ›
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function FileIcon({ kind }: { kind: MaterialKind }) {
  return (
    <svg className="file-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M14 3.5V9h5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text x="12" y="17" textAnchor="middle" fontSize="5.2" fontFamily="inherit" fill="currentColor">
        {kind === 'floor-plan' ? 'FP' : kind === 'price-list' ? 'PR' : kind === 'fact-sheet' ? 'FS' : kind === 'masterplan' ? 'MP' : kind === 'payment-plan' ? 'PP' : kind === 'brochure' ? 'PDF' : 'FILE'}
      </text>
    </svg>
  )
}

function MaterialButton({ link }: { link: MaterialLink }) {
  return (
    <a className="material-btn" href={link.url} target="_blank" rel="noopener noreferrer">
      <FileIcon kind={link.kind} />
      <span>
        <strong>{KIND_LABEL[link.kind]}</strong>
        <small>{link.label}</small>
      </span>
    </a>
  )
}

export default function ProjectDrawer({ project, hiddenByFilters, onClose, onBrochure }: ProjectDrawerProps) {
  const chips = chipsFor(project)
  const notes = narrative(project.notes, project)
  const trelloCard = project.trelloUrl.includes('trello.com')

  return (
    <aside className="drawer" role="dialog" aria-label={project.name}>
      <div className="drawer-scroll">
        <Hero project={project} photos={project.photos} />
        <header className="drawer-sticky">
          <DeveloperMark projectId={project.id} developer={project.developer} />
          <div className="drawer-id">
            <p className="kicker">{project.community}</p>
            <h2>{project.name}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close project">
            ×
          </button>
        </header>
        <div className="drawer-body">
          {project.developer ? <p className="sub">{project.developer}</p> : null}
          {chips.length > 0 ? (
            <div className="fact-chips">
              {chips.map((chip) => (
                <span key={chip} className="tag">
                  {chip}
                </span>
              ))}
              <span className="tag source">{sourceLabel(project.source)}</span>
            </div>
          ) : null}
          {hiddenByFilters ? <p className="hidden-note">Hidden by the current filters.</p> : null}
          <h3>Details</h3>
          <dl className="facts">
            {projectFacts(project).map((fact) => (
              <Fact key={fact.label} label={fact.label} value={fact.value} missing={fact.missing} />
            ))}
            <Fact label="Area" value={project.area?.trim() || '—'} missing={!project.area?.trim()} />
            <Fact label="Type" value={project.propertyType?.trim() || '—'} missing={!project.propertyType?.trim()} />
            <Fact label="Units" value={project.unitsNote?.trim() || '—'} missing={!project.unitsNote?.trim()} />
            <Fact label="PSF" value={project.psf?.trim() || '—'} missing={!project.psf?.trim()} />
          </dl>
          {project.paymentPlanNotes ? (
            <>
              <h3>Payment plan notes</h3>
              <p className="notes card-text">{project.paymentPlanNotes}</p>
            </>
          ) : null}
          {project.layouts.length > 0 ? (
            <>
              <h3>Pricing and layouts</h3>
              <ul className="layouts">
                {project.layouts.map((layout) => (
                  <li key={`${layout.label}-${layout.text}`}>
                    <span>{layout.label}</span>
                    <span>{layout.amountAed != null ? formatAed(layout.amountAed) : layout.text}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {project.pinNote ? (
            <>
              <h3>Location</h3>
              <p className="pin-note">{project.pinNote}</p>
            </>
          ) : null}
          {project.materials.length > 0 ? (
            <>
              <h3>Materials</h3>
              <div className="material-list">
                {project.materials.map((link) => (
                  <MaterialButton key={link.url} link={link} />
                ))}
              </div>
            </>
          ) : null}
          {notes ? (
            <>
              <h3>From the card</h3>
              <p className="notes card-text">{notes}</p>
            </>
          ) : null}
        </div>
      </div>
      <footer className="drawer-actions">
        {trelloCard ? (
          <a className="btn trello" href={project.trelloUrl} target="_blank" rel="noopener noreferrer">
            Open in Trello
          </a>
        ) : project.trelloUrl.includes('portal.mpd.ae') ? (
          <a className="btn ghost" href={project.trelloUrl} target="_blank" rel="noopener noreferrer">
            Open portal listing
          </a>
        ) : null}
        <a className="btn whatsapp" href={whatsappHref(project)} target="_blank" rel="noreferrer">
          WhatsApp
          <small>{WHATSAPP_DISPLAY}</small>
        </a>
        <a className="btn book" href={bookingHref(project)} target="_blank" rel="noreferrer">
          Book a viewing
          <small>WhatsApp {WHATSAPP_DISPLAY}</small>
        </a>
        {project.materials.length === 0 ? (
          <button type="button" className="btn ghost" onClick={onBrochure}>
            Brochure
          </button>
        ) : null}
        <ReportIssueButton
          record={{
            name: project.name,
            project: project.name,
            dealId: '',
            source: project.trelloUrl.includes('portal.mpd.ae') ? 'Portal listing' : 'Trello Dubai',
          }}
        />
      </footer>
    </aside>
  )
}
