import type { DetectionResult } from '@shared/types'

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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
