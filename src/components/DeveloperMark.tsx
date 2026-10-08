import { useState } from 'react'
import { developerInitials, logoSlug, logoUrl } from '../lib/developer-logo'

interface DeveloperMarkProps {
  projectId: string
  developer: string | null
}

export default function DeveloperMark({ projectId, developer }: DeveloperMarkProps) {
  const slug = logoSlug(projectId, developer)
  const [broken, setBroken] = useState(false)
  if (slug && !broken) {
    return (
      <img
        className="dev-mark"
        src={logoUrl(slug, window.location.hostname)}
        alt=""
        onError={() => setBroken(true)}
      />
    )
  }
  if (!developer) return null
  const initials = developerInitials(developer)
  if (!initials) return null
  return (
    <span className="dev-mark dev-initials" aria-hidden="true">
      {initials}
    </span>
  )
}
