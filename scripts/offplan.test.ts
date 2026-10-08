import assert from 'node:assert/strict'
import test from 'node:test'
import { floorCount, projectSetting, trelloNewLaunch } from '../src/lib/offplan.ts'
import { sameProject } from '../src/lib/developers.ts'

test('waterfront and inland come from the list and area', () => {
  assert.equal(projectSetting({ community: 'Other waterfront', area: null, name: 'Kanyon' }), 'waterfront')
  assert.equal(projectSetting({ community: 'Dubai Islands', area: 'Dubai Islands', name: 'Lia' }), 'waterfront')
  assert.equal(projectSetting({ community: 'Creek Harbour', area: null, name: 'Valia' }), 'waterfront')
  assert.equal(projectSetting({ community: 'Other inland', area: 'Dubai Hills Estate', name: 'Vida' }), 'inland')
  assert.equal(projectSetting({ community: 'Dubai South', area: null, name: 'Greenway 2' }), 'inland')
})

test('floor counts are read from the card when stated', () => {
  assert.equal(floorCount('Tower is G+45 with podium'), 'G+45')
  assert.equal(floorCount('2B+G+4P+38 levels'), '2B+G+4P+38')
  assert.equal(floorCount('A 52-storey tower'), '52 floors')
  assert.equal(floorCount('floor 9, 2BR Type H'), null)
  assert.equal(floorCount('Floor plans pending'), null)
})

test('new launch follows the card text', () => {
  assert.equal(trelloNewLaunch({ name: 'Hayat Phase 7', notes: 'Launch: LAUNCHING TOMORROW' }), true)
  assert.equal(trelloNewLaunch({ name: 'Port De La Mer', notes: 'Unit options — not a new launch price list.' }), false)
  assert.equal(trelloNewLaunch({ name: 'Kanyon', notes: 'Inventory 17 Sep' }), false)
})

test('a news project matches its Trello card', () => {
  assert.equal(sameProject({ developer: 'Beyond', name: 'Hado By Beyond' }, { developer: 'Beyond', name: 'Hado' }), true)
  assert.equal(sameProject({ developer: 'Emaar', name: 'Creek Haven' }, { developer: 'Emaar Properties', name: 'creek haven' }), true)
  assert.equal(sameProject({ developer: 'Emaar', name: 'Valia' }, { developer: 'Nakheel', name: 'Valia' }), false)
  assert.equal(sameProject({ developer: 'Emaar', name: 'Valia' }, { developer: '', name: 'Valia' }), true)
  assert.equal(sameProject({ developer: 'Emaar', name: 'Vida' }, { developer: 'Emaar', name: 'Vida Residences Dubai Hills' }), true)
  assert.equal(sameProject({ developer: 'Beyond', name: 'Aria By Beyond' }, { developer: 'Beyond', name: 'Arancia' }), false)
})
