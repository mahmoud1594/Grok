import AppTabs, { type AppTab } from './AppTabs'
import { BrandMark } from '../lib/brand'

interface SectionScaffoldProps {
  tab: Exclude<AppTab, 'map'>
  title: string
  note: string
  onTab: (tab: AppTab) => void
}

export default function SectionScaffold({ tab, title, note, onTab }: SectionScaffoldProps) {
  return (
    <section className="clients-screen" aria-label={title}>
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab={tab} onTab={onTab} />
        </div>
      </header>
      <div className="section-empty">
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
    </section>
  )
}
