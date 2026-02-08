/// <reference types="vite/client" />

import type { ElectronAPI } from './lib/types'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
