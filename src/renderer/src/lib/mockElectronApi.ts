import type { ElectronAPI } from './types'
import type {
  AppSettings,
  ChatMessage,
  DetectionResult,
  HistoryRecord,
  MemoryItem,
  ScreenPermissionRequestResult,
  ScreenPermissionSettingsResult,
  SettingsRuntimeStatus,
  ScreenshotAsset,
  StorageCategoryUsage,
  StorageEnforceResult,
  StorageLimitUpdateResult,
  StorageUsageSummary
} from '@shared/types'

const MOCK_SETTINGS_STORAGE_KEY = 'detector.mockSettings'
const MOCK_MEMORY_STORAGE_KEY = 'detector.mockMemory'

const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o',
  apiTimeoutMs: 30000,
  chatProvider: 'api',
  codexCliPath: 'codex',
  codexCliModel: '',
  codexCliTimeoutMs: 120000,
  maxStorageBytes: 512 * 1024 * 1024,
  themeMode: 'light',
  launchAtLogin: false,
  showDockIcon: false,
  shareCrashReports: false,
  shareAnonymousUsage: false,
  showTimelineIcons: false,
  outputLanguageOverride: '',
  capturePromptTemplate: undefined,
  chatPromptTemplate: undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(MOCK_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = safeJsonParse<Partial<AppSettings>>(raw)
    if (!parsed) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(MOCK_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

function loadMemory(): MemoryItem[] {
  try {
    const raw = window.localStorage.getItem(MOCK_MEMORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = safeJsonParse<MemoryItem[]>(raw)
    if (!parsed) return []
    return parsed
  } catch {
    return []
  }
}

function saveMemoryToStorage(items: MemoryItem[]): void {
  try {
    window.localStorage.setItem(MOCK_MEMORY_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

function createMockScreenshotDataUrl(asset: ScreenshotAsset, title: string): string {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeDisplay = asset.displayId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="55%" stop-color="#e2e8f0" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${asset.width}" height="${asset.height}" fill="url(#bg)" />
  <rect x="${Math.round(asset.width * 0.06)}" y="${Math.round(asset.height * 0.12)}" width="${Math.round(asset.width * 0.88)}" height="${Math.round(asset.height * 0.76)}" rx="${Math.round(asset.width * 0.02)}" fill="rgba(255,255,255,0.72)" stroke="#94a3b8" />
  <text x="50%" y="46%" text-anchor="middle" fill="#1e293b" font-size="${Math.max(20, Math.round(asset.width * 0.03))}" font-family="ui-sans-serif, system-ui, -apple-system">Detector Screenshot</text>
  <text x="50%" y="54%" text-anchor="middle" fill="#475569" font-size="${Math.max(14, Math.round(asset.width * 0.018))}" font-family="ui-sans-serif, system-ui, -apple-system">${safeDisplay}</text>
  <text x="50%" y="62%" text-anchor="middle" fill="#64748b" font-size="${Math.max(13, Math.round(asset.width * 0.015))}" font-family="ui-sans-serif, system-ui, -apple-system">${safeTitle}</text>
</svg>`.trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildMockScreenshotAssets(recordId: number): ScreenshotAsset[] {
  const dir = `captures/${recordId}`
  return [
    {
      displayId: 'Display 1',
      relativePath: `${dir}/display-1.jpg`,
      width: 2560,
      height: 1440,
      bytes: 268_000,
      mime: 'image/jpeg'
    },
    {
      displayId: 'Display 2',
      relativePath: `${dir}/display-2.jpg`,
      width: 1920,
      height: 1080,
      bytes: 182_000,
      mime: 'image/jpeg'
    }
  ]
}

function makeMockHistory(): HistoryRecord[] {
  const now = Date.now()
  const records: HistoryRecord[] = []

  const mk = (id: number, minutesAgo: number, title: string): HistoryRecord => {
    const payload: DetectionResult =
      id % 3 === 0
        ? {
            type: 'email-reply',
            subject: title,
            originalSender: 'alex@example.com',
            draft: 'Thanks for the context. Here is a draft reply...'
          }
        : {
            type: 'page-summary',
            title,
            summary: 'This is a mock summary used for browser UI preview.',
            keyPoints: ['Clear hierarchy', 'Sidebar scroll inside card', 'Natural popover transitions']
          }

    return {
      id,
      timestamp: now - minutesAgo * 60 * 1000,
      activeApp: 'Browser Preview',
      windowTitle: title,
      resultType: payload.type,
      resultJson: JSON.stringify(payload)
    }
  }

  // Enough items to force scrolling.
  const titles = [
    'API Configuration Settings Interface',
    'Developer Workspace with Electron',
    'Coding and Project Collaboration Notes',
    'Screen & System Audio Recording Guide',
    'Unity 6 Development Environment',
    'Multi-Window Development Setup',
    'Split Screen: Live Sports Streaming',
    'Claude OAuth 登录与配置',
    '软件更新内容简介',
    'macOS 解除 .gar.tz 文档说明',
    '新闻调研分析',
    '项目调研需求分析',
    'NVIDIA API 模型有效性',
    'GitHub CLI 配置与更新'
  ]

  let id = 1
  let minutesAgo = 5
  for (let i = 0; i < 28; i++) {
    records.push(mk(id++, minutesAgo, titles[i % titles.length]!))
    minutesAgo += i < 12 ? 12 : 45
  }

  // Add some older records to create "Yesterday" section.
  for (let i = 0; i < 14; i++) {
    records.push(mk(id++, 60 * 24 + 60 * 2 + i * 35, titles[(i + 3) % titles.length]!))
  }

  // Add a recent "capture-analysis" record with richer metadata so app UI can be previewed
  // in a regular browser (no Electron capture required).
  const chromeTabs = Array.from({ length: 20 }).map((_, idx) => {
    const n = idx + 1
    const domain =
      n % 5 === 0
        ? 'arxiv.org'
        : n % 5 === 1
          ? 'mail.google.com'
          : n % 5 === 2
            ? 'github.com'
            : n % 5 === 3
              ? 'docs.openai.com'
              : 'news.ycombinator.com'
    return {
      title: `Tab ${n}: Research / Notes / Docs`,
      url: `https://${domain}/example/${n}`
    }
  })

  const capturePayload: DetectionResult = {
    type: 'capture-analysis',
    screenTitle: 'Chrome session (tab metadata)',
    email: { detected: false, confidence: 0.12, evidence: [] },
    memoryCandidates: [
      {
        kind: 'reading',
        title: 'Save 3 papers to finish later',
        details: 'Capture tabs: identify unfinished papers and add a short note.',
        dueAt: null,
        source: 'Browser tabs',
        confidence: 0.66
      },
      {
        kind: 'todo',
        title: 'Reply to one pending email',
        details: 'Draft reply with the captured context.',
        dueAt: null,
        source: 'Mail tab',
        confidence: 0.58
      }
    ],
    // Non-typed, UI-only payload for demo screenshots.
    metadata: {
      activeApp: 'Google Chrome',
      windowTitle: 'Quorum (20 tabs)',
      activeUrl: 'https://quorum.example.com/call-room',
      tabs: chromeTabs,
      capturedAt: now - 2 * 60 * 1000
    } as any
  } as any

  const captureRecordId = id++
  records.push({
    id: captureRecordId,
    timestamp: now - 2 * 60 * 1000,
    activeApp: 'Google Chrome',
    windowTitle: 'Quorum (20 tabs)',
    resultType: capturePayload.type,
    resultJson: JSON.stringify(capturePayload),
    screenshots: buildMockScreenshotAssets(captureRecordId),
    screenshotPersistedAt: now - 2 * 60 * 1000
  })

  return records.sort((a, b) => a.timestamp - b.timestamp)
}

export function createMockElectronAPI(): ElectronAPI {
  const loadingListeners = new Set<() => void>()
  const resultListeners = new Set<(result: DetectionResult) => void>()
  const errorListeners = new Set<(message: string) => void>()

  let settings = loadSettings()
  let history = makeMockHistory()
  let nextHistoryId = (history[history.length - 1]?.id ?? 0) + 1
  let memory = loadMemory()
  let nextMemoryId = (memory[memory.length - 1]?.id ?? 0) + 1
  let runtimeStatus: SettingsRuntimeStatus = {
    screenPermission: 'granted',
    automationPermission: 'granted',
    captureService: 'idle',
    lastCheckedAt: Date.now()
  }
  const mockUserDataRoot = '/Users/you/Library/Application Support/detector'
  const mockScreenshotDataByPath = new Map<string, string>()

  const getRecordScreenshots = (record: HistoryRecord): ScreenshotAsset[] => {
    return Array.isArray(record.screenshots) ? record.screenshots : []
  }

  const seedScreenshotDataForRecord = (record: HistoryRecord): void => {
    const screenshots = getRecordScreenshots(record)
    const title = record.windowTitle || `Capture ${record.id ?? ''}`.trim()
    for (const asset of screenshots) {
      if (!mockScreenshotDataByPath.has(asset.relativePath)) {
        mockScreenshotDataByPath.set(asset.relativePath, createMockScreenshotDataUrl(asset, title))
      }
    }
  }

  for (const record of history) {
    seedScreenshotDataForRecord(record)
  }

  const getMockStorageUsage = (): StorageUsageSummary => {
    const screenshotAssets = history.flatMap((record) => getRecordScreenshots(record))
    const screenshotsBytes = screenshotAssets.reduce(
      (sum, asset) => sum + (Number.isFinite(asset.bytes) ? Math.max(0, asset.bytes) : 0),
      0
    )

    const historyBytes = new Blob([JSON.stringify(history)]).size
    const memoryBytes = new Blob([JSON.stringify(memory)]).size
    const categories: StorageCategoryUsage[] = [
      {
        key: 'history',
        label: 'Capture history',
        bytes: historyBytes,
        path: `${mockUserDataRoot}/history.json`,
        itemCount: history.length
      },
      {
        key: 'memory',
        label: 'Saved memory',
        bytes: memoryBytes,
        path: `${mockUserDataRoot}/memory.json`,
        itemCount: memory.length
      },
      {
        key: 'screenshots',
        label: 'Screenshots',
        bytes: screenshotsBytes,
        path: `${mockUserDataRoot}/captures`,
        itemCount: screenshotAssets.length
      }
    ]
    const usedBytes = categories.reduce((sum, c) => sum + c.bytes, 0)
    const maxBytes = settings.maxStorageBytes
    const percent = maxBytes > 0 ? (usedBytes / maxBytes) * 100 : 0
    return {
      usedBytes,
      maxBytes,
      percent,
      isOverLimit: usedBytes > maxBytes,
      categories,
      prunableBytes: historyBytes + screenshotsBytes
    }
  }

  return {
    onShowLoading: (callback) => {
      loadingListeners.add(callback)
      return () => loadingListeners.delete(callback)
    },
    onShowResult: (callback) => {
      resultListeners.add(callback)
      return () => resultListeners.delete(callback)
    },
    onShowError: (callback) => {
      errorListeners.add(callback)
      return () => errorListeners.delete(callback)
    },
    dismiss: () => {
      // noop in browser preview
    },
    panelExpand: () => {
      // noop in browser preview
    },
    panelCollapse: () => {
      // noop in browser preview
    },
    panelEnterDetailView: () => {
      // noop in browser preview
    },
    panelExitDetailView: () => {
      // noop in browser preview
    },
    clipboardWrite: (text: string) => {
      void (async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          // ignore
        }
      })()
    },
    panelReady: () => {
      // noop in browser preview
    },
    getSettings: async () => {
      return settings
    },
    saveSettings: async (next) => {
      settings = { ...settings, ...next }
      saveSettings(settings)
      return settings
    },
    getSettingsStatusCheck: async () => {
      return runtimeStatus
    },
    runSettingsStatusCheck: async () => {
      await sleep(240)
      runtimeStatus = {
        screenPermission: 'granted',
        automationPermission: 'granted',
        captureService: 'idle',
        lastCheckedAt: Date.now()
      }
      return runtimeStatus
    },
    requestScreenPermission: async (): Promise<ScreenPermissionRequestResult> => {
      await sleep(180)
      runtimeStatus = {
        ...runtimeStatus,
        screenPermission: 'granted',
        lastCheckedAt: Date.now()
      }
      return {
        ok: true,
        status: 'granted',
        prompted: true,
        message: 'Screen recording permission granted (mock).'
      }
    },
    openScreenPermissionSettings: async (): Promise<ScreenPermissionSettingsResult> => {
      await sleep(60)
      return {
        ok: true,
        status: runtimeStatus.screenPermission,
        url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      }
    },
    triggerCapture: async () => {
      for (const cb of loadingListeners) cb()
      await sleep(450)

      const result: DetectionResult = {
        type: 'capture-analysis',
        screenTitle: `Mock Capture ${nextHistoryId}`,
        email: { detected: false, confidence: 0.22, evidence: [] },
        memoryCandidates: [
          {
            kind: 'todo',
            title: 'Follow up on package delivery ETA',
            details: 'Check tracking page for updated date',
            dueAt: null,
            source: 'Tracking: arrives Feb 14',
            confidence: 0.78
          },
          {
            kind: 'reading',
            title: 'Reading list (Chrome tabs: 20)',
            details: [
              '- Quotaio model ID list and evaluation notes',
              '- How to handle current issue (debug checklist)',
              '- Read Claude code settings docs',
              '- GitHub CLI configuration update guide',
              '- Linux multi-account proxy setup',
              '- macOS .gar.tz decryption walkthrough',
              '- News research: competitive analysis',
              '- Project research requirements draft',
              '- NVIDIA API model validity benchmark',
              '- Electron app debugging session recap',
              '- Electron + Vite multi-window patterns',
              '- Unity 6 VR/AR development environment',
              '- Screen & system audio recording tips',
              '- Split screen: live football match pipeline',
              '- Split screen: live sports streaming notes',
              '- WebAgent: google-search integration',
              '- Webfetch constraints and caching strategy',
              '- Reading list: papers from call room',
              '- Follow-up: delivery tracking for new purchase',
              '- Detector UI refinements and sidebar hierarchy'
            ].join('\n'),
            dueAt: null,
            source: 'Google Chrome',
            confidence: 0.87
          },
          {
            kind: 'reading',
            title: 'Finish 3 open papers from the call room',
            details: 'Save URLs + note key claims',
            dueAt: null,
            source: 'Multiple PDF tabs visible',
            confidence: 0.64
          }
        ]
      }

      const id = nextHistoryId++
      const screenshots = buildMockScreenshotAssets(id)
      const createdAt = Date.now()
      const record: HistoryRecord = {
        id,
        timestamp: createdAt,
        activeApp: 'Browser Preview',
        windowTitle: result.screenTitle,
        resultType: result.type,
        resultJson: JSON.stringify(result),
        screenshots,
        screenshotPersistedAt: createdAt
      }

      history = [...history, record]
      seedScreenshotDataForRecord(record)

      for (const cb of resultListeners) cb(result)
      return { ok: true }
    },
    apiTest: async () => {
      const start = performance.now()
      await sleep(220)
      const latencyMs = Math.round(performance.now() - start)
      const label = settings.chatProvider === 'codex-cli' ? 'Codex CLI' : 'API'
      return { ok: true, message: `${label} mock health check ok`, latencyMs }
    },
    getHistory: async () => {
      return history
    },
    getMemory: async () => {
      return memory
    },
    saveMemory: async (payload: Omit<MemoryItem, 'id' | 'createdAt'>) => {
      const item: MemoryItem = {
        id: nextMemoryId++,
        createdAt: Date.now(),
        ...payload
      }
      memory = [...memory, item]
      saveMemoryToStorage(memory)
      return item
    },
    chatSend: async (payload: { contextText: string; messages: ChatMessage[] }) => {
      const last = payload.messages[payload.messages.length - 1]?.content ?? ''
      await sleep(280)
      return { ok: true, text: `Mock reply (browser preview): ${last.slice(0, 80)}` }
    },
    readCaptureImageData: async (
      relativePath: string
    ): Promise<{ ok: boolean; dataUrl?: string; bytes?: number; path?: string; message?: string }> => {
      const trimmed = String(relativePath || '').trim()
      if (!trimmed) {
        return { ok: false, message: 'Empty image path' }
      }

      const asset = history.flatMap((record) => getRecordScreenshots(record)).find((item) => item.relativePath === trimmed)
      if (!asset) {
        return { ok: false, path: `${mockUserDataRoot}/${trimmed}`, message: 'File not found' }
      }

      const dataUrl = mockScreenshotDataByPath.get(trimmed) ?? createMockScreenshotDataUrl(asset, 'Detector Screenshot')
      if (!mockScreenshotDataByPath.has(trimmed)) {
        mockScreenshotDataByPath.set(trimmed, dataUrl)
      }

      return {
        ok: true,
        dataUrl,
        bytes: asset.bytes,
        path: `${mockUserDataRoot}/${trimmed}`
      }
    },
    getStorageUsage: async (): Promise<StorageUsageSummary> => {
      return getMockStorageUsage()
    },
    setStorageLimit: async (maxStorageBytes: number): Promise<StorageLimitUpdateResult> => {
      const clamped = Math.min(5 * 1024 * 1024 * 1024, Math.max(50 * 1024 * 1024, Math.floor(maxStorageBytes)))
      settings = { ...settings, maxStorageBytes: clamped }
      saveSettings(settings)
      return { settings, usage: getMockStorageUsage() }
    },
    enforceStorageLimit: async (): Promise<StorageEnforceResult> => {
      const before = getMockStorageUsage()
      let deletedRecords = 0
      let deletedScreenshotFiles = 0
      let deletedScreenshotDirs = 0

      while (history.length > 0 && getMockStorageUsage().usedBytes > settings.maxStorageBytes) {
        const removed = history.shift()
        if (removed) {
          const screenshots = getRecordScreenshots(removed)
          deletedScreenshotFiles += screenshots.length
          if (screenshots.length > 0) deletedScreenshotDirs += 1
          for (const asset of screenshots) {
            mockScreenshotDataByPath.delete(asset.relativePath)
          }
        }
        deletedRecords += 1
      }

      const after = getMockStorageUsage()
      return {
        deletedRecords,
        deletedScreenshotFiles,
        deletedScreenshotDirs,
        reclaimedBytes: Math.max(0, before.usedBytes - after.usedBytes),
        usedBytes: after.usedBytes,
        maxBytes: after.maxBytes,
        remainingOverageBytes: Math.max(0, after.usedBytes - after.maxBytes),
        isOverLimit: after.isOverLimit
      }
    },
    revealStoragePath: async (categoryOrPath: string): Promise<{ ok: boolean; path: string }> => {
      const path =
        categoryOrPath === 'history'
          ? `${mockUserDataRoot}/history.json`
          : categoryOrPath === 'memory'
            ? `${mockUserDataRoot}/memory.json`
            : categoryOrPath === 'screenshots'
              ? `${mockUserDataRoot}/captures`
              : String(categoryOrPath || '').trim()
      return { ok: true, path }
    },
    copyStoragePath: async (categoryOrPath: string): Promise<{ ok: boolean; path: string }> => {
      const resolved =
        categoryOrPath === 'history'
          ? `${mockUserDataRoot}/history.json`
          : categoryOrPath === 'memory'
            ? `${mockUserDataRoot}/memory.json`
            : categoryOrPath === 'screenshots'
              ? `${mockUserDataRoot}/captures`
              : String(categoryOrPath || '').trim()
      try {
        await navigator.clipboard.writeText(resolved)
      } catch {
        // ignore
      }
      return { ok: true, path: resolved }
    },
    exportTimelineMarkdown: async (payload: {
      fromDate?: string
      toDate?: string
    }): Promise<{ ok: boolean; path?: string; message?: string; historyCount?: number; memoryCount?: number }> => {
      await sleep(150)
      return {
        ok: true,
        path: `${mockUserDataRoot}/exports/detector-timeline-${payload.fromDate || 'all'}-${payload.toDate || 'all'}.md`,
        historyCount: history.length,
        memoryCount: memory.length
      }
    },
    debugReprocessDay: async (payload: { day: string }): Promise<{ ok: boolean; message: string; count?: number }> => {
      await sleep(100)
      return {
        ok: true,
        message: `Debug reprocess simulated for ${payload.day}`,
        count: history.length
      }
    }
  }
}
