import assert from 'node:assert/strict'
import test from 'node:test'
import { matchPath, pathForCommunity, pathForRoute, pathForTab, redirectPath, SHELL_CHILDREN, tabFromMatch } from '../src/lib/routes.ts'
import { slugify } from '../src/lib/slug.ts'

test('standalone paths have no /crm prefix', () => {
  assert.equal(pathForTab('leads'), '/')
  assert.equal(pathForTab('map'), '/map')
  assert.equal(pathForTab('clients'), '/clients')
  assert.equal(pathForTab('units'), '/units')
  assert.equal(pathForTab('secondary'), '/secondary')
  assert.equal(pathForCommunity('tilal-al-ghaf'), '/secondary/tilal-al-ghaf')
  assert.equal(pathForTab('news'), '/news')
  assert.equal(pathForTab('calendar'), '/calendar')
  assert.equal(pathForTab('whatsapp'), '/whatsapp')
  assert.equal(pathForRoute('offplan'), '/units/off-plan')
  assert.equal(pathForRoute('leads'), '/')
})

test('the shell layout lists the child routes', () => {
  assert.deepEqual(
    SHELL_CHILDREN.map((route) => route.pattern),
    [
      '/',
      '/map',
      '/clients',
      '/units',
      '/units/off-plan',
      '/leads',
      '/secondary',
      '/secondary/:communitySlug',
      '/news',
      '/calendar',
      '/whatsapp',
      '/listings-check',
      '/email',
      '/settings',
    ],
  )
})

test('deep links map back to sections', () => {
  assert.equal(matchPath('/').id, 'leads')
  assert.equal(matchPath('/leads').id, 'leads')
  assert.equal(matchPath('/leads/').id, 'leads')
  assert.equal(matchPath('/map').id, 'map')
  assert.equal(matchPath('/clients').id, 'clients')
  assert.equal(matchPath('/units').id, 'units')
  assert.equal(matchPath('/secondary').id, 'secondary')
  assert.equal(matchPath('/secondary/tilal-al-ghaf').id, 'secondary-community')
  assert.equal(matchPath('/secondary/tilal-al-ghaf').params.communitySlug, 'tilal-al-ghaf')
  assert.equal(matchPath('/units/off-plan').id, 'offplan')
  assert.equal(tabFromMatch(matchPath('/units/off-plan')), 'units')
  assert.equal(matchPath('/news').id, 'news')
  assert.equal(matchPath('/calendar').id, 'calendar')
  assert.equal(matchPath('/whatsapp').id, 'whatsapp')
  assert.equal(matchPath('/settings').id, 'settings')
  assert.equal(matchPath('/email').id, 'email')
  assert.equal(matchPath('/missing').id, 'leads')
  assert.equal(redirectPath('/crm'), '/')
  assert.equal(redirectPath('/crm/'), '/')
  assert.equal(redirectPath('/leads'), null)
})

test('community names slugify the same way as their pages', () => {
  assert.equal(slugify('Tilal Al Ghaf'), 'tilal-al-ghaf')
  assert.equal(slugify('AR 1'), 'ar-1')
  assert.equal(slugify('Arabian Ranches 1'), 'arabian-ranches-1')
  assert.equal(slugify('Nad Al Sheba Gardens'), 'nad-al-sheba-gardens')
})
