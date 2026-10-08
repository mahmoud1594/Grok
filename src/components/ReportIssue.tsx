import { useState } from 'react'
import { createPortal } from 'react-dom'
import { createIssue, ticketText, ticketWhatsappHref, type Issue, type IssueRecord } from '../lib/issues'

const FIELDS = ['Name', 'Phone', 'Status', 'Project', 'Price', 'Location', 'Photos', 'Other']

interface ReportIssueButtonProps {
  record: IssueRecord
}

export default function ReportIssueButton({ record }: ReportIssueButtonProps) {
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState('')
  const [field, setField] = useState('Name')
  const [ticket, setTicket] = useState<Issue | null>(null)
  const [copied, setCopied] = useState(false)

  const ensure = () => {
    if (ticket) return ticket
    const created = createIssue({ what, field, record })
    setTicket(created)
    return created
  }

  const dialog = open
    ? createPortal(
        <div className="issue-root">
          <button type="button" className="issue-backdrop" aria-label="Close report" onClick={() => setOpen(false)} />
          <form
            className="issue-card"
            onSubmit={(event) => {
              event.preventDefault()
              ensure()
            }}
          >
            <header>
              <h2>Report issue</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>
            <dl className="facts">
              <dt>Name</dt>
              <dd>{record.name || 'Not on record'}</dd>
              <dt>Project</dt>
              <dd>{record.project || 'Not on record'}</dd>
              <dt>Deal id</dt>
              <dd>{record.dealId || 'Not on record'}</dd>
              <dt>Source</dt>
              <dd>{record.source}</dd>
            </dl>
            <label className="issue-field">
              Which field
              <select value={field} onChange={(event) => setField(event.target.value)} aria-label="Which field">
                {FIELDS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="issue-field">
              What's wrong
              <textarea value={what} onChange={(event) => setWhat(event.target.value)} aria-label="What's wrong" />
            </label>
            {ticket ? <p className="pin-note">Ticket #{ticket.id} saved on this device.</p> : null}
            <div className="issue-actions">
              <a
                className="btn whatsapp"
                href={ticket ? ticketWhatsappHref(ticket) : '#report'}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  const saved = ensure()
                  const href = ticketWhatsappHref(saved)
                  if ((event.currentTarget as HTMLAnchorElement).href.endsWith('#report')) {
                    event.preventDefault()
                    window.open(href, '_blank', 'noopener')
                  }
                }}
              >
                Send via WhatsApp
              </a>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  const saved = ensure()
                  try {
                    await navigator.clipboard.writeText(ticketText(saved))
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy ticket'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button type="button" className="btn ghost report-issue" onClick={() => setOpen(true)}>
        Report issue
      </button>
      {dialog}
    </>
  )
}
