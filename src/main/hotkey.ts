import { globalShortcut } from 'electron'

const HOTKEY = 'CommandOrControl+Shift+.'

export function registerHotkey(callback: () => void): boolean {
  const success = globalShortcut.register(HOTKEY, () => {
    console.log('[Hotkey] Triggered:', HOTKEY)
    callback()
  })

  if (success) {
    console.log('[Hotkey] Registered:', HOTKEY)
  } else {
    console.error('[Hotkey] Failed to register:', HOTKEY)
  }

  return success
}

export function unregisterHotkey(): void {
  globalShortcut.unregisterAll()
  console.log('[Hotkey] Unregistered all')
}
