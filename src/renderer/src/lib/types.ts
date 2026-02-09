import type { AppSettings, ChatMessage, DetectionResult, HistoryRecord } from '@shared/types'

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
  clipboardWrite: (text: string) => void
  panelReady: () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  triggerCapture: () => Promise<{ ok: boolean }>
  apiTest: (settings?: Partial<AppSettings>) => Promise<{ ok: boolean; message: string; latencyMs: number }>
  getHistory: () => Promise<HistoryRecord[]>
  chatSend: (payload: { contextText: string; messages: ChatMessage[] }) => Promise<{ ok: boolean; text: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
