import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPayment } from '../src/lib/payment-plan.ts'

test('raw card notes become canonical plan labels', () => {
  assert.deepEqual(classifyPayment('60/40'), {
    label: '60/40',
    bucket: '60/40',
    postHandover: false,
    notes: null,
  })
  assert.equal(classifyPayment('40/60 (some posts 60/40)').label, '40/60')
  assert.equal(classifyPayment('often 60/40 + PHPP').label, '60/40 + post-handover')
  assert.equal(classifyPayment('often 60/40 + PHPP').postHandover, true)
  assert.equal(classifyPayment('~40% post-handover').label, 'Post-handover')
  assert.equal(classifyPayment('40% construction / 30% handover / 30% PHPP').label, '40/60 + post-handover')
  assert.equal(classifyPayment('IPS 35/65 (WA exclusive); also cited 20/20/60 online').bucket, 'Other')
  assert.equal(classifyPayment('IPS 35/65 (WA exclusive); also cited 20/20/60 online').label, '35/65')
  assert.equal(classifyPayment(null).label, null)
})

