import { useState } from 'react'

interface NotOnMapProject {
  id: string
  name: string
  pinNote: string
}

interface NotOnMapListProps {
  projects: NotOnMapProject[]
  onSelect: (id: string) => void
}

export default function NotOnMapList({ projects, onSelect }: NotOnMapListProps) {
  const [open, setOpen] = useState(false)

  if (projects.length === 0) return null

  return (
    <aside
      className={`secondary-unpinned unpinned-list${open ? ' is-open' : ' is-closed'}`}
      aria-label={`Not on map (${projects.length})`}
    >
      <button type="button" className="unpinned-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Not on map · {projects.length}
      </button>
      {open ? (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <button type="button" onClick={() => onSelect(project.id)}>
                <strong>{project.name}</strong>
                <span>{project.pinNote}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}
