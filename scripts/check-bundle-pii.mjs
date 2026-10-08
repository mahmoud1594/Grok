// Fails the build when the built bundle (dist/) contains client data: phone numbers other than the
// business WhatsApp line, or broadcast/client rows. Client rows belong only in api/_lib/clients-data.js
// (or CLIENTS_JSON) and are served by the signed-in /api/clients.
// Usage: node scripts/check-bundle-pii.mjs [dir=dist]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] || 'dist'
const ALLOWED = new Set(['971542000142', '971501234567', '971501112244', '0501234567'])
const PHONE = /(?:\+|00)?(?:966|971)[\s-]?5\d(?:[\s-]?\d){7}|(?<![\d.])05\d(?:[\s-]?\d){7}(?!\d)/g
const ROW_MARKERS = ['"Reply / Interest":', 'Reply / Interest":"', 'Owner DB match":"']
const EXT = /\.(js|mjs|css|html|json|map|txt|svg)$/i

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? walk(p) : EXT.test(n) ? [p] : []
})

let bad = 0
for (const file of walk(dir)) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '').replace(/^00/, '')
    if (ALLOWED.has(digits) || /^(\d)\1+$/.test(digits.slice(-7)) || /0{6,}$/.test(digits)) continue
    console.error(`PII: phone-like ${digits.slice(0, 5)}… in ${file}`)
    bad++
  }
  for (const k of ROW_MARKERS) if (text.includes(k)) { console.error(`PII: client row field ${k} in ${file}`); bad++ }
}
if (bad) { console.error(`check-bundle-pii: ${bad} finding(s) in ${dir}. Client rows must come from /api/clients only.`); process.exit(1) }
console.log(`check-bundle-pii: ${dir} clean`)
