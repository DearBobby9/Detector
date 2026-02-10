import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const PANEL_WIDTH = 460
const PANEL_HEIGHT_COLLAPSED = 112
const PANEL_HEIGHT_EXPANDED = 360
const BLUR_HIDE_GRACE_MS = 300

let panelWindow: BrowserWindow | null = null
let lastShownAt = 0
let lastMode: PanelMode = 'collapsed'

type PanelMode = 'collapsed' | 'expanded'

function getModeSize(mode: PanelMode): { width: number; height: number } {
  return {
    width: PANEL_WIDTH,
    height: mode === 'collapsed' ? PANEL_HEIGHT_COLLAPSED : PANEL_HEIGHT_EXPANDED
  }
}

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

export function createPanelWindow(): BrowserWindow {
  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT_COLLAPSED,
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
  loadRenderer(panelWindow, 'panel')

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

export function showPanel(mode: PanelMode = 'expanded'): void {
  if (!panelWindow) return

  // Position at top-center of the screen where the cursor is
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x, y, width } = display.workArea

  const size = getModeSize(mode)
  const panelX = Math.round(x + (width - size.width) / 2)
  const panelY = y

  panelWindow.setBounds({ x: panelX, y: panelY, width: size.width, height: size.height })
  lastShownAt = Date.now()
  lastMode = mode
  panelWindow.showInactive()
  console.log('[PanelWindow] Shown at', panelX, panelY)
}

export function resizePanel(mode: PanelMode): void {
  if (!panelWindow) return

  // Keep center anchored so the panel doesn't "jump" if the cursor moves during capture.
  const prev = panelWindow.getBounds()
  const size = getModeSize(mode)
  const nextX = Math.round(prev.x + (prev.width - size.width) / 2)

  panelWindow.setBounds({ x: nextX, y: prev.y, width: size.width, height: size.height })
  lastMode = mode
}

export function getPanelMode(): PanelMode {
  return lastMode
}

export function hidePanel(): void {
  if (!panelWindow) return
  panelWindow.hide()
  console.log('[PanelWindow] Hidden')
}
