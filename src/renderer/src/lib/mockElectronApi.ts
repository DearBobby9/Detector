import type { ElectronAPI } from './types'
import type { AppSettings, ChatMessage, DetectionResult, HistoryRecord } from '@shared/types'

const MOCK_SETTINGS_STORAGE_KEY = 'detector.mockSettings'

const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o',
  apiTimeoutMs: 30000
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

  return records.sort((a, b) => a.timestamp - b.timestamp)
}

export function createMockElectronAPI(): ElectronAPI {
  const loadingListeners = new Set<() => void>()
  const resultListeners = new Set<(result: DetectionResult) => void>()
  const errorListeners = new Set<(message: string) => void>()

  let settings = loadSettings()
  let history = makeMockHistory()
  let nextHistoryId = (history[history.length - 1]?.id ?? 0) + 1

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
    triggerCapture: async () => {
      for (const cb of loadingListeners) cb()
      await sleep(450)

      const result: DetectionResult = {
        type: 'page-summary',
        title: `Mock Capture ${nextHistoryId}`,
        summary: 'Mock capture created from browser preview mode.',
        keyPoints: ['Uses in-browser mock Electron API', 'Helps validate UI quickly']
      }

      history = [
        ...history,
        {
          id: nextHistoryId++,
          timestamp: Date.now(),
          activeApp: 'Browser Preview',
          windowTitle: result.title,
          resultType: result.type,
          resultJson: JSON.stringify(result)
        }
      ]

      for (const cb of resultListeners) cb(result)
      return { ok: true }
    },
    apiTest: async () => {
      const start = performance.now()
      await sleep(220)
      const latencyMs = Math.round(performance.now() - start)
      return { ok: true, message: 'ok', latencyMs }
    },
    getHistory: async () => {
      return history
    },
    chatSend: async (payload: { contextText: string; messages: ChatMessage[] }) => {
      const last = payload.messages[payload.messages.length - 1]?.content ?? ''
      await sleep(280)
      return { ok: true, text: `Mock reply (browser preview): ${last.slice(0, 80)}` }
    }
  }
}

