import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WA_WEB_HOME, toWhatsAppWeb } from '../src/lib/whatsapp-web.ts'

test('wa.me chats open on WhatsApp Web with the message kept', () => {
  assert.equal(
    toWhatsAppWeb('https://wa.me/971542000142?text=Hello%20there'),
    'https://web.whatsapp.com/send?phone=971542000142&text=Hello+there',
  )
  assert.equal(toWhatsAppWeb('https://wa.me/971542000142'), 'https://web.whatsapp.com/send?phone=971542000142')
  assert.equal(toWhatsAppWeb('https://api.whatsapp.com/send?phone=971542000142'), 'https://web.whatsapp.com/send?phone=971542000142')
})

test('group invites open the WhatsApp Web join screen', () => {
  assert.equal(toWhatsAppWeb('https://chat.whatsapp.com/AbC123xyz'), 'https://web.whatsapp.com/accept?code=AbC123xyz')
})

test('anything else falls back to the WhatsApp Web home', () => {
  assert.equal(toWhatsAppWeb('https://wa.me/'), WA_WEB_HOME)
  assert.equal(toWhatsAppWeb('not a url'), WA_WEB_HOME)
  assert.equal(toWhatsAppWeb('https://example.com/x'), WA_WEB_HOME)
})
