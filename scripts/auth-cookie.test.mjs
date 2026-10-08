import assert from 'node:assert/strict'
import test from 'node:test'
import { cookieDomainFor, setSessionCookies, clearSessionCookies, cookiePair, ALLOWED_ORIGINS } from '../api/_lib/auth.js'

function mockRes() {
  const headers = {}
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value
    },
  }
}

test('shared domain only on mahmouddxb.com hosts', () => {
  assert.equal(cookieDomainFor({ headers: { host: 'crm.mahmouddxb.com' } }), '.mahmouddxb.com')
  assert.equal(cookieDomainFor({ headers: { host: 'www.mahmouddxb.com' } }), '.mahmouddxb.com')
  assert.equal(cookieDomainFor({ headers: { host: 'mahmouddxb.com' } }), '.mahmouddxb.com')
  assert.equal(cookieDomainFor({ headers: { host: 'CRM.MahmoudDXB.com' } }), '.mahmouddxb.com')
  assert.equal(cookieDomainFor({ headers: { host: 'map-crm-abc.vercel.app' } }), '')
  assert.equal(cookieDomainFor({ headers: { host: 'localhost:3000' } }), '')
  assert.equal(cookieDomainFor({ headers: { host: '127.0.0.1:4173' } }), '')
  assert.equal(cookieDomainFor({ headers: { host: 'notmahmouddxb.com' } }), '')
})

test('askmontaser.ae hosts share .askmontaser.ae; look-alikes stay host-only', () => {
  assert.equal(cookieDomainFor({ headers: { host: 'crm.askmontaser.ae' } }), '.askmontaser.ae')
  assert.equal(cookieDomainFor({ headers: { host: 'www.askmontaser.ae' } }), '.askmontaser.ae')
  assert.equal(cookieDomainFor({ headers: { host: 'askmontaser.ae' } }), '.askmontaser.ae')
  assert.equal(cookieDomainFor({ headers: { host: 'notaskmontaser.ae' } }), '')
  assert.equal(cookieDomainFor({ headers: { host: 'askmontaser.ae.evil.com' } }), '')
})

test('CORS allows the CRM and site on both domains only', () => {
  for (const o of ['https://crm.askmontaser.ae', 'https://www.askmontaser.ae', 'https://askmontaser.ae', 'https://crm.mahmouddxb.com']) assert.ok(ALLOWED_ORIGINS.has(o), o)
  for (const o of ['http://crm.askmontaser.ae', 'https://evil.askmontaser.ae', 'https://askmontaser-crm-preview.vercel.app']) assert.ok(!ALLOWED_ORIGINS.has(o), o)
})

test('host-only cookies keep Secure, HttpOnly, and SameSite', () => {
  const res = mockRes()
  setSessionCookies(res, 'tok', 'crm-test', { headers: { host: 'localhost:4173' } })
  const cookies = res.headers['Set-Cookie']
  assert.equal(cookies.length, 2)
  assert.match(cookies[0], /^mdxb_listing_check_token=/)
  assert.match(cookies[0], /HttpOnly/)
  assert.match(cookies[0], /Secure/)
  assert.match(cookies[0], /SameSite=Lax/)
  assert.doesNotMatch(cookies[0], /Domain=/)
  assert.doesNotMatch(cookies[1], /Domain=/)
})

test('mahmouddxb.com cookies set Domain and logout clears both scopes', () => {
  const res = mockRes()
  setSessionCookies(res, 'tok', 'crm-test', { headers: { host: 'crm.mahmouddxb.com' } })
  assert.match(res.headers['Set-Cookie'][0], /Domain=\.mahmouddxb\.com/)
  assert.match(res.headers['Set-Cookie'][0], /HttpOnly/)
  const cleared = mockRes()
  clearSessionCookies(cleared, { headers: { host: 'crm.mahmouddxb.com' } })
  const joined = cleared.headers['Set-Cookie'].join('\n')
  assert.match(joined, /Domain=\.mahmouddxb\.com/)
  assert.match(joined, /Max-Age=0/)
  assert.match(cookiePair('n', 'v', { httpOnly: true, domain: '.mahmouddxb.com' }), /HttpOnly/)
})
