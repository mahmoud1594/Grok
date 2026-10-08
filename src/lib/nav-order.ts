export type NavId =
  | 'leads'
  | 'calendar'
  | 'whatsapp'
  | 'email'
  | 'clients'
  | 'news'
  | 'secondary'
  | 'units'
  | 'listings'
  | 'map'

export const DESK_DEFAULT: NavId[] = ['leads', 'calendar', 'whatsapp', 'email', 'clients', 'news', 'secondary']
export const INVENTORY_DEFAULT: NavId[] = ['units', 'listings', 'map']

const ALL: NavId[] = [...DESK_DEFAULT, ...INVENTORY_DEFAULT]
const KEY = 'crm-nav-order'

export interface NavOrder {
  desk: NavId[]
  inventory: NavId[]
}

const listeners = new Set<() => void>()

function isNavId(value: string): value is NavId {
  return (ALL as string[]).includes(value)
}

function normalize(raw: unknown): NavOrder {
  const desk: NavId[] = []
  const inventory: NavId[] = []
  const seen = new Set<NavId>()
  const take = (list: NavId[], value: unknown) => {
    if (typeof value !== 'string' || !isNavId(value) || seen.has(value)) return
    seen.add(value)
    list.push(value)
  }
  const saved = raw && typeof raw === 'object' ? (raw as { desk?: unknown; inventory?: unknown }) : {}
  if (Array.isArray(saved.desk)) saved.desk.forEach((id) => take(desk, id))
  if (Array.isArray(saved.inventory)) saved.inventory.forEach((id) => take(inventory, id))
  for (const id of DESK_DEFAULT) if (!seen.has(id)) desk.push(id)
  for (const id of INVENTORY_DEFAULT) if (!seen.has(id)) inventory.push(id)
  return { desk, inventory }
}

function read(): NavOrder {
  try {
    return normalize(JSON.parse(window.localStorage.getItem(KEY) || 'null'))
  } catch {
    return normalize(null)
  }
}

let current: NavOrder = typeof window === 'undefined' ? { desk: [...DESK_DEFAULT], inventory: [...INVENTORY_DEFAULT] } : read()

function emit() {
  for (const listener of listeners) listener()
}

export function navOrder(): NavOrder {
  return current
}

export function subscribeNavOrder(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function write(next: NavOrder) {
  current = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode: the order still applies for this visit.
  }
  emit()
}

export function moveNavItem(group: 'desk' | 'inventory', index: number, delta: number) {
  const list = [...current[group]]
  const target = index + delta
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  write({ ...current, [group]: list })
}

export function moveNavGroup(id: NavId, to: 'desk' | 'inventory') {
  const from = current.desk.includes(id) ? 'desk' : 'inventory'
  if (from === to) return
  write({
    desk: to === 'desk' ? [...current.desk, id] : current.desk.filter((item) => item !== id),
    inventory: to === 'inventory' ? [...current.inventory, id] : current.inventory.filter((item) => item !== id),
  })
}

export function resetNavOrder() {
  write({ desk: [...DESK_DEFAULT], inventory: [...INVENTORY_DEFAULT] })
}
