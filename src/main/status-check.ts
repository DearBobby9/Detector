import { execFile } from 'child_process'
import type { CaptureServiceStatus, PermissionStatus, SettingsRuntimeStatus } from '@shared/types'
import { getActiveWindow } from './active-window'
import { getScreenPermissionStatus } from './screen-permission'

const AUTOMATION_PROBE_JXA = String.raw`
function isBrowserApp(name) {
  return name === 'Google Chrome' ||
    name === 'Arc' ||
    name === 'Brave Browser' ||
    name === 'Microsoft Edge' ||
    name === 'Safari';
}

function run() {
  var payload = { visibleBrowsers: 0, visibleProcesses: 0 };
  try {
    var se = Application('System Events');
    var processes = se.applicationProcesses.whose({ visible: true })();
    payload.visibleProcesses = processes.length;
    for (var i = 0; i < processes.length; i += 1) {
      var name = '';
      try { name = String(processes[i].name()); } catch (e) {}
      if (isBrowserApp(name)) payload.visibleBrowsers += 1;
    }
  } catch (e) {
    throw e;
  }
  return JSON.stringify(payload);
}
`

interface AutomationProbeResult {
  permission: PermissionStatus
  visibleBrowsers: number
}

let lastRuntimeStatus: SettingsRuntimeStatus = {
  screenPermission: 'unknown',
  automationPermission: 'unknown',
  captureService: 'idle',
  lastCheckedAt: 0
}

function isAutomationDeniedMessage(text: string): boolean {
  const value = text.toLowerCase()
  return (
    value.includes('not authorized') ||
    value.includes('not permitted') ||
    value.includes('operation not permitted') ||
    value.includes('(-1743)') ||
    value.includes('osstatus error -1743')
  )
}

function probeAutomationPermission(): Promise<AutomationProbeResult> {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', AUTOMATION_PROBE_JXA, '-e', 'run();'],
      { timeout: 4500 },
      (error, stdout, stderr) => {
        if (error) {
          const reason = `${error.message || ''} ${stderr || ''}`.trim()
          if (isAutomationDeniedMessage(reason)) {
            resolve({ permission: 'denied', visibleBrowsers: 0 })
            return
          }
          resolve({ permission: 'unknown', visibleBrowsers: 0 })
          return
        }

        try {
          const parsed = JSON.parse(String(stdout || '{}')) as { visibleBrowsers?: unknown }
          const visibleBrowsers = Number(parsed.visibleBrowsers)
          resolve({
            permission: 'granted',
            visibleBrowsers: Number.isFinite(visibleBrowsers) ? Math.max(0, Math.floor(visibleBrowsers)) : 0
          })
        } catch {
          resolve({ permission: 'unknown', visibleBrowsers: 0 })
        }
      }
    )
  })
}

function hasCollectedBrowserMetadata(activeWindow: Awaited<ReturnType<typeof getActiveWindow>>): boolean {
  const sessions = Array.isArray(activeWindow.browserSessions) ? activeWindow.browserSessions : []
  const tabsFromSessions = sessions.reduce((sum, session) => sum + (Array.isArray(session.tabs) ? session.tabs.length : 0), 0)
  const flatTabs = Array.isArray(activeWindow.browserTabs) ? activeWindow.browserTabs.length : 0
  return tabsFromSessions > 0 || flatTabs > 0
}

export function getLastSettingsRuntimeStatus(): SettingsRuntimeStatus {
  return lastRuntimeStatus
}

export async function runStatusCheck(
  getCaptureServiceStatus: () => CaptureServiceStatus
): Promise<SettingsRuntimeStatus> {
  const [automationProbe, activeWindow] = await Promise.all([
    probeAutomationPermission(),
    getActiveWindow().catch(() => ({ appName: 'Unknown', windowTitle: '' }))
  ])

  const metadataAvailable = hasCollectedBrowserMetadata(activeWindow)
  let automationPermission: PermissionStatus = 'unknown'
  if (metadataAvailable) {
    automationPermission = 'granted'
  } else if (automationProbe.permission === 'denied') {
    automationPermission = 'denied'
  } else if (automationProbe.permission === 'granted' && automationProbe.visibleBrowsers > 0) {
    // Browser(s) visible but tab metadata missing usually means browser automation is blocked.
    automationPermission = 'denied'
  } else if (automationProbe.permission === 'granted') {
    automationPermission = 'not-determined'
  } else {
    automationPermission = automationProbe.permission
  }

  const status: SettingsRuntimeStatus = {
    screenPermission: getScreenPermissionStatus(),
    automationPermission,
    captureService: getCaptureServiceStatus(),
    lastCheckedAt: Date.now()
  }

  lastRuntimeStatus = status
  return status
}
