import { useState, useSyncExternalStore } from 'react'
import AppTabs, { sectionById, type AppTab } from './AppTabs'
import { BrandMark } from '../lib/brand'
import { moveNavGroup, moveNavItem, navOrder, resetNavOrder, subscribeNavOrder, type NavId } from '../lib/nav-order'
import { crmTheme, saveCrmTheme, type CrmTheme } from '../lib/theme'
import { saveWaTheme, waTheme, type WaTheme } from '../lib/whatsapp-web'

const CRM_THEMES: { id: CrmTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Same as computer' },
]

const WA_THEMES: { id: WaTheme; label: string }[] = [
  { id: 'crm', label: 'Same as CRM' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

function Choice<T extends string>({
  labelId,
  options,
  value,
  onChange,
}: {
  labelId: string
  options: { id: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="wa-mode" role="radiogroup" aria-labelledby={labelId}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? 'active' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function MenuSort({ group, ids }: { group: 'desk' | 'inventory'; ids: NavId[] }) {
  const title = group === 'desk' ? 'Desk' : 'Inventory'
  return (
    <div className="menu-sort">
      <h3>{title}</h3>
      <ol>
        {ids.map((id, index) => {
          const section = sectionById(id)
          return (
            <li key={id}>
              <span>{section.label}</span>
              <button type="button" aria-label={`Move ${section.label} up`} disabled={index === 0} onClick={() => moveNavItem(group, index, -1)}>
                Up
              </button>
              <button type="button" aria-label={`Move ${section.label} down`} disabled={index === ids.length - 1} onClick={() => moveNavItem(group, index, 1)}>
                Down
              </button>
              <button type="button" onClick={() => moveNavGroup(id, group === 'desk' ? 'inventory' : 'desk')}>
                {group === 'desk' ? 'To inventory' : 'To desk'}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

interface SettingsViewProps {
  onTab: (tab: AppTab) => void
}

export default function SettingsView({ onTab }: SettingsViewProps) {
  const [theme, setTheme] = useState<CrmTheme>(crmTheme)
  const [whatsapp, setWhatsapp] = useState<WaTheme>(waTheme)
  const order = useSyncExternalStore(subscribeNavOrder, navOrder, navOrder)

  return (
    <section className="clients-screen settings-screen" aria-label="Settings">
      <header className="clients-bar">
        <div className="brand-block">
          <button type="button" className="brand-lockup brand-home" onClick={() => onTab('leads')}>
            <span className="brand">
              <BrandMark />
            </span>
            <span className="brand-sub">Premium Dubai Real Estate</span>
          </button>
          <AppTabs tab="settings" onTab={onTab} />
          <span className="live-stack">
            <span className="live-chip">Settings</span>
            <span className="freshness">Saved in this browser</span>
          </span>
        </div>
      </header>
      <div className="settings-body">
        <section className="settings-card" aria-labelledby="settings-crm-theme">
          <h2 id="settings-crm-theme">CRM theme</h2>
          <p>Light or dark for the whole CRM. Maps keep their light street style.</p>
          <Choice
            labelId="settings-crm-theme"
            options={CRM_THEMES}
            value={theme}
            onChange={(next) => {
              setTheme(next)
              saveCrmTheme(next)
            }}
          />
        </section>
        <section className="settings-card" aria-labelledby="settings-wa-theme">
          <h2 id="settings-wa-theme">WhatsApp Web theme</h2>
          <p>How WhatsApp Web looks inside the WhatsApp tab.</p>
          <Choice
            labelId="settings-wa-theme"
            options={WA_THEMES}
            value={whatsapp}
            onChange={(next) => {
              setWhatsapp(next)
              saveWaTheme(next)
            }}
          />
          <small>
            If WhatsApp still looks the same, open WhatsApp's own Settings → Chats → Theme once and pick System default.
          </small>
        </section>
        <section className="settings-card" aria-labelledby="settings-google">
          <h2 id="settings-google">Google Calendar</h2>
          <p>Lead follow-ups go on mahmoud1594@gmail.com at 10:00 Dubai time.</p>
          <p>
            Setting a next action sends it to the Planner bot, which adds it with your own Google Calendar connection in
            a minute or two.
          </p>
        </section>
        <section className="settings-card" aria-labelledby="settings-menu-order">
          <h2 id="settings-menu-order">Menu order</h2>
          <p>Secondary starts in Desk. Move any item up, down, or across to the other group. This browser remembers it.</p>
          <MenuSort group="desk" ids={order.desk} />
          <MenuSort group="inventory" ids={order.inventory} />
          <button type="button" className="leads-refresh" onClick={() => resetNavOrder()}>
            Reset menu
          </button>
        </section>
      </div>
    </section>
  )
}
