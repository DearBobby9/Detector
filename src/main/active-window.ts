import { execFile } from 'child_process'
import type { ActiveWindowInfo, BrowserSessionInfo, BrowserTabInfo } from '@shared/types'

const BROWSER_APPS = new Set(['Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Safari'])

const ACTIVE_WINDOW_JXA = String.raw`
var BROWSER_APP_NAMES = ['Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Safari'];

function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function cleanString(value) {
  return safeString(value).trim();
}

function isSupportedBrowser(appName) {
  for (var i = 0; i < BROWSER_APP_NAMES.length; i += 1) {
    if (BROWSER_APP_NAMES[i] === appName) return true;
  }
  return false;
}

function buildDefaultResult() {
  return {
    appName: 'Unknown',
    windowTitle: '',
    activeUrl: '',
    tabs: [],
    browserSessions: [],
    activeTabIndex: null
  };
}

function buildSession(appName) {
  return {
    appName: appName,
    tabs: [],
    windowCount: 0,
    activeUrl: '',
    activeTabIndex: null
  };
}

function collectChromeLike(appName) {
  var browser = Application(appName);
  var session = buildSession(appName);
  var windows = [];
  try {
    windows = browser.windows();
  } catch (e) {
    windows = [];
  }
  session.windowCount = windows.length;

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

      session.tabs.push({
        index: runningIndex,
        title: title,
        url: url,
        appName: appName,
        windowIndex: wi + 1
      });

      if (activeUrl && !activeIdx && url === activeUrl) {
        activeIdx = runningIndex;
      }
      runningIndex += 1;
    }
  }

  session.activeUrl = activeUrl;
  session.activeTabIndex = activeIdx;
  return session;
}

function collectSafari() {
  var browser = Application('Safari');
  var session = buildSession('Safari');
  var windows = [];
  try {
    windows = browser.windows();
  } catch (e) {
    windows = [];
  }
  session.windowCount = windows.length;

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

      session.tabs.push({
        index: runningIndex,
        title: title,
        url: url,
        appName: 'Safari',
        windowIndex: wi + 1
      });

      if (activeUrl && !activeIdx && url === activeUrl) {
        activeIdx = runningIndex;
      }
      runningIndex += 1;
    }
  }

  session.activeUrl = activeUrl;
  session.activeTabIndex = activeIdx;
  return session;
}

function collectBrowserSession(appName) {
  try {
    if (
      appName === 'Google Chrome' ||
      appName === 'Arc' ||
      appName === 'Brave Browser' ||
      appName === 'Microsoft Edge'
    ) {
      return collectChromeLike(appName);
    }
    if (appName === 'Safari') {
      return collectSafari();
    }
  } catch (e) {}
  return null;
}

function listVisibleBrowserApps(se) {
  var result = [];
  var seen = {};
  var processes = [];
  try {
    processes = se.applicationProcesses.whose({ visible: true })();
  } catch (e) {
    processes = [];
  }

  for (var i = 0; i < processes.length; i += 1) {
    var name = '';
    try {
      name = cleanString(processes[i].name());
    } catch (e) {}
    if (!name || !isSupportedBrowser(name) || seen[name]) continue;
    seen[name] = true;
    result.push(name);
  }
  return result;
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

    var browserAppNames = listVisibleBrowserApps(se);
    if (isSupportedBrowser(result.appName)) {
      var hasFrontApp = false;
      for (var bi = 0; bi < browserAppNames.length; bi += 1) {
        if (browserAppNames[bi] === result.appName) {
          hasFrontApp = true;
          break;
        }
      }
      if (!hasFrontApp) {
        browserAppNames.unshift(result.appName);
      }
    }

    for (var i = 0; i < browserAppNames.length; i += 1) {
      var browserName = browserAppNames[i];
      var session = collectBrowserSession(browserName);
      if (!session) continue;
      if ((!session.tabs || session.tabs.length === 0) && !(session.windowCount > 0)) continue;

      result.browserSessions.push(session);

      var tabs = session.tabs || [];
      for (var ti = 0; ti < tabs.length; ti += 1) {
        result.tabs.push(tabs[ti]);
      }
    }

    if (isSupportedBrowser(result.appName)) {
      for (var si = 0; si < result.browserSessions.length; si += 1) {
        var sessionForApp = result.browserSessions[si];
        if (sessionForApp && sessionForApp.appName === result.appName) {
          if (!result.activeUrl && sessionForApp.activeUrl) {
            result.activeUrl = sessionForApp.activeUrl;
          }
          if (!result.activeTabIndex && sessionForApp.activeTabIndex) {
            result.activeTabIndex = sessionForApp.activeTabIndex;
          }
          break;
        }
      }
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
  browserSessions?: unknown
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
    const appName = toCleanString(rec.appName)
    const rawWindowIndex = Number(rec.windowIndex)
    const windowIndex = Number.isFinite(rawWindowIndex) && rawWindowIndex > 0 ? Math.floor(rawWindowIndex) : undefined
    tabs.push({ index, title, url, appName: appName || undefined, windowIndex })
  }
  return tabs
}

function normalizeBrowserSessions(raw: unknown): BrowserSessionInfo[] {
  if (!Array.isArray(raw)) return []

  const sessions: BrowserSessionInfo[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const appName = toCleanString(rec.appName)
    if (!appName) continue

    const tabs = normalizeTabs(rec.tabs).map((tab) => ({
      ...tab,
      appName: tab.appName || appName
    }))
    const rawWindowCount = Number(rec.windowCount)
    const windowCount = Number.isFinite(rawWindowCount) && rawWindowCount >= 0 ? Math.floor(rawWindowCount) : 0
    const activeUrl = toCleanString(rec.activeUrl)
    const rawActiveTabIndex = Number(rec.activeTabIndex)
    const activeTabIndex =
      Number.isFinite(rawActiveTabIndex) && rawActiveTabIndex > 0 ? Math.floor(rawActiveTabIndex) : undefined

    if (tabs.length === 0 && windowCount <= 0) continue

    sessions.push({
      appName,
      tabs,
      windowCount,
      activeUrl: activeUrl || undefined,
      activeTabIndex
    })
  }
  return sessions
}

function parseActiveWindowPayload(stdout: string): ActiveWindowInfo {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) return { appName: 'Unknown', windowTitle: '' }

  try {
    const parsed = JSON.parse(trimmed) as ActiveWindowRawPayload
    const appName = toCleanString(parsed.appName) || 'Unknown'
    const windowTitle = toCleanString(parsed.windowTitle)
    const url = toCleanString(parsed.activeUrl)
    const browserSessions = normalizeBrowserSessions(parsed.browserSessions)
    let browserTabs = normalizeTabs(parsed.tabs)
    if (browserTabs.length === 0 && browserSessions.length > 0) {
      browserTabs = browserSessions.flatMap((session) => session.tabs)
    }

    let activeTabIndex: number | undefined
    const rawActiveTabIndex = Number(parsed.activeTabIndex)
    if (Number.isFinite(rawActiveTabIndex) && rawActiveTabIndex > 0) {
      activeTabIndex = Math.floor(rawActiveTabIndex)
    }

    const sessionForActiveApp = browserSessions.find((session) => session.appName === appName)
    if (typeof activeTabIndex !== 'number' && typeof sessionForActiveApp?.activeTabIndex === 'number') {
      activeTabIndex = sessionForActiveApp.activeTabIndex
    }

    const tabsForUrlLookup = sessionForActiveApp?.tabs?.length ? sessionForActiveApp.tabs : browserTabs
    const normalizedUrl =
      url ||
      (typeof activeTabIndex === 'number'
        ? tabsForUrlLookup.find((tab) => tab.index === activeTabIndex)?.url || ''
        : '') ||
      sessionForActiveApp?.activeUrl ||
      tabsForUrlLookup[0]?.url ||
      browserTabs[0]?.url ||
      ''

    return {
      appName,
      windowTitle,
      url: normalizedUrl || undefined,
      browserTabs,
      browserSessions: browserSessions.length > 0 ? browserSessions : undefined,
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
          tabs: isBrowser ? payload.browserTabs?.length || 0 : 0,
          browserSessions: payload.browserSessions?.length || 0
        })
        resolve(payload)
      }
    )
  })
}
