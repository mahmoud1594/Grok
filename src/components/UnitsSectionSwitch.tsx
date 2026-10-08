import { navigate, pathForRoute } from '../lib/routes'

export type UnitsSection = 'secondary' | 'offplan'

export default function UnitsSectionSwitch({ section }: { section: UnitsSection }) {
  return (
    <div className="units-switch" role="tablist" aria-label="Units and projects">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'secondary'}
        className={section === 'secondary' ? 'is-on' : ''}
        onClick={() => navigate(pathForRoute('units'))}
      >
        Secondary units
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === 'offplan'}
        className={section === 'offplan' ? 'is-on' : ''}
        onClick={() => navigate(pathForRoute('offplan'))}
      >
        Off-plan projects
      </button>
    </div>
  )
}
