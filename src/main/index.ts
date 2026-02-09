import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import { createPanelWindow, getPanelWindow, showPanel } from './panel-window'
import { registerIpcHandlers } from './ipc-handlers'
import { registerHotkey, unregisterHotkey } from './hotkey'
import { captureAllScreens } from './screenshot'
import { getActiveWindow } from './active-window'
import { callClaude } from './claude-api'
import { saveRecord } from './database'
import { createAppWindow, getAppWindow, showAppWindow } from './app-window'
import { createTray } from './tray'

// Load .env from project root
config({ path: join(__dirname, '../../.env') })

let isProcessing = false

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

async function orchestrateCapture(): Promise<void> {
  if (isProcessing) {
    console.log('[Main] Already processing, skipping')
    return
  }

  isProcessing = true
  const panel = getPanelWindow()

  if (!panel) {
    console.error('[Main] Panel window not available')
    isProcessing = false
    return
  }

  try {
    // Show loading state immediately
    showPanel()
    broadcastToRenderers(IPC.PANEL_SHOW_LOADING)

    // Capture screenshots and active window in parallel
    console.log('[Main] Starting capture...')
    const [screenshotsResult, activeWindowResult] = await Promise.allSettled([
      captureAllScreens(),
      getActiveWindow()
    ])

    if (screenshotsResult.status === 'rejected') {
      throw screenshotsResult.reason
    }

    const screenshots = screenshotsResult.value
    const activeWindow =
      activeWindowResult.status === 'fulfilled'
        ? activeWindowResult.value
        : { appName: 'Unknown', windowTitle: '' }

    // Call Claude API
    console.log('[Main] Calling Claude API...')
    const result = await callClaude(screenshots, activeWindow)

    // Send result to renderer
    broadcastToRenderers(IPC.PANEL_SHOW_RESULT, result)

    // Save to history
    saveRecord({
      timestamp: Date.now(),
      activeApp: activeWindow.appName,
      windowTitle: activeWindow.windowTitle,
      resultType: result.type,
      resultJson: JSON.stringify(result),
      resultText: formatResultText(result)
    })

    console.log('[Main] Orchestration complete:', result.type)
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('[Main] Orchestration error:', error)
    broadcastToRenderers(IPC.PANEL_SHOW_ERROR, message)
  } finally {
    isProcessing = false
  }
}

function broadcastToRenderers(channel: string, ...args: unknown[]): void {
  const windows = [getPanelWindow(), getAppWindow()].filter(Boolean) as Array<{
    isDestroyed: () => boolean
    webContents: { send: (ch: string, ...a: unknown[]) => void }
  }>

  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

function formatResultText(result: { type: string } & Record<string, unknown>): string {
  if (result.type === 'email-reply') {
    const subject = typeof result.subject === 'string' ? result.subject : ''
    const originalSender = typeof result.originalSender === 'string' ? result.originalSender : ''
    const draft = typeof result.draft === 'string' ? result.draft : ''
    return [`Email Reply`, subject && `Subject: ${subject}`, originalSender && `To: ${originalSender}`, '', draft]
      .filter(Boolean)
      .join('\n')
  }

  if (result.type === 'page-summary') {
    const title = typeof result.title === 'string' ? result.title : ''
    const summary = typeof result.summary === 'string' ? result.summary : ''
    const keyPoints = Array.isArray(result.keyPoints) ? (result.keyPoints as unknown[]) : []
    const keyLines = keyPoints.filter((p) => typeof p === 'string').map((p) => `- ${p as string}`)
    return [title, '', summary, ...(keyLines.length > 0 ? ['', 'Key points:', ...keyLines] : [])]
      .filter((x) => typeof x === 'string' && x.length > 0)
      .join('\n')
  }

  return JSON.stringify(result)
}

app.whenReady().then(() => {
  console.log('[Main] App ready')

  // Keep dock visible in development so macOS permission prompts are less likely to be missed.
  if (app.isPackaged) {
    app.dock?.hide()
  }

  // Register IPC handlers
  registerIpcHandlers({
    triggerCapture: orchestrateCapture
  })

  // Create the panel window (hidden, pre-loaded)
  createPanelWindow()
  // Create the app window (hidden, pre-loaded)
  createAppWindow()
  // Create status bar tray icon
  createTray({
    onOpenMainWindow: showAppWindow,
    onCaptureNow: () => {
      void orchestrateCapture()
    }
  })

  // Register global hotkey
  registerHotkey(() => {
    void orchestrateCapture()
  })

  console.log('[Main] Detector is running. Press Cmd+Shift+. to capture.')
})

app.on('will-quit', () => {
  unregisterHotkey()
})

app.on('activate', () => {
  showAppWindow()
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
