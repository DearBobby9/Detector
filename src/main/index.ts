import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import { createPanelWindow, getPanelWindow, showPanel, hidePanel } from './panel-window'
import { registerIpcHandlers } from './ipc-handlers'
import { registerHotkey, unregisterHotkey } from './hotkey'
import { captureAllScreens } from './screenshot'
import { getActiveWindow } from './active-window'
import { callClaude } from './claude-api'
import { saveRecord } from './database'

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
    panel.webContents.send(IPC.PANEL_SHOW_LOADING)

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
    panel.webContents.send(IPC.PANEL_SHOW_RESULT, result)

    // Save to history
    saveRecord({
      timestamp: Date.now(),
      activeApp: activeWindow.appName,
      windowTitle: activeWindow.windowTitle,
      resultType: result.type,
      resultJson: JSON.stringify(result)
    })

    console.log('[Main] Orchestration complete:', result.type)
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('[Main] Orchestration error:', error)
    panel.webContents.send(IPC.PANEL_SHOW_ERROR, message)
  } finally {
    isProcessing = false
  }
}

app.whenReady().then(() => {
  console.log('[Main] App ready')

  // Keep dock visible in development so macOS permission prompts are less likely to be missed.
  if (app.isPackaged) {
    app.dock?.hide()
  }

  // Register IPC handlers
  registerIpcHandlers()

  // Create the panel window (hidden, pre-loaded)
  createPanelWindow()

  // Register global hotkey
  registerHotkey(() => {
    void orchestrateCapture()
  })

  console.log('[Main] Detector is running. Press Cmd+Shift+. to capture.')
})

app.on('will-quit', () => {
  unregisterHotkey()
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
