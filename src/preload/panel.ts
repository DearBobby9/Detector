import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  AppSettings,
  CodexCliDiagnosticResult,
  SettingsRuntimeStatus,
  DetectionResult,
  MemoryItem,
  ScreenPermissionRequestResult,
  ScreenPermissionSettingsResult,
  StorageEnforceResult,
  StorageLimitUpdateResult,
  StorageUsageSummary
} from '@shared/types'
import type { AgentActionEdits, AgentActionPlan, AgentPermissionProbe, AgentStatusPush } from '@shared/agent-types'

contextBridge.exposeInMainWorld('electronAPI', {
  onShowLoading: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.PANEL_SHOW_LOADING, handler)
    return () => ipcRenderer.removeListener(IPC.PANEL_SHOW_LOADING, handler)
  },

  onShowResult: (callback: (result: DetectionResult) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: DetectionResult): void =>
      callback(result)
    ipcRenderer.on(IPC.PANEL_SHOW_RESULT, handler)
    return () => ipcRenderer.removeListener(IPC.PANEL_SHOW_RESULT, handler)
  },

  onShowError: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on(IPC.PANEL_SHOW_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.PANEL_SHOW_ERROR, handler)
  },

  dismiss: () => {
    ipcRenderer.send(IPC.PANEL_DISMISS)
  },

  panelExpand: () => {
    ipcRenderer.send(IPC.PANEL_EXPAND)
  },

  panelCollapse: () => {
    ipcRenderer.send(IPC.PANEL_COLLAPSE)
  },

  panelEnterDetailView: () => {
    ipcRenderer.send(IPC.PANEL_ENTER_DETAIL_VIEW)
  },

  panelExitDetailView: () => {
    ipcRenderer.send(IPC.PANEL_EXIT_DETAIL_VIEW)
  },

  clipboardWrite: (text: string) => {
    ipcRenderer.send(IPC.CLIPBOARD_WRITE, text)
  },

  panelReady: () => {
    ipcRenderer.send(IPC.PANEL_READY)
  },

  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke(IPC.SETTINGS_GET)
  },

  saveSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings)
  },

  getSettingsStatusCheck: (): Promise<SettingsRuntimeStatus> => {
    return ipcRenderer.invoke(IPC.SETTINGS_STATUS_CHECK_GET)
  },

  runSettingsStatusCheck: (): Promise<SettingsRuntimeStatus> => {
    return ipcRenderer.invoke(IPC.SETTINGS_STATUS_CHECK_RUN)
  },

  requestScreenPermission: (): Promise<ScreenPermissionRequestResult> => {
    return ipcRenderer.invoke(IPC.SETTINGS_SCREEN_PERMISSION_REQUEST)
  },

  openScreenPermissionSettings: (): Promise<ScreenPermissionSettingsResult> => {
    return ipcRenderer.invoke(IPC.SETTINGS_SCREEN_PERMISSION_OPEN)
  },

  triggerCapture: (): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke(IPC.CAPTURE_TRIGGER)
  },

  apiTest: (settings?: Partial<AppSettings>): Promise<{ ok: boolean; message: string; latencyMs: number }> => {
    return ipcRenderer.invoke(IPC.API_TEST, settings)
  },

  getHistory: () => {
    return ipcRenderer.invoke(IPC.HISTORY_LIST)
  },

  getMemory: (): Promise<MemoryItem[]> => {
    return ipcRenderer.invoke(IPC.MEMORY_LIST)
  },

  saveMemory: (payload: Omit<MemoryItem, 'id' | 'createdAt'>): Promise<MemoryItem> => {
    return ipcRenderer.invoke(IPC.MEMORY_SAVE, payload)
  },

  chatSend: (payload: { contextText: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }) => {
    return ipcRenderer.invoke(IPC.CHAT_SEND, payload)
  },

  readCaptureImageData: (
    relativePath: string
  ): Promise<{ ok: boolean; dataUrl?: string; bytes?: number; path?: string; message?: string }> => {
    return ipcRenderer.invoke(IPC.CAPTURE_READ_IMAGE_DATA, relativePath)
  },

  getStorageUsage: (): Promise<StorageUsageSummary> => {
    return ipcRenderer.invoke(IPC.STORAGE_GET_USAGE)
  },

  setStorageLimit: (maxStorageBytes: number): Promise<StorageLimitUpdateResult> => {
    return ipcRenderer.invoke(IPC.STORAGE_SET_LIMIT, maxStorageBytes)
  },

  enforceStorageLimit: (): Promise<StorageEnforceResult> => {
    return ipcRenderer.invoke(IPC.STORAGE_ENFORCE_LIMIT)
  },

  revealStoragePath: (categoryOrPath: string): Promise<{ ok: boolean; path: string }> => {
    return ipcRenderer.invoke(IPC.STORAGE_REVEAL_PATH, categoryOrPath)
  },

  copyStoragePath: (categoryOrPath: string): Promise<{ ok: boolean; path: string }> => {
    return ipcRenderer.invoke(IPC.STORAGE_COPY_PATH, categoryOrPath)
  },

  exportTimelineMarkdown: (
    payload: { fromDate?: string; toDate?: string }
  ): Promise<{ ok: boolean; path?: string; message?: string; historyCount?: number; memoryCount?: number }> => {
    return ipcRenderer.invoke(IPC.OTHER_EXPORT_TIMELINE, payload)
  },

  debugReprocessDay: (payload: { day: string }): Promise<{ ok: boolean; message: string; count?: number }> => {
    return ipcRenderer.invoke(IPC.DEBUG_REPROCESS_DAY, payload)
  },

  // ── Agent execution ──

  agentStart: (plan: AgentActionPlan): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke(IPC.AGENT_START, plan)
  },

  agentConfirm: (payload: {
    requestId: string
    actionId: string
    confirmed: boolean
    edits?: AgentActionEdits
  }): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke(IPC.AGENT_CONFIRM, payload)
  },

  onAgentStatusPush: (cb: (status: AgentStatusPush) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentStatusPush): void => cb(data)
    ipcRenderer.on(IPC.AGENT_STATUS_PUSH, handler)
    return () => ipcRenderer.removeListener(IPC.AGENT_STATUS_PUSH, handler)
  },

  agentPermissionProbe: (): Promise<AgentPermissionProbe> => {
    return ipcRenderer.invoke(IPC.AGENT_PERMISSION_PROBE)
  },

  // ── Diagnostics ──

  checkCodexCli: (): Promise<CodexCliDiagnosticResult> => {
    return ipcRenderer.invoke(IPC.DIAGNOSTICS_CHECK_CODEX_CLI)
  },

  openSystemSettings: (pane: string): Promise<{ ok: boolean; pane?: string; error?: string }> => {
    return ipcRenderer.invoke(IPC.DIAGNOSTICS_OPEN_SYSTEM_SETTINGS, pane)
  }
})
