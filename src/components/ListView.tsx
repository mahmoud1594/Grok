import { useMemo, useState } from 'react'
import DeveloperMark from './DeveloperMark'
import type { Project } from '../types'
import { formatAedOrMissing, formatBedrooms, formatOrDash, sourceLabel } from '../lib/format'

type SortKey = 'name' | 'community' | 'developer' | 'price' | 'handover' | 'units' | 'type'
type SortDir = 'asc' | 'desc'

interface ListViewProps {
  projects: Project[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function compareText(a: string | null, b: string | null, dir: number): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b) * dir
}

function compareNumber(a: number | null, b: number | null, dir: number): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * dir
}

export default function ListView({ projects, selectedId, onSelect }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('community')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const rows = useMemo(() => {
    const next = [...projects]
    next.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir
        case 'community':
          return a.community.localeCompare(b.community) * dir || a.name.localeCompare(b.name)
        case 'developer':
          return compareText(a.developer, b.developer, dir) || a.name.localeCompare(b.name)
        case 'price':
          return compareNumber(a.startingPriceAed, b.startingPriceAed, dir)
        case 'handover':
          return compareNumber(a.handoverYear, b.handoverYear, dir)
        case 'units':
          return compareNumber(a.unitsAvailable, b.unitsAvailable, dir)
        case 'type':
          return compareText(a.propertyType, b.propertyType, dir)
        default:
          return 0
      }
    })
    return next
  }, [projects, sortKey, sortDir])

  const sortBy = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'price' || key === 'units' ? 'desc' : 'asc')
  }

  return (
    <div className="list">
      {rows.length === 0 ? (
        <p className="empty">No projects match these filters.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortHead label="Project" sortKey="name" active={sortKey} dir={sortDir} onSort={sortBy} />
              <SortHead label="Developer" sortKey="developer" active={sortKey} dir={sortDir} onSort={sortBy} />
              <SortHead label="Community" sortKey="community" active={sortKey} dir={sortDir} onSort={sortBy} />
              <SortHead label="From" sortKey="price" active={sortKey} dir={sortDir} onSort={sortBy} align="right" />
              <th>Beds</th>
              <th>Size</th>
              <th>Plan</th>
              <SortHead label="Handover" sortKey="handover" active={sortKey} dir={sortDir} onSort={sortBy} />
              <th>Service charge</th>
              <th>Source</th>
              <SortHead label="Units" sortKey="units" active={sortKey} dir={sortDir} onSort={sortBy} align="right" />
              <SortHead label="Type" sortKey="type" active={sortKey} dir={sortDir} onSort={sortBy} />
            </tr>
          </thead>
          <tbody>
            {rows.map((project) => (
              <tr
                key={project.id}
                aria-selected={project.id === selectedId}
                onClick={() => onSelect(project.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(project.id)
                  }
                }}
                tabIndex={0}
              >
                <td className="name">
                  <span className="name-cell">
                    <DeveloperMark projectId={project.id} developer={project.developer} />
                    <span className="name-text">{project.name}</span>
                  </span>
                </td>
                <td className={project.developer ? undefined : 'missing'}>{formatOrDash(project.developer)}</td>
                <td>{project.community}</td>
                <td className={project.startingPriceAed == null ? 'num missing' : 'num'}>
                  {formatAedOrMissing(project.startingPriceAed)}
                </td>
                <td className={project.bedrooms.length === 0 ? 'missing' : undefined}>{formatBedrooms(project.bedrooms)}</td>
                <td className={project.sizes ? undefined : 'missing'}>{formatOrDash(project.sizes)}</td>
                <td className={project.paymentPlan ? undefined : 'missing'}>{formatOrDash(project.paymentPlan)}</td>
                <td className={project.handover ? undefined : 'missing'}>{formatOrDash(project.handover)}</td>
                <td className={project.serviceCharge ? undefined : 'missing'}>{formatOrDash(project.serviceCharge)}</td>
                <td>{sourceLabel(project.source)}</td>
                <td className={project.unitsNote ? 'num' : 'num missing'}>{formatOrDash(project.unitsNote)}</td>
                <td className={project.propertyType ? undefined : 'missing'}>{formatOrDash(project.propertyType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SortHead({
  label,
  sortKey,
  active,
  dir,
  align,
  onSort,
}: {
  label: string
  sortKey: SortKey
  active: SortKey
  dir: SortDir
  align?: 'right'
  onSort: (key: SortKey) => void
}) {
  const on = active === sortKey
  return (
    <th className={align === 'right' ? 'num' : undefined}>
      <button type="button" className="sort" onClick={() => onSort(sortKey)} aria-pressed={on}>
        {label}
        {on ? <span aria-hidden="true">{dir === 'asc' ? ' ↑' : ' ↓'}</span> : null}
      </button>
    </th>
  )
}
