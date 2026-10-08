import test from 'node:test'
import assert from 'node:assert/strict'
import { normPhone } from '../api/_lib/owner-search.js'

test('owner phone input formats normalise to the same key', () => {
  for (const raw of ['+971 50 123 4567', '00971501234567', '971501234567', '050-123-4567', '0501234567', '501234567', ' +971-50-123-4567 ']) {
    assert.equal(normPhone(raw), '501234567')
  }
  assert.equal(normPhone('+966 56 000 0000'), '966560000000')
  assert.equal(normPhone(''), '')
})
