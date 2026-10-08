import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNotices, type NoticeEvent, type NoticeLead } from '../src/lib/notices.ts'

const now = new Date('2026-10-08T08:00:00+04:00')

function lead(partial: Partial<NoticeLead> & Pick<NoticeLead, 'lead_id' | 'next_action_date'>): NoticeLead {
  return {
    name: 'Sara',
    status: 'new',
    project_or_community: 'Marina',
    ...partial,
  }
}

test('due and overdue follow-ups show, later and archived ones do not', () => {
  const notices = buildNotices(
    [
      lead({ lead_id: 'due-1', next_action_date: '2026-10-08', name: 'Due today' }),
      lead({ lead_id: 'late-1', next_action_date: '2026-10-01', name: 'Late one' }),
      lead({ lead_id: 'soon-1', next_action_date: '2026-10-20', name: 'Later' }),
      lead({ lead_id: 'gone-1', next_action_date: '2026-10-08', name: 'Filed', status: 'archived' }),
    ],
    [],
    now,
  )
  assert.deepEqual(
    notices.map((item) => item.kind + ':' + item.title),
    ['overdue:Late one', 'due:Due today'],
  )
  assert.equal(notices[0].leadId, 'late-1')
  assert.match(notices[1].detail, /Due today/)
})

test('a reminder today shows, and a follow-up event is not repeated', () => {
  const events: NoticeEvent[] = [
    { id: 'r1', title: 'Reminder: call back', start: '2026-10-08T14:00:00+04:00', end: '2026-10-08T14:30:00+04:00' },
    { id: 'f1', title: 'Follow up: Due today', start: '2026-10-08T10:00:00+04:00', end: '2026-10-08T10:30:00+04:00' },
    { id: 'old', title: 'Reminder: yesterday', start: '2026-10-07T09:00:00+04:00', end: '2026-10-07T09:30:00+04:00' },
  ]
  const notices = buildNotices([lead({ lead_id: 'due-1', next_action_date: '2026-10-08', name: 'Due today' })], events, now)
  assert.deepEqual(
    notices.map((item) => item.title),
    ['Due today', 'Reminder: call back'],
  )
  assert.equal(notices[1].kind, 'reminder')
  assert.match(notices[1].detail, /14:00/)
})
