import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CrmLayout from './components/CrmLayout'
import '@fontsource-variable/inter'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import { applyCrmTheme, followSystemTheme } from './lib/theme'

applyCrmTheme()
followSystemTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root is missing')

createRoot(root).render(
  <StrictMode>
    <CrmLayout />
  </StrictMode>,
)
