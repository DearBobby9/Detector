import { ipcMain, clipboard } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { AppSettings, ChatMessage } from '@shared/types'
import { hidePanel } from './panel-window'
import { getSettings, saveSettings } from './settings'
import { getHistory } from './database'
import { apiTest, sendChat } from './chat-api'

interface IpcHandlerActions {
  triggerCapture: () => Promise<void>
}

export function registerIpcHandlers(actions: IpcHandlerActions): void {
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

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return getSettings()
  })

  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, settings: Partial<AppSettings>) => {
    return saveSettings(settings)
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

  console.log('[IPC] Handlers registered')
}
