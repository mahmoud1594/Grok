import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTitle, coordsFromText, shapeCard, isDeveloperList, isSoldList } from '../api/_lib/secondary-trello.js'

test('parseTitle: code, known type, beds; unknown word is not a type', () => {
  assert.deepEqual(parseTitle('V-92 Tierra -6BD-20K plot'), { unitCode: 'V-92', unitType: 'Tierra', bedrooms: 6 })
  assert.deepEqual(parseTitle('V-85 Palace Ostra -6BHK'), { unitCode: 'V-85', unitType: 'Palace Ostra', bedrooms: 6 })
  assert.deepEqual(parseTitle('V-297 James-6BD -21K plot'), { unitCode: 'V-297', unitType: null, bedrooms: 6 })
  assert.deepEqual(parseTitle('The Acres – Meraas – Villas'), { unitCode: null, unitType: null, bedrooms: null })
})

test('coordsFromText: maps links and pairs inside Dubai only', () => {
  assert.deepEqual(coordsFromText('https://www.google.com/maps/place/x/@25.0123,55.2345,15z'), { lat: 25.0123, lng: 55.2345 })
  assert.deepEqual(coordsFromText('https://maps.google.com/?q=25.1111,55.2222'), { lat: 25.1111, lng: 55.2222 })
  assert.equal(coordsFromText('https://www.google.com/maps/@51.5,-0.12,15z'), null)
  assert.equal(coordsFromText('V-92 Tierra'), null)
})

test('lists: developers excluded, SOLD detected', () => {
  assert.ok(isDeveloperList('Emaar'))
  assert.ok(isDeveloperList('h&h'))
  assert.ok(!isDeveloperList('The Oasis'))
  assert.ok(isSoldList('SOLD'))
})

test('shapeCard never returns the description', () => {
  const out = shapeCard({ id: 'a'.repeat(24), name: 'V-1 Tierra', desc: 'Owner +971 50 000 0000 fee 2%', labels: [{ name: 'SOLD', color: 'red' }], shortUrl: 'https://trello.com/c/abc', pos: 1 }, 'SOLD', { previousList: 'The Oasis' })
  const text = JSON.stringify(out)
  assert.ok(!text.includes('Owner'))
  assert.ok(!('desc' in out) && !('description' in out))
  assert.equal(out.sold, true)
  assert.equal(out.community, 'The Oasis')
})
