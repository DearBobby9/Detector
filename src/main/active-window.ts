import { execFile } from 'child_process'
import { app } from 'electron'
import { ActiveWindowInfo } from '@shared/types'

const APPLE_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set winTitle to ""
  set activeUrl to ""
  try
    set winTitle to name of front window of frontApp
  end try
end tell
try
  if appName is "Safari" then
    tell application "Safari" to set activeUrl to URL of front document
  else if appName is "Google Chrome" then
    tell application "Google Chrome" to set activeUrl to URL of active tab of front window
  else if appName is "Arc" then
    tell application "Arc" to set activeUrl to URL of active tab of front window
  else if appName is "Brave Browser" then
    tell application "Brave Browser" to set activeUrl to URL of active tab of front window
  else if appName is "Microsoft Edge" then
    tell application "Microsoft Edge" to set activeUrl to URL of active tab of front window
  end if
end try
return appName & "|||" & winTitle & "|||" & activeUrl
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
      const url = parts[2] || ''

      console.log('[ActiveWindow] Active:', { appName, windowTitle, url: url || undefined })
      resolve({ appName, windowTitle, url: url || undefined })
    })
  })
}
