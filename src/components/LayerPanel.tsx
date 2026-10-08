import { useState } from 'react'
import type { FilterState, LayerKey } from '../types'

const LAYERS: { id: LayerKey; label: string; dot: string }[] = [
  { id: 'our_listings', label: 'Our listings', dot: 'all' },
  { id: 'has_price', label: 'Price on card', dot: 'priced' },
  { id: 'price_not_on_card', label: 'Price not stated', dot: 'unpriced' },
  { id: 'units_available', label: 'Stated unit count', dot: 'ring' },
]

interface LayerPanelProps {
  filters: FilterState
  counts: Record<LayerKey, number>
  onToggle: (layer: LayerKey) => void
}

export default function LayerPanel({ filters, counts, onToggle }: LayerPanelProps) {
  const [open, setOpen] = useState(false)
  return (
    <section className={open ? 'layers is-open' : 'layers'} aria-label="Map layers">
      <button type="button" className="layers-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        Layers
      </button>
      {open
        ? LAYERS.map((layer) => (
            <label key={layer.id} className="layer-row">
              <input type="checkbox" checked={filters.layers[layer.id]} onChange={() => onToggle(layer.id)} />
              <i className={`dot ${layer.dot}`} aria-hidden="true" />
              <span>{layer.label}</span>
              <b>{counts[layer.id]}</b>
            </label>
          ))
        : null}
    </section>
  )
}
