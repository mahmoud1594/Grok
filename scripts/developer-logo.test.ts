import assert from 'node:assert/strict'
import test from 'node:test'
import { assetRoot, developerInitials, developerMarkKind, logoSlug, logoUrl } from '../src/lib/developer-logo.ts'

test('asset root is the site root for every host', () => {
  assert.equal(assetRoot('crm.mahmouddxb.com'), '/')
  assert.equal(assetRoot('www.mahmouddxb.com'), '/')
  assert.equal(assetRoot('127.0.0.1'), '/')
  assert.equal(assetRoot('localhost'), '/')
})

test('initials come from the developer name', () => {
  assert.equal(developerInitials('Emaar'), 'EM')
  assert.equal(developerInitials('MAG'), 'MA')
  assert.equal(developerInitials('Dubai South'), 'DS')
  assert.equal(developerInitials('R. Evolution'), 'RE')
  assert.equal(developerInitials('DGP / Al Ali'), 'DA')
  assert.equal(developerInitials(''), '')
})

test('a project with no baked file does not invent a logo', () => {
  assert.equal(logoSlug('not-a-card', null), null)
  assert.equal(logoSlug('not-a-card', 'No Such Developer'), null)
  assert.equal(developerMarkKind('not-a-card', null), 'none')
  assert.equal(developerMarkKind('not-a-card', 'No Such Developer'), 'initials')
  assert.equal(logoSlug('not-a-card', 'Emaar'), 'emaar')
  assert.equal(developerMarkKind('not-a-card', 'Emaar'), 'logo')
  assert.equal(logoUrl('emaar', 'crm.mahmouddxb.com'), '/assets/developer-logos/emaar.png')
  assert.equal(logoUrl('emaar', 'www.mahmouddxb.com'), '/assets/developer-logos/emaar.png')
  assert.equal(logoUrl('emaar', 'localhost'), '/assets/developer-logos/emaar.png')
})
