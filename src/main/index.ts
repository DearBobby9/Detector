import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import { createPanelWindow, getPanelWindow, resizePanel, showPanel } from './panel-window'
import { registerIpcHandlers } from './ipc-handlers'
import { registerHotkey, unregisterHotkey } from './hotkey'
import { captureAllScreens } from './screenshot'
import { getActiveWindow } from './active-window'
import { callClaude } from './claude-api'
import { saveRecord } from './database'
import { createAppWindow, getAppWindow, showAppWindow } from './app-window'
import { createTray } from './tray'
import { enforceStorageLimit } from './storage'

// Load .env from project root
config({ path: join(__dirname, '../../.env') })

let isProcessing = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
    showPanel('collapsed')
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

    // Conservative email gating to reduce false positives when the active app isn't an email client.
    if (result.type === 'capture-analysis' && result.email?.detected) {
      const app = String(activeWindow.appName || '').toLowerCase()
      const url = typeof activeWindow.url === 'string' ? activeWindow.url : ''
      const host = (() => {
        try {
          return url ? new URL(url).host.toLowerCase() : ''
        } catch {
          return ''
        }
      })()

      const isMailApp =
        app.includes('mail') ||
        app.includes('outlook') ||
        app.includes('spark') ||
        app.includes('mimestream') ||
        app.includes('airmail')

      const isWebMailHost =
        host.includes('mail.google.com') ||
        host.includes('gmail.com') ||
        host.includes('outlook.office.com') ||
        host.includes('office.com') ||
        host.includes('mail.yahoo.com') ||
        host.includes('mail.proton.me') ||
        host.includes('proton.me')

      const env: 'mail' | 'webmail' | 'unknown' | 'other' =
        isMailApp ? 'mail' : isWebMailHost ? 'webmail' : app === 'unknown' ? 'unknown' : 'other'

      const confidence = typeof result.email.confidence === 'number' ? result.email.confidence : 0
      const evidenceCount = Array.isArray(result.email.evidence) ? result.email.evidence.length : 0
      const hasRequiredFields =
        typeof result.email.subject === 'string' &&
        result.email.subject.trim().length > 0 &&
        typeof result.email.originalSender === 'string' &&
        result.email.originalSender.trim().length > 0 &&
        typeof result.email.draft === 'string' &&
        result.email.draft.trim().length > 0

      const threshold = env === 'mail' || env === 'webmail' ? 0.55 : env === 'unknown' ? 0.88 : 0.94

      const accepted = confidence >= threshold && evidenceCount >= 2 && hasRequiredFields
      if (!accepted) {
        console.log('[Main] Email gated off:', { env, confidence, evidenceCount, hasRequiredFields, threshold })
        result.email = {
          detected: false,
          confidence,
          evidence: Array.isArray(result.email.evidence) ? result.email.evidence : []
        }
      }
    }

    // Send result to renderer
    resizePanel('expanded')
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

    const cleanup = enforceStorageLimit()
    if (cleanup.deletedRecords > 0 || cleanup.reclaimedBytes > 0) {
      console.log('[Storage] Auto-prune complete:', cleanup)
    }

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

  if (result.type === 'capture-analysis') {
    const screenTitle = typeof result.screenTitle === 'string' ? result.screenTitle : 'Capture'
    const lines: string[] = [screenTitle]

    const email = isRecord(result.email) ? result.email : null
    const emailDetected = Boolean(email && email.detected)

    if (emailDetected) {
      const subject = typeof email?.subject === 'string' ? email.subject : ''
      const originalSender = typeof email?.originalSender === 'string' ? email.originalSender : ''
      const draft = typeof email?.draft === 'string' ? email.draft : ''
      lines.push('', 'Email reply:')
      if (subject) lines.push(`Subject: ${subject}`)
      if (originalSender) lines.push(`To: ${originalSender}`)
      if (draft) lines.push('', draft)
    }

    const memoryCandidates = Array.isArray(result.memoryCandidates) ? (result.memoryCandidates as unknown[]) : []
    const memLines = memoryCandidates
      .map((raw) => {
        if (!isRecord(raw)) return null
        const kind = typeof raw.kind === 'string' ? raw.kind : 'other'
        const title = typeof raw.title === 'string' ? raw.title : ''
        const dueAt = typeof raw.dueAt === 'string' ? raw.dueAt : ''
        if (!title) return null
        return dueAt ? `- [${kind}] ${title} (due: ${dueAt})` : `- [${kind}] ${title}`
      })
      .filter((x): x is string => typeof x === 'string' && x.length > 0)

    if (memLines.length > 0) {
      lines.push('', 'Memory candidates:', ...memLines)
    }

    return lines.join('\n').trim()
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
