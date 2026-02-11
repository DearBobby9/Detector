import { useEffect } from 'react'
import type { ThemeMode } from '@shared/types'
import { Panel } from './components/Panel'
import { MainAppShell } from './components/MainAppShell'
import { usePanel } from './hooks/usePanel'

interface Props {
  view: 'panel' | 'app'
}

function App({ view }: Props) {
  useEffect(() => {
    if (view !== 'panel') return

    let active = true
    let currentMode: ThemeMode = 'light'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyResolvedTheme = (resolved: 'light' | 'dark') => {
      document.body.dataset.themeMode = resolved
      document.documentElement.classList.toggle('dark', resolved === 'dark')
    }

    const applyThemeMode = (mode: ThemeMode, prefersDark: boolean) => {
      currentMode = mode
      applyResolvedTheme(mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode)
    }

    const onMediaChange = (event: MediaQueryListEvent) => {
      if (currentMode !== 'system') return
      applyResolvedTheme(event.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', onMediaChange)

    void window.electronAPI
      .getSettings()
      .then((settings) => {
        if (!active) return
        applyThemeMode(settings.themeMode, mediaQuery.matches)
      })
      .catch(() => {
        if (!active) return
        applyThemeMode('light', mediaQuery.matches)
      })

    return () => {
      active = false
      mediaQuery.removeEventListener('change', onMediaChange)
      delete document.body.dataset.themeMode
      document.documentElement.classList.remove('dark')
    }
  }, [view])

  if (view === 'app') {
    return <MainAppShell />
  }

  const { state, dismiss, copyToClipboard } = usePanel()

  return (
    <div className="w-full h-screen flex flex-col items-center">
      <Panel state={state} onDismiss={dismiss} onCopy={copyToClipboard} />
    </div>
  )
}

export default App
