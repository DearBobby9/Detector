import type {
  AppSettings,
  ChatMessage,
  DetectionResult,
  HistoryRecord,
  MemoryItem,
  ScreenPermissionRequestResult,
  ScreenPermissionSettingsResult,
  SettingsRuntimeStatus,
  StorageEnforceResult,
  StorageLimitUpdateResult,
  StorageUsageSummary
} from '@shared/types'

export type PanelState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'result'; data: DetectionResult }
  | { status: 'error'; message: string }

export interface ElectronAPI {
  onShowLoading: (callback: () => void) => () => void
  onShowResult: (callback: (result: DetectionResult) => void) => () => void
  onShowError: (callback: (message: string) => void) => () => void
  dismiss: () => void
  panelExpand: () => void
  panelCollapse: () => void
  panelEnterDetailView: () => void
  panelExitDetailView: () => void
  clipboardWrite: (text: string) => void
  panelReady: () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  getSettingsStatusCheck: () => Promise<SettingsRuntimeStatus>
  runSettingsStatusCheck: () => Promise<SettingsRuntimeStatus>
  requestScreenPermission: () => Promise<ScreenPermissionRequestResult>
  openScreenPermissionSettings: () => Promise<ScreenPermissionSettingsResult>
  triggerCapture: () => Promise<{ ok: boolean }>
  apiTest: (settings?: Partial<AppSettings>) => Promise<{ ok: boolean; message: string; latencyMs: number }>
  getHistory: () => Promise<HistoryRecord[]>
  getMemory: () => Promise<MemoryItem[]>
  saveMemory: (payload: Omit<MemoryItem, 'id' | 'createdAt'>) => Promise<MemoryItem>
  chatSend: (payload: { contextText: string; messages: ChatMessage[] }) => Promise<{ ok: boolean; text: string }>
  readCaptureImageData: (
    relativePath: string
  ) => Promise<{ ok: boolean; dataUrl?: string; bytes?: number; path?: string; message?: string }>
  getStorageUsage: () => Promise<StorageUsageSummary>
  setStorageLimit: (maxStorageBytes: number) => Promise<StorageLimitUpdateResult>
  enforceStorageLimit: () => Promise<StorageEnforceResult>
  revealStoragePath: (categoryOrPath: string) => Promise<{ ok: boolean; path: string }>
  copyStoragePath: (categoryOrPath: string) => Promise<{ ok: boolean; path: string }>
  exportTimelineMarkdown: (payload: {
    fromDate?: string
    toDate?: string
  }) => Promise<{ ok: boolean; path?: string; message?: string; historyCount?: number; memoryCount?: number }>
  debugReprocessDay: (payload: { day: string }) => Promise<{ ok: boolean; message: string; count?: number }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
