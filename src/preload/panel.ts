import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  AppSettings,
  DetectionResult,
  MemoryItem,
  StorageEnforceResult,
  StorageLimitUpdateResult,
  StorageUsageSummary
} from '@shared/types'

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
  }
})
