import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
const { PROJECTS } = await server.ssrLoadModule('/src/lib/inventory.ts')
await server.close()

const total = PROJECTS.length
const fields = [
  ['developer', (project) => project.developer],
  ['community', (project) => project.community],
  ['starting price', (project) => project.startingPriceAed],
  ['bedrooms', (project) => (project.bedrooms.length > 0 ? project.bedrooms : null)],
  ['size', (project) => project.sizes],
  ['payment plan', (project) => project.paymentPlan],
  ['handover', (project) => project.handover],
  ['service charge', (project) => project.serviceCharge],
]

const lines = [`# Trello Dubai field coverage`, ``, `Projects: ${total}`, ``, `| Field | Filled |`, `| --- | --- |`]
for (const [label, read] of fields) {
  const filled = PROJECTS.filter((project) => {
    const value = read(project)
    return value != null && value !== ''
  }).length
  lines.push(`| ${label} | ${filled} / ${total} |`)
}

function missing(read) {
  return PROJECTS.filter((project) => {
    const value = read(project)
    return value == null || value === '' || (Array.isArray(value) && value.length === 0)
  }).map((project) => project.name)
}

lines.push('', '## Still missing bedrooms', '')
for (const name of missing((project) => (project.bedrooms.length > 0 ? project.bedrooms : null))) lines.push(`- ${name}`)
lines.push('', '## Still missing payment plan', '')
for (const name of missing((project) => project.paymentPlan)) lines.push(`- ${name}`)
lines.push('', '## Still missing handover', '')
for (const name of missing((project) => project.handover)) lines.push(`- ${name}`)
lines.push('')

const bad = PROJECTS.filter((project) => project.paymentPlan && !/^(?:\d{2}\/\d{2}(?: \+ post-handover)?|Post-handover|Other)$/.test(project.paymentPlan))
if (bad.length > 0) {
  console.error('Non-canonical plans', bad.map((project) => [project.name, project.paymentPlan]))
  process.exit(1)
}

const report = lines.join('\n')
writeFileSync('/opt/cursor/artifacts/coverage-report.md', report)
console.log(report)
