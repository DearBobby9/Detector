import { ipcMain, clipboard } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { is } from '@electron-toolkit/utils'
import { AppSettings, CaptureServiceStatus, ChatMessage } from '@shared/types'
import { collapsePanel, enterPanelDetailView, exitPanelDetailView, expandPanel, hidePanel } from './panel-window'
import { getSettings, saveSettings } from './settings'
import { getHistory } from './database'
import { listMemory, saveMemory } from './memory-database'
import { apiTest, sendChat } from './chat-api'
import {
  copyStoragePath,
  enforceStorageLimit,
  getStorageUsage,
  revealStoragePath,
  setMaxStorageBytes
} from './storage'
import { readCaptureImageData } from './capture-storage'
import { applyRuntimeSettings } from './runtime-preferences'
import { getLastSettingsRuntimeStatus, runStatusCheck } from './status-check'
import { exportTimelineMarkdown } from './timeline-export'
import { openScreenPermissionSettings, requestScreenPermissionAccess } from './screen-permission'

interface IpcHandlerActions {
  triggerCapture: () => Promise<void>
  getCaptureServiceStatus: () => CaptureServiceStatus
}

export function registerIpcHandlers(actions: IpcHandlerActions): void {
  ipcMain.on(IPC.PANEL_DISMISS, () => {
    console.log('[IPC] Dismiss received')
    hidePanel()
  })

  ipcMain.on(IPC.PANEL_EXPAND, () => {
    expandPanel()
  })

  ipcMain.on(IPC.PANEL_COLLAPSE, () => {
    collapsePanel()
  })

  ipcMain.on(IPC.PANEL_ENTER_DETAIL_VIEW, () => {
    enterPanelDetailView()
  })

  ipcMain.on(IPC.PANEL_EXIT_DETAIL_VIEW, () => {
    exitPanelDetailView()
  })

  ipcMain.on(IPC.CLIPBOARD_WRITE, (_event, text: string) => {
    clipboard.writeText(text)
    console.log('[IPC] Copied to clipboard:', text.substring(0, 50) + '...')
  })

  ipcMain.on(IPC.PANEL_READY, () => {
    console.log('[IPC] Panel renderer ready')
  })

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return getSettings()
  })

  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, settings: Partial<AppSettings>) => {
    const saved = saveSettings(settings)
    applyRuntimeSettings(saved)
    return saved
  })

  ipcMain.handle(IPC.SETTINGS_STATUS_CHECK_GET, async () => {
    const cached = getLastSettingsRuntimeStatus()
    if (cached.lastCheckedAt > 0) return cached
    return runStatusCheck(actions.getCaptureServiceStatus)
  })

  ipcMain.handle(IPC.SETTINGS_STATUS_CHECK_RUN, async () => {
    return runStatusCheck(actions.getCaptureServiceStatus)
  })

  ipcMain.handle(IPC.SETTINGS_SCREEN_PERMISSION_REQUEST, async () => {
    return requestScreenPermissionAccess()
  })

  ipcMain.handle(IPC.SETTINGS_SCREEN_PERMISSION_OPEN, async () => {
    return openScreenPermissionSettings()
  })

  ipcMain.handle(IPC.CAPTURE_TRIGGER, async () => {
    await actions.triggerCapture()
    return { ok: true }
  })

  ipcMain.handle(IPC.API_TEST, async (_event, settings: Partial<AppSettings> | undefined) => {
    return apiTest(settings)
  })

  ipcMain.handle(IPC.HISTORY_LIST, () => {
    return getHistory()
  })

  ipcMain.handle(IPC.MEMORY_LIST, () => {
    return listMemory()
  })

  ipcMain.handle(IPC.MEMORY_SAVE, (_event, payload: Omit<import('@shared/types').MemoryItem, 'id' | 'createdAt'>) => {
    return saveMemory({
      createdAt: Date.now(),
      ...payload
    })
  })

  ipcMain.handle(
    IPC.CHAT_SEND,
    async (
      _event,
      payload: { contextText: string; messages: ChatMessage[]; settings?: Partial<AppSettings> }
    ) => {
      const text = await sendChat(payload.contextText, payload.messages, payload.settings)
      return { ok: true, text }
    }
  )

  ipcMain.handle(IPC.CAPTURE_READ_IMAGE_DATA, (_event, relativePath: string) => {
    return readCaptureImageData(relativePath)
  })

  ipcMain.handle(IPC.STORAGE_GET_USAGE, () => {
    return getStorageUsage()
  })

  ipcMain.handle(IPC.STORAGE_SET_LIMIT, (_event, maxStorageBytes: number) => {
    const settings = setMaxStorageBytes(maxStorageBytes)
    const usage = getStorageUsage()
    return { settings, usage }
  })

  ipcMain.handle(IPC.STORAGE_ENFORCE_LIMIT, () => {
    return enforceStorageLimit()
  })

  ipcMain.handle(IPC.STORAGE_REVEAL_PATH, async (_event, categoryOrPath: string) => {
    return revealStoragePath(categoryOrPath)
  })

  ipcMain.handle(IPC.STORAGE_COPY_PATH, (_event, categoryOrPath: string) => {
    return copyStoragePath(categoryOrPath)
  })

  ipcMain.handle(
    IPC.OTHER_EXPORT_TIMELINE,
    (_event, payload: { fromDate?: string; toDate?: string } | undefined) => {
      return exportTimelineMarkdown(payload || {})
    }
  )

  ipcMain.handle(IPC.DEBUG_REPROCESS_DAY, (_event, payload: { day?: string } | undefined) => {
    if (!is.dev) {
      return { ok: false, message: 'Debug reprocess is only available in development builds.' }
    }

    const day = typeof payload?.day === 'string' ? payload.day.trim() : ''
    if (!day) {
      return { ok: false, message: 'Missing day (expected YYYY-MM-DD).' }
    }

    const start = new Date(`${day}T00:00:00`).getTime()
    const end = new Date(`${day}T23:59:59.999`).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { ok: false, message: 'Invalid day format (expected YYYY-MM-DD).' }
    }

    const count = getHistory().filter((record) => record.timestamp >= start && record.timestamp <= end).length
    return {
      ok: true,
      message: `Debug reprocess simulated for ${day}. Found ${count} capture(s) in range.`,
      count
    }
  })

  console.log('[IPC] Handlers registered')
}
