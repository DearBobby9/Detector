import { execFile } from 'child_process'
import { app } from 'electron'
import { ActiveWindowInfo } from '@shared/types'

const APPLE_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set winTitle to ""
  try
    set winTitle to name of front window of frontApp
  end try
end tell
return appName & "|||" & winTitle
`

export async function getActiveWindow(): Promise<ActiveWindowInfo> {
  // In development, skip Apple Events by default to avoid TCC automation friction.
  // Set ENABLE_ACTIVE_WINDOW_IN_DEV=1 if you want to force AppleScript lookup in dev.
  if (!app.isPackaged && process.env.ENABLE_ACTIVE_WINDOW_IN_DEV !== '1') {
    return { appName: 'Unknown', windowTitle: '' }
  }

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', APPLE_SCRIPT], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        console.error('[ActiveWindow] Failed to get active window:', error.message)
        resolve({ appName: 'Unknown', windowTitle: '' })
        return
      }

      const parts = stdout.trim().split('|||')
      const appName = parts[0] || 'Unknown'
      const windowTitle = parts[1] || ''

      console.log('[ActiveWindow] Active:', { appName, windowTitle })
      resolve({ appName, windowTitle })
    })
  })
}
