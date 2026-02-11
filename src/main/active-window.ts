import { execFile } from 'child_process'
import type { ActiveWindowInfo, BrowserTabInfo } from '@shared/types'

const BROWSER_APPS = new Set(['Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Safari'])

const ACTIVE_WINDOW_JXA = String.raw`
function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function cleanString(value) {
  return safeString(value).trim();
}

function buildDefaultResult() {
  return {
    appName: 'Unknown',
    windowTitle: '',
    activeUrl: '',
    tabs: [],
    activeTabIndex: null
  };
}

function collectChromeLike(appName, result) {
  var browser = Application(appName);
  var windows = [];
  try {
    windows = browser.windows();
  } catch (e) {
    windows = [];
  }

  var activeUrl = '';
  try {
    if (windows.length > 0) {
      var active = windows[0].activeTab();
      activeUrl = cleanString(active.url());
    }
  } catch (e) {}

  var runningIndex = 1;
  var activeIdx = null;
  for (var wi = 0; wi < windows.length; wi += 1) {
    var tabs = [];
    try {
      tabs = windows[wi].tabs();
    } catch (e) {
      tabs = [];
    }

    for (var ti = 0; ti < tabs.length; ti += 1) {
      var tab = tabs[ti];
      var title = '';
      var url = '';
      try {
        title = cleanString(tab.title());
      } catch (e) {}
      try {
        url = cleanString(tab.url());
      } catch (e) {}
      if (!title && !url) continue;

      result.tabs.push({
        index: runningIndex,
        title: title,
        url: url
      });

      if (activeUrl && !activeIdx && url === activeUrl) {
        activeIdx = runningIndex;
      }
      runningIndex += 1;
    }
  }

  result.activeUrl = activeUrl;
  result.activeTabIndex = activeIdx;
}

function collectSafari(result) {
  var browser = Application('Safari');
  var windows = [];
  try {
    windows = browser.windows();
  } catch (e) {
    windows = [];
  }

  var activeUrl = '';
  var activeIdx = null;
  var runningIndex = 1;

  for (var wi = 0; wi < windows.length; wi += 1) {
    var tabs = [];
    try {
      tabs = windows[wi].tabs();
    } catch (e) {
      tabs = [];
    }

    var currentTab = null;
    if (wi === 0) {
      try {
        currentTab = windows[wi].currentTab();
      } catch (e) {
        currentTab = null;
      }
    }

    if (wi === 0 && currentTab) {
      try {
        activeUrl = cleanString(currentTab.url());
      } catch (e) {}
    }

    for (var ti = 0; ti < tabs.length; ti += 1) {
      var tab = tabs[ti];
      var title = '';
      var url = '';
      try {
        title = cleanString(tab.name());
      } catch (e) {}
      try {
        url = cleanString(tab.url());
      } catch (e) {}
      if (!title && !url) continue;

      result.tabs.push({
        index: runningIndex,
        title: title,
        url: url
      });

      if (activeUrl && !activeIdx && url === activeUrl) {
        activeIdx = runningIndex;
      }
      runningIndex += 1;
    }
  }

  result.activeUrl = activeUrl;
  result.activeTabIndex = activeIdx;
}

function run() {
  var result = buildDefaultResult();
  try {
    var se = Application('System Events');
    var frontApps = se.applicationProcesses.whose({ frontmost: true });
    if (!frontApps || frontApps.length === 0) return JSON.stringify(result);

    var frontApp = frontApps[0];
    result.appName = cleanString(frontApp.name()) || 'Unknown';
    try {
      result.windowTitle = cleanString(frontApp.windows[0].name());
    } catch (e) {}

    if (
      result.appName === 'Google Chrome' ||
      result.appName === 'Arc' ||
      result.appName === 'Brave Browser' ||
      result.appName === 'Microsoft Edge'
    ) {
      collectChromeLike(result.appName, result);
    } else if (result.appName === 'Safari') {
      collectSafari(result);
    }
  } catch (e) {}
  return JSON.stringify(result);
}
`

interface ActiveWindowRawPayload {
  appName?: unknown
  windowTitle?: unknown
  activeUrl?: unknown
  tabs?: unknown
  activeTabIndex?: unknown
}

function toCleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTabs(raw: unknown): BrowserTabInfo[] {
  if (!Array.isArray(raw)) return []

  const tabs: BrowserTabInfo[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const title = toCleanString(rec.title)
    const url = toCleanString(rec.url)
    if (!title && !url) continue

    const maybeIndex = Number(rec.index)
    const index = Number.isFinite(maybeIndex) && maybeIndex > 0 ? Math.floor(maybeIndex) : tabs.length + 1
    tabs.push({ index, title, url })
  }
  return tabs
}

function parseActiveWindowPayload(stdout: string): ActiveWindowInfo {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) return { appName: 'Unknown', windowTitle: '' }

  try {
    const parsed = JSON.parse(trimmed) as ActiveWindowRawPayload
    const appName = toCleanString(parsed.appName) || 'Unknown'
    const windowTitle = toCleanString(parsed.windowTitle)
    const url = toCleanString(parsed.activeUrl)
    const browserTabs = normalizeTabs(parsed.tabs)

    let activeTabIndex: number | undefined
    const rawActiveTabIndex = Number(parsed.activeTabIndex)
    if (Number.isFinite(rawActiveTabIndex) && rawActiveTabIndex > 0) {
      activeTabIndex = Math.floor(rawActiveTabIndex)
    }

    const normalizedUrl =
      url ||
      (typeof activeTabIndex === 'number'
        ? browserTabs.find((tab) => tab.index === activeTabIndex)?.url || ''
        : browserTabs[0]?.url || '')

    return {
      appName,
      windowTitle,
      url: normalizedUrl || undefined,
      browserTabs,
      activeTabIndex
    }
  } catch {
    return { appName: 'Unknown', windowTitle: '' }
  }
}

export async function getActiveWindow(): Promise<ActiveWindowInfo> {
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', '-e', ACTIVE_WINDOW_JXA],
      { timeout: 7000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          console.error('[ActiveWindow] Failed to get active window:', error.message)
          resolve({ appName: 'Unknown', windowTitle: '' })
          return
        }

        const payload = parseActiveWindowPayload(stdout)
        const isBrowser = BROWSER_APPS.has(payload.appName)
        console.log('[ActiveWindow] Active:', {
          appName: payload.appName,
          windowTitle: payload.windowTitle,
          url: payload.url || undefined,
          tabs: isBrowser ? payload.browserTabs?.length || 0 : 0
        })
        resolve(payload)
      }
    )
  })
}
