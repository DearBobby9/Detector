import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const searchParams = new URLSearchParams(window.location.search)
const view = searchParams.get('view') === 'app' ? 'app' : 'panel'
document.body.dataset.view = view

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App view={view} />
  </React.StrictMode>
)
