import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import type { ElectronAPI } from './lib/types'
import { createMockElectronAPI } from './lib/mockElectronApi'

const searchParams = new URLSearchParams(window.location.search)
const view = searchParams.get('view') === 'app' ? 'app' : 'panel'
document.body.dataset.view = view

// Allow UI testing in a regular browser (no Electron preload).
// This is used by agent-browser screenshots and fast UI iteration.
const maybeElectronAPI = (window as any).electronAPI as ElectronAPI | undefined
if (!maybeElectronAPI) {
  ;(window as any).electronAPI = createMockElectronAPI()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App view={view} />
  </React.StrictMode>
)
