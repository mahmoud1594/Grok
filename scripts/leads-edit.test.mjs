import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const file = path.join(os.tmpdir(), `leads-edit-${process.pid}.json`)
fs.writeFileSync(file, JSON.stringify([{ lead_id: 'L1', name: 'Ali', phone: '971500000000' }]))
process.env.LEADS_BACKEND = 'mock'
process.env.LEADS_MOCK_FILE = file

const { updateLead, deleteLead, listLeads, rowsToLeads, leadRowNumber, clearCache } = await import('../api/_lib/leads-store.js')
const { recordToLead, patchToFields } = await import('../api/_lib/airtable-leads.js')

test('a lead name and comment can be saved', async () => {
  const saved = await updateLead('L1', { name: '  Sara Ali  ', comment: 'Wants a 2 bed in Dubai Marina' })
  assert.equal(saved.name, 'Sara Ali')
  assert.equal(saved.comment, 'Wants a 2 bed in Dubai Marina')
  const listed = await listLeads({ fresh: true })
  assert.equal(listed.leads[0].name, 'Sara Ali')
  assert.equal(listed.leads[0].comment, 'Wants a 2 bed in Dubai Marina')
  fs.unlinkSync(file)
})

test('a sheet that starts with a lead is not treated as a header', () => {
  const rows = rowsToLeads([
    ['c2c6564f-8297-4875-b008-74a9fea85c8a', '2026-10-02T05:42:28+04:00', 'website_form', 'TEST Lead'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'comment'],
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'TEST Lead')
  assert.equal(rows[0].lead_id, 'c2c6564f-8297-4875-b008-74a9fea85c8a')
})

test('a lead_id header row is skipped', () => {
  const rows = rowsToLeads([
    ['lead_id', 'created_at', 'source', 'name'],
    ['L1', '2026-10-02T05:42:28+04:00', 'bitrix', 'Ali'],
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Ali')
})

test('archive keeps the row and delete removes it', async () => {
  const own = path.join(os.tmpdir(), `leads-archive-${process.pid}.json`)
  fs.writeFileSync(own, JSON.stringify([
    { lead_id: 'A', name: 'One', status: 'new' },
    { lead_id: 'B', name: 'Two', status: 'new' },
  ]))
  process.env.LEADS_MOCK_FILE = own
  clearCache()
  const archived = await updateLead('A', { status: 'archived' })
  assert.equal(archived.status, 'archived')
  await assert.rejects(() => updateLead('B', { status: 'junk' }), (error) => error.code === 400)
  const removed = await deleteLead('B')
  assert.equal(removed.lead_id, 'B')
  const listed = await listLeads({ fresh: true })
  assert.deepEqual(listed.leads.map((lead) => lead.lead_id), ['A'])
  await assert.rejects(() => deleteLead('B'), (error) => error.code === 404)
  fs.unlinkSync(own)
})

test('an Airtable record maps onto a CRM lead', () => {
  const lead = recordToLead({
    id: 'recABCDEFGHIJKLMN',
    createdTime: '2026-10-08T08:00:00.000Z',
    fields: { Name: 'Sara', Status: 'Contacted', Project: 'Marina', 'Next action': '2026-10-10', Phone: '+971500000000' },
  })
  assert.equal(lead.lead_id, 'recABCDEFGHIJKLMN')
  assert.equal(lead.status, 'contacted')
  assert.equal(lead.project_or_community, 'Marina')
  assert.equal(lead.next_action_date, '2026-10-10')
  assert.deepEqual(patchToFields({ status: 'lost', next_action_date: '', name: 'Sara Ali' }), {
    Status: 'Lost',
    'Next action': null,
    Name: 'Sara Ali',
  })
})

test('a lead in row 1 is updated on row 1', () => {
  const column = [
    ['c2c6564f-8297-4875-b008-74a9fea85c8a'],
    [''],
    ['L2'],
  ]
  assert.equal(leadRowNumber(column, 'c2c6564f-8297-4875-b008-74a9fea85c8a'), 1)
  assert.equal(leadRowNumber(column, 'L2'), 3)
  assert.equal(leadRowNumber(column, 'missing'), 0)
  assert.equal(leadRowNumber([['lead_id'], ['L1']], 'L1'), 2)
})
