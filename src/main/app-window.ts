import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const APP_WINDOW_WIDTH = 980
const APP_WINDOW_HEIGHT = 680

let appWindow: BrowserWindow | null = null

function loadRenderer(window: BrowserWindow, view: 'app' | 'panel'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('view', view)
    window.loadURL(url.toString())
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: { view }
  })
}

export function createAppWindow(): BrowserWindow {
  if (appWindow) return appWindow

  appWindow = new BrowserWindow({
    width: APP_WINDOW_WIDTH,
    height: APP_WINDOW_HEIGHT,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Detector',
    trafficLightPosition: { x: 16, y: 16 },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    backgroundColor: '#f3f5f7',
    webPreferences: {
      preload: join(__dirname, '../preload/panel.js'),
      sandbox: false
    }
  })

  loadRenderer(appWindow, 'app')

  appWindow.on('closed', () => {
    appWindow = null
  })

  console.log('[AppWindow] Created')
  return appWindow
}

export function showAppWindow(): void {
  const window = createAppWindow()
  if (!window.isVisible()) {
    window.show()
  }
  window.focus()
  console.log('[AppWindow] Shown')
}

export function getAppWindow(): BrowserWindow | null {
  return appWindow
}
