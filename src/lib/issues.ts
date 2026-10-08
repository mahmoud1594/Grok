export interface IssueRecord {
  name: string
  project: string
  dealId: string
  source: string
}

export interface Issue {
  id: number
  createdAt: string
  status: 'open' | 'fixed'
  what: string
  field: string
  record: IssueRecord
}

const KEY = 'mdxb-issues'

export function loadIssues(): Issue[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Issue[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveIssues(issues: Issue[]): void {
  localStorage.setItem(KEY, JSON.stringify(issues))
}

export function createIssue(input: { what: string; field: string; record: IssueRecord }): Issue {
  const issues = loadIssues()
  const nextId = issues.reduce((max, issue) => Math.max(max, issue.id), 0) + 1
  const issue: Issue = {
    id: nextId,
    createdAt: new Date().toISOString(),
    status: 'open',
    what: input.what.trim(),
    field: input.field,
    record: input.record,
  }
  saveIssues([issue, ...issues])
  return issue
}

export function setIssueStatus(id: number, status: Issue['status']): Issue[] {
  const issues = loadIssues().map((issue) => (issue.id === id ? { ...issue, status } : issue))
  saveIssues(issues)
  return issues
}

export function ticketText(issue: Issue): string {
  return [
    `Ticket #${issue.id}`,
    `What's wrong: ${issue.what || 'Not stated'}`,
    `Field: ${issue.field}`,
    `Name: ${issue.record.name || 'Not on record'}`,
    `Project: ${issue.record.project || 'Not on record'}`,
    `Deal id: ${issue.record.dealId || 'Not on record'}`,
    `Source: ${issue.record.source}`,
  ].join('\n')
}

export function ticketWhatsappHref(issue: Issue): string {
  return `https://wa.me/971542000142?text=${encodeURIComponent(ticketText(issue))}`
}
