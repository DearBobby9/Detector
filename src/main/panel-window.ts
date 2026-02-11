import { BrowserWindow, screen, type Display } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

// Panel size rules:
// - Loading ("collapsed") should be a slim bar near the top.
// - Result ("expanded") can be larger to fit email draft + memory candidates.
const PANEL_WIDTH_COLLAPSED = 380
const PANEL_HEIGHT_COLLAPSED = 72
const PANEL_WIDTH_EXPANDED = 460
const PANEL_HEIGHT_EXPANDED = 360
const PANEL_WIDTH_DETAIL = 900
const PANEL_HEIGHT_DETAIL = 620
const PANEL_TOP_OFFSET_PX = 12
const BLUR_HIDE_GRACE_MS = 300

let panelWindow: BrowserWindow | null = null
let lastShownAt = 0
let lastMode: PanelMode = 'collapsed'
let lastNonDetailMode: Exclude<PanelMode, 'detail'> = 'collapsed'

type PanelMode = 'collapsed' | 'expanded' | 'detail'

function getModeSize(mode: PanelMode): { width: number; height: number } {
  if (mode === 'collapsed') {
    return { width: PANEL_WIDTH_COLLAPSED, height: PANEL_HEIGHT_COLLAPSED }
  }
  if (mode === 'detail') {
    return { width: PANEL_WIDTH_DETAIL, height: PANEL_HEIGHT_DETAIL }
  }
  return { width: PANEL_WIDTH_EXPANDED, height: PANEL_HEIGHT_EXPANDED }
}

function getDisplayForPanel(): Display {
  if (panelWindow && !panelWindow.isDestroyed()) {
    return screen.getDisplayMatching(panelWindow.getBounds())
  }
  const cursorPoint = screen.getCursorScreenPoint()
  return screen.getDisplayNearestPoint(cursorPoint)
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
    width: PANEL_WIDTH_COLLAPSED,
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

  const display = getDisplayForPanel()
  const { x, y, width, height } = display.workArea

  const size = getModeSize(mode)
  const panelX = Math.round(x + (width - size.width) / 2)
  const panelY = mode === 'detail' ? Math.round(y + (height - size.height) / 2) : y + PANEL_TOP_OFFSET_PX

  panelWindow.setBounds({ x: panelX, y: panelY, width: size.width, height: size.height })
  lastShownAt = Date.now()
  lastMode = mode
  if (mode !== 'detail') {
    lastNonDetailMode = mode
  }
  panelWindow.showInactive()
  console.log('[PanelWindow] Shown at', panelX, panelY)
}

export function resizePanel(mode: PanelMode): void {
  if (!panelWindow) return

  const size = getModeSize(mode)
  const prev = panelWindow.getBounds()
  const display = getDisplayForPanel()
  const { x, y, width, height } = display.workArea

  const nextX = Math.round(prev.x + (prev.width - size.width) / 2)
  const nextY = mode === 'detail' ? Math.round(y + (height - size.height) / 2) : y + PANEL_TOP_OFFSET_PX

  panelWindow.setBounds({ x: nextX, y: nextY, width: size.width, height: size.height })
  lastMode = mode
  if (mode !== 'detail') {
    lastNonDetailMode = mode
  }
}

export function getPanelMode(): PanelMode {
  return lastMode
}

export function enterPanelDetailView(): void {
  if (!panelWindow) return
  resizePanel('detail')
}

export function exitPanelDetailView(): void {
  if (!panelWindow) return
  resizePanel(lastNonDetailMode)
}

export function hidePanel(): void {
  if (!panelWindow) return
  panelWindow.hide()
  console.log('[PanelWindow] Hidden')
}
