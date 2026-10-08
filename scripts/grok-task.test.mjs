import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_BOT_ID,
  agentUrl,
  calendarTaskPrompt,
  followupUrl,
  grokBotId,
  grokConnected,
  plannerBotId,
  sendGrokTask,
  taskPrompt,
} from '../api/_lib/grok-task.js'

test('a follow-up date becomes a Grok calendar task on mahmoud1594@gmail.com', () => {
  const text = calendarTaskPrompt({ leadId: 'L1', date: '2026-10-12', name: 'Test Lead', project: 'The Acres' })
  assert.match(text, /calendar: mahmoud1594@gmail\.com/)
  assert.match(text, /title: Follow up: Test Lead/)
  assert.match(text, /start: 2026-10-12 10:00, end: 2026-10-12 10:30, time zone Asia\/Dubai/)
  assert.match(text, /CRM lead id: L1/)
  assert.match(text, /Do not change any code/)
  const cleared = calendarTaskPrompt({ leadId: 'L1', date: '', name: 'Test Lead', project: '' })
  assert.match(cleared, /Delete every match/)
  assert.doesNotMatch(cleared, /title:/)
})

test('follow-ups go to the Planner bot, else the Grok bot', () => {
  assert.equal(plannerBotId({}), DEFAULT_BOT_ID)
  assert.equal(plannerBotId({ PLANNER_BOT_ID: 'bc-11111111-2222-3333-4444-555555555555' }), 'bc-11111111-2222-3333-4444-555555555555')
  assert.equal(plannerBotId({ PLANNER_BOT_ID: 'nope' }), DEFAULT_BOT_ID)
})

test('no Cursor key means no Grok calendar task', async () => {
  assert.equal(await sendGrokTask('x', {}), false)
})

test('the CRM uses one Grok bot', () => {
  assert.equal(grokBotId({}), DEFAULT_BOT_ID)
  assert.equal(followupUrl(DEFAULT_BOT_ID), `https://api.cursor.com/v0/agents/${DEFAULT_BOT_ID}/followup`)
  assert.equal(agentUrl(DEFAULT_BOT_ID), `https://cursor.com/agents/${DEFAULT_BOT_ID}`)
  assert.equal(grokBotId({ GROK_BOT_ID: 'bc-11111111-2222-3333-4444-555555555555' }), 'bc-11111111-2222-3333-4444-555555555555')
  assert.throws(() => grokBotId({ GROK_BOT_ID: 'not-a-bot' }))
})

test('a task is sent as a CRM follow-up', () => {
  assert.equal(taskPrompt('  Publish the leads page  '), 'Task from MahmoudDXB CRM.\n\nPublish the leads page')
  assert.equal(grokConnected({}), false)
  assert.equal(grokConnected({ CURSOR_API_KEY: 'key_test' }), true)
  assert.throws(() => taskPrompt('   '))
  assert.throws(() => taskPrompt('x'.repeat(4001)))
})
