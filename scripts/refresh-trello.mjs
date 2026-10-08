import { refreshInventoryFile } from '../server/trello-inventory.mjs'

const result = await refreshInventoryFile()
if (!result.ok) {
  console.error(result.body.error)
  console.log('')
  console.log(result.body.instructions)
  process.exit(1)
}

console.log(
  `Wrote ${result.body.cardCount} cards (${result.body.pinCount} project pins) to src/data/trello-dubai.json (${result.body.exportedAt}).`,
)
