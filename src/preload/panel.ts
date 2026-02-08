import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { DetectionResult } from '@shared/types'

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
  }
})
