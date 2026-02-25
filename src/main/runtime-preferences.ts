import { app } from 'electron'
import type { AppSettings } from '@shared/types'

export function applyRuntimeSettings(settings: AppSettings): { launchAtLoginApplied: boolean; dockApplied: boolean } {
  let launchAtLoginApplied = false
  let dockApplied = false

  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.launchAtLogin)
    })
    launchAtLoginApplied = true
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn('[Settings] Failed to apply launchAtLogin:', reason)
  }

  if (process.platform === 'darwin') {
    try {
      if (settings.showDockIcon) {
        app.dock?.show()
      } else {
        app.dock?.hide()
      }
      dockApplied = true
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn('[Settings] Failed to apply dock visibility:', reason)
    }
  }

  return { launchAtLoginApplied, dockApplied }
}

export function getLaunchAtLoginState(): boolean {
  try {
    return Boolean(app.getLoginItemSettings().openAtLogin)
  } catch {
    return false
  }
}
