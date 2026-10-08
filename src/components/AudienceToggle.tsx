import type { UnitAudience } from '../lib/units'

const OPTIONS: { id: UnitAudience; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pocket', label: 'Pocket listings' },
  { id: 'owners', label: 'Owners' },
]

interface AudienceToggleProps {
  value: UnitAudience
  onChange: (next: UnitAudience) => void
}

export default function AudienceToggle({ value, onChange }: AudienceToggleProps) {
  return (
    <div className="segmented audience-toggle" role="group" aria-label="Pocket listings or owners">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'seg on' : 'seg'}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
