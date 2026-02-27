import { getPanelWindow } from './panel-window'
import { getAppWindow } from './app-window'

export function broadcastToRenderers(channel: string, ...args: unknown[]): void {
  const windows = [getPanelWindow(), getAppWindow()].filter(Boolean) as Array<{
    isDestroyed: () => boolean
    webContents: { send: (ch: string, ...a: unknown[]) => void }
  }>

  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}
