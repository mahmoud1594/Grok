import assert from 'node:assert/strict'
import { test } from 'node:test'
import { whatsappDigits } from '../src/lib/phone.ts'

test('local UAE numbers gain 971 and formatted 971 numbers stay', () => {
  assert.equal(whatsappDigits('050 111 0001'), '971501110001')
  assert.equal(whatsappDigits('+971 50 111 0001'), '971501110001')
  assert.equal(whatsappDigits('00971501110001'), '971501110001')
})

test('other country codes are left as digits', () => {
  assert.equal(whatsappDigits('966501234567'), '966501234567')
})

test('too-short numbers are hidden', () => {
  assert.equal(whatsappDigits('12345'), null)
})
