import { desktopCapturer, shell, systemPreferences } from 'electron'
import type { PermissionStatus, ScreenPermissionRequestResult, ScreenPermissionSettingsResult } from '@shared/types'

const SCREEN_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

function normalizePermission(raw: unknown): PermissionStatus {
  if (
    raw === 'granted' ||
    raw === 'denied' ||
    raw === 'restricted' ||
    raw === 'not-determined' ||
    raw === 'unknown'
  ) {
    return raw
  }
  return 'unknown'
}

export function getScreenPermissionStatus(): PermissionStatus {
  if (process.platform !== 'darwin') return 'unknown'
  try {
    return normalizePermission(systemPreferences.getMediaAccessStatus('screen'))
  } catch {
    return 'unknown'
  }
}

export async function requestScreenPermissionAccess(): Promise<ScreenPermissionRequestResult> {
  const before = getScreenPermissionStatus()

  if (before === 'granted') {
    return {
      ok: true,
      status: before,
      prompted: false,
      message: 'Screen recording permission is already granted.'
    }
  }

  if (before === 'denied' || before === 'restricted') {
    return {
      ok: false,
      status: before,
      prompted: false,
      message: 'Screen recording permission is denied. Open System Settings to allow Detector.'
    }
  }

  try {
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 16, height: 16 }
    })
  } catch {
    // The permission prompt may still have been shown; we re-check status below.
  }

  const after = getScreenPermissionStatus()
  if (after === 'granted') {
    return {
      ok: true,
      status: after,
      prompted: true,
      message: 'Screen recording permission granted.'
    }
  }

  return {
    ok: false,
    status: after,
    prompted: true,
    message: 'Permission request sent. If it remains denied, allow Detector in System Settings.'
  }
}

export async function openScreenPermissionSettings(): Promise<ScreenPermissionSettingsResult> {
  try {
    await shell.openExternal(SCREEN_SETTINGS_URL)
    return {
      ok: true,
      status: getScreenPermissionStatus(),
      url: SCREEN_SETTINGS_URL
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      status: getScreenPermissionStatus(),
      url: SCREEN_SETTINGS_URL,
      message: reason
    }
  }
}
