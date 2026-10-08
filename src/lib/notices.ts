export interface NoticeLead {
  lead_id: string
  name: string
  status: string
  next_action_date: string
  project_or_community: string
}

export interface NoticeEvent {
  id: string
  title: string
  start: string
  end: string
  allDay?: boolean
}

export interface Notice {
  id: string
  kind: 'overdue' | 'due' | 'reminder'
  title: string
  detail: string
  leadId?: string
}

const FILED = new Set(['archived', 'lost'])

export function dubaiDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function dubaiTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Dubai',
  }).format(new Date(ms))
}

/** Due and overdue lead follow-ups, plus today's reminders and anything starting within 90 minutes. */
export function buildNotices(leads: NoticeLead[], events: NoticeEvent[], now: Date): Notice[] {
  const today = dubaiDay(now.toISOString())
  const nowMs = now.getTime()
  const notices: Notice[] = []
  const followNames = new Set<string>()

  for (const lead of leads) {
    if (FILED.has(lead.status)) continue
    const date = String(lead.next_action_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue
    const name = lead.name.trim() || 'Lead'
    followNames.add(name.toLowerCase())
    const where = lead.project_or_community.trim()
    notices.push({
      id: `lead:${lead.lead_id}`,
      kind: date < today ? 'overdue' : 'due',
      title: name,
      detail: date < today ? `Overdue follow-up · ${date}` : where ? `Due today · ${where}` : 'Due today',
      leadId: lead.lead_id,
    })
  }

  for (const event of events) {
    const title = event.title.trim() || 'Reminder'
    if (/^follow up:/i.test(title)) {
      const who = title.replace(/^follow up:\s*/i, '').trim().toLowerCase()
      if (followNames.has(who)) continue
    }
    const day = dubaiDay(event.start)
    const startMs = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(event.start) ? `${event.start}T10:00:00+04:00` : event.start)
    const endMs = Date.parse(event.end || '')
    const ended = !Number.isNaN(endMs) && endMs < nowMs
    const reminder = /reminder/i.test(title)
    const soon = !Number.isNaN(startMs) && startMs >= nowMs && startMs - nowMs <= 90 * 60 * 1000
    const todayReminder = reminder && day === today && !ended
    if (!soon && !todayReminder) continue
    notices.push({
      id: `event:${event.id}`,
      kind: 'reminder',
      title,
      detail: Number.isNaN(startMs) ? 'Reminder' : `Reminder · ${dubaiTime(startMs)}`,
    })
  }

  const rank = { overdue: 0, due: 1, reminder: 2 }
  notices.sort((a, b) => rank[a.kind] - rank[b.kind] || a.detail.localeCompare(b.detail) || a.title.localeCompare(b.title))
  return notices.slice(0, 30)
}
