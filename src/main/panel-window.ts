import { BrowserWindow, screen, type Display } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

// Panel size rules:
// - Loading/result default to a slim strip attached to the top edge.
// - Hover expansion opens a compact context drawer.
// - Candidate detail stays a centered large modal.
const PANEL_WIDTH_COLLAPSED = 620
const PANEL_HEIGHT_COLLAPSED = 42
const PANEL_WIDTH_EXPANDED = 720
const PANEL_HEIGHT_EXPANDED = 442
const PANEL_WIDTH_DETAIL = 960
const PANEL_HEIGHT_DETAIL = 660
const PANEL_TOP_OFFSET_PX = 0

let panelWindow: BrowserWindow | null = null
let lastMode: PanelMode = 'collapsed'
let lastNonDetailMode: Exclude<PanelMode, 'detail'> = 'collapsed'

type PanelMode = 'collapsed' | 'expanded' | 'detail'

function setPanelBounds(
  bounds: { x: number; y: number; width: number; height: number },
  animate = false
): void {
  if (!panelWindow) return
  panelWindow.setBounds(bounds, animate && process.platform === 'darwin')
}

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
    hasShadow: false,
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

  setPanelBounds({ x: panelX, y: panelY, width: size.width, height: size.height }, mode !== 'collapsed')
  lastMode = mode
  if (mode !== 'detail') {
    lastNonDetailMode = mode
  }
  panelWindow.showInactive()
  console.log('[PanelWindow] Shown at', panelX, panelY)
}

export function expandPanel(): void {
  if (!panelWindow) return
  if (lastMode === 'detail') return
  resizePanel('expanded')
}

export function collapsePanel(): void {
  if (!panelWindow) return
  if (lastMode === 'detail') return
  resizePanel('collapsed')
}

export function resizePanel(mode: PanelMode): void {
  if (!panelWindow) return

  const size = getModeSize(mode)
  const prev = panelWindow.getBounds()
  const display = getDisplayForPanel()
  const { x, y, width, height } = display.workArea

  const nextX = Math.round(prev.x + (prev.width - size.width) / 2)
  const nextY = mode === 'detail' ? Math.round(y + (height - size.height) / 2) : y + PANEL_TOP_OFFSET_PX

  const shouldAnimate = mode !== lastMode
  setPanelBounds({ x: nextX, y: nextY, width: size.width, height: size.height }, shouldAnimate)
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
