import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import type {
  ActiveWindowInfo,
  BrowserSessionInfo,
  BrowserTabInfo,
  CaptureMetadata,
  CaptureServiceStatus
} from '@shared/types'
import { createPanelWindow, getPanelWindow, resizePanel, showPanel } from './panel-window'
import { registerIpcHandlers } from './ipc-handlers'
import { isHotkeyRegistered, registerHotkey, unregisterHotkey } from './hotkey'
import { captureAllScreens } from './screenshot'
import { getActiveWindow } from './active-window'
import { callClaude } from './claude-api'
import { saveRecord, updateRecordScreenshots } from './database'
import { createAppWindow, showAppWindow } from './app-window'
import { createTray } from './tray'
import { enforceStorageLimit } from './storage'
import { persistCaptureScreenshots } from './capture-storage'
import { getSettings } from './settings'
import { applyRuntimeSettings } from './runtime-preferences'
import { broadcastToRenderers } from './broadcast'
import { setAgentBroadcast } from './agent-pipeline'

// Load .env from project root
config({ path: join(__dirname, '../../.env') })

let isProcessing = false

function getCaptureServiceStatus(): CaptureServiceStatus {
  if (isProcessing) return 'active'
  const panel = getPanelWindow()
  if (!panel || panel.isDestroyed()) return 'error'
  if (!isHotkeyRegistered()) return 'error'
  return 'idle'
}

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

function sanitizeBrowserTabs(rawTabs: BrowserTabInfo[] | undefined): BrowserTabInfo[] {
  if (!Array.isArray(rawTabs)) return []
  return rawTabs
    .map((tab, idx) => {
      const title = typeof tab?.title === 'string' ? tab.title.trim() : ''
      const url = typeof tab?.url === 'string' ? tab.url.trim() : ''
      if (!title && !url) return null
      const maybeIndex = Number((tab as BrowserTabInfo).index)
      const index = Number.isFinite(maybeIndex) && maybeIndex > 0 ? Math.floor(maybeIndex) : idx + 1
      const appName = typeof tab?.appName === 'string' ? tab.appName.trim() : ''
      const rawWindowIndex = Number((tab as BrowserTabInfo).windowIndex)
      const windowIndex = Number.isFinite(rawWindowIndex) && rawWindowIndex > 0 ? Math.floor(rawWindowIndex) : undefined
      return { index, title, url, appName: appName || undefined, windowIndex }
    })
    .filter((tab): tab is BrowserTabInfo => Boolean(tab))
}

function sanitizeBrowserSessions(rawSessions: BrowserSessionInfo[] | undefined): BrowserSessionInfo[] {
  if (!Array.isArray(rawSessions)) return []
  return rawSessions
    .map((session) => {
      const appName = typeof session?.appName === 'string' ? session.appName.trim() : ''
      if (!appName) return null
      const tabs = sanitizeBrowserTabs(session.tabs)
      const rawWindowCount = Number(session.windowCount)
      const windowCount = Number.isFinite(rawWindowCount) && rawWindowCount >= 0 ? Math.floor(rawWindowCount) : 0
      const activeUrl = typeof session.activeUrl === 'string' ? session.activeUrl.trim() : ''
      const rawActiveTabIndex = Number(session.activeTabIndex)
      const activeTabIndex =
        Number.isFinite(rawActiveTabIndex) && rawActiveTabIndex > 0 ? Math.floor(rawActiveTabIndex) : undefined
      if (tabs.length === 0 && windowCount === 0) return null
      return { appName, tabs, windowCount, activeUrl: activeUrl || undefined, activeTabIndex }
    })
    .filter((session): session is BrowserSessionInfo => Boolean(session))
}

function buildCaptureMetadata(activeWindow: ActiveWindowInfo, capturedAt: number): CaptureMetadata {
  const activeApp = typeof activeWindow.appName === 'string' && activeWindow.appName.trim()
    ? activeWindow.appName.trim()
    : 'Unknown'
  const windowTitle = typeof activeWindow.windowTitle === 'string' ? activeWindow.windowTitle.trim() : ''
  const activeUrl =
    typeof activeWindow.url === 'string' && activeWindow.url.trim().length > 0
      ? activeWindow.url.trim()
      : undefined
  const browserSessions = sanitizeBrowserSessions(activeWindow.browserSessions)
  const tabsFromPayload = sanitizeBrowserTabs(activeWindow.browserTabs)
  const tabs = tabsFromPayload.length > 0 ? tabsFromPayload : browserSessions.flatMap((session) => session.tabs)
  const rawActiveTabIndex = Number(activeWindow.activeTabIndex)
  let activeTabIndex =
    Number.isFinite(rawActiveTabIndex) && rawActiveTabIndex > 0 ? Math.floor(rawActiveTabIndex) : undefined
  if (typeof activeTabIndex !== 'number') {
    const sessionForActiveApp = browserSessions.find((session) => session.appName === activeApp)
    if (typeof sessionForActiveApp?.activeTabIndex === 'number') {
      activeTabIndex = sessionForActiveApp.activeTabIndex
    }
  }

  return {
    activeApp,
    windowTitle,
    activeUrl,
    capturedAt,
    tabs,
    browserSessions: browserSessions.length > 0 ? browserSessions : undefined,
    activeTabIndex
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
    if (panel.isVisible()) {
      console.log('[Main] refreshing existing panel with new capture')
    }

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
    const capturedAt = Date.now()

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

    if (result.type === 'capture-analysis') {
      result.metadata = buildCaptureMetadata(activeWindow, capturedAt)
    }

    // Keep the panel in slim mode after analysis completes.
    // The renderer expands on hover for low-intrusion interaction.
    resizePanel('collapsed')
    broadcastToRenderers(IPC.PANEL_SHOW_RESULT, result)

    // Save to history
    const savedRecord = saveRecord({
      timestamp: capturedAt,
      activeApp: activeWindow.appName,
      windowTitle: activeWindow.windowTitle,
      resultType: result.type,
      resultJson: JSON.stringify(result),
      resultText: formatResultText(result)
    })

    if (typeof savedRecord.id === 'number') {
      try {
        const assets = persistCaptureScreenshots(savedRecord.id, screenshots)
        if (assets.length > 0) {
          updateRecordScreenshots(savedRecord.id, assets)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`[CaptureStorage] Failed to persist capture assets for #${savedRecord.id}: ${reason}`)
      }
    }

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

  // Apply runtime switches (dock visibility, launch-at-login) from saved settings.
  applyRuntimeSettings(getSettings())

  // Register IPC handlers
  registerIpcHandlers({
    triggerCapture: orchestrateCapture,
    getCaptureServiceStatus
  })

  // Wire agent pipeline broadcast
  setAgentBroadcast(broadcastToRenderers)

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
