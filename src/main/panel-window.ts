import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const PANEL_WIDTH = 480
const PANEL_HEIGHT = 400
const BLUR_HIDE_GRACE_MS = 300

let panelWindow: BrowserWindow | null = null
let lastShownAt = 0

export function createPanelWindow(): BrowserWindow {
  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/panel.js'),
      sandbox: false
    }
  })

  // Ensure the panel can appear above apps running in full-screen Spaces on macOS.
  panelWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  panelWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    panelWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    panelWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Hide when losing focus
  panelWindow.on('blur', () => {
    if (Date.now() - lastShownAt < BLUR_HIDE_GRACE_MS) {
      return
    }
    hidePanel()
  })

  panelWindow.on('closed', () => {
    panelWindow = null
  })

  console.log('[PanelWindow] Pre-created panel window')
  return panelWindow
}

export function getPanelWindow(): BrowserWindow | null {
  return panelWindow
}

export function showPanel(): void {
  if (!panelWindow) return

  // Position at top-center of the screen where the cursor is
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x, y, width } = display.workArea

  const panelX = Math.round(x + (width - PANEL_WIDTH) / 2)
  const panelY = y

  panelWindow.setBounds({ x: panelX, y: panelY, width: PANEL_WIDTH, height: PANEL_HEIGHT })
  lastShownAt = Date.now()
  panelWindow.showInactive()
  console.log('[PanelWindow] Shown at', panelX, panelY)
}

export function hidePanel(): void {
  if (!panelWindow) return
  panelWindow.hide()
  console.log('[PanelWindow] Hidden')
}
