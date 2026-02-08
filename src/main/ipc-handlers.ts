import { ipcMain, clipboard } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { hidePanel } from './panel-window'

export function registerIpcHandlers(): void {
  ipcMain.on(IPC.PANEL_DISMISS, () => {
    console.log('[IPC] Dismiss received')
    hidePanel()
  })

  ipcMain.on(IPC.CLIPBOARD_WRITE, (_event, text: string) => {
    clipboard.writeText(text)
    console.log('[IPC] Copied to clipboard:', text.substring(0, 50) + '...')
  })

  ipcMain.on(IPC.PANEL_READY, () => {
    console.log('[IPC] Panel renderer ready')
  })

  console.log('[IPC] Handlers registered')
}
