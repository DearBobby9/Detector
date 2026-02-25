import { globalShortcut } from 'electron'

const HOTKEY = 'CommandOrControl+Shift+.'
let hotkeyRegistered = false

export function registerHotkey(callback: () => void): boolean {
  const success = globalShortcut.register(HOTKEY, () => {
    console.log('[Hotkey] Triggered:', HOTKEY)
    callback()
  })

  hotkeyRegistered = success

  if (success) {
    console.log('[Hotkey] Registered:', HOTKEY)
  } else {
    console.error('[Hotkey] Failed to register:', HOTKEY)
  }

  return success
}

export function unregisterHotkey(): void {
  globalShortcut.unregisterAll()
  hotkeyRegistered = false
  console.log('[Hotkey] Unregistered all')
}

export function isHotkeyRegistered(): boolean {
  return hotkeyRegistered
}
