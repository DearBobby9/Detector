import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type {
  AppSettings,
  ChatMessage,
  HistoryRecord,
  MemoryItem,
  StorageCategoryUsage,
  StorageUsageSummary
} from '@shared/types'
import { cn } from '@/lib/utils'
import {
  Bookmark,
  ChevronDown,
  Cog,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  LayoutGrid,
  Loader2,
  Monitor,
  MoreHorizontal,
  PenSquare,
  Search,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react'

type Route = 'home' | 'chat' | 'memory' | 'settings'

const SIDEBAR_WIDTH_STORAGE_KEY = 'detector.sidebarWidth'
const SIDEBAR_DEFAULT_WIDTH_PX = 260
const SIDEBAR_MIN_WIDTH_PX = 220
const SIDEBAR_MAX_WIDTH_PX = 520
const MAIN_MIN_WIDTH_PX = 420
const SIDEBAR_RESIZER_WIDTH_PX = 14
const MIN_STORAGE_MB = 50
const MAX_STORAGE_MB = 5120

type SettingsSection = 'general' | 'provider' | 'storage'

const FALLBACK_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o',
  apiTimeoutMs: 30000,
  maxStorageBytes: 512 * 1024 * 1024
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

function formatCompactDate(ts: number): string {
  try {
    const date = new Date(ts)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatCompactTime(ts: number): string {
  try {
    const date = new Date(ts)
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayLabel(ts: number): string {
  try {
    const date = new Date(ts)
    const now = new Date()
    if (isSameDay(date, now)) return 'Today'
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (isSameDay(date, yesterday)) return 'Yesterday'
    return formatCompactDate(ts)
  } catch {
    return ''
  }
}

function getRecordText(record: HistoryRecord): string {
  if (typeof record.resultText === 'string' && record.resultText.trim().length > 0) {
    return record.resultText.trim()
  }
  // Backward compatibility: derive from JSON.
  try {
    const parsed = JSON.parse(record.resultJson) as any
    if (parsed?.type === 'email-reply') {
      const subject = typeof parsed.subject === 'string' ? parsed.subject : ''
      const originalSender = typeof parsed.originalSender === 'string' ? parsed.originalSender : ''
      const draft = typeof parsed.draft === 'string' ? parsed.draft : ''
      return [`Email Reply`, subject && `Subject: ${subject}`, originalSender && `To: ${originalSender}`, '', draft]
        .filter(Boolean)
        .join('\n')
        .trim()
    }
    if (parsed?.type === 'page-summary') {
      const title = typeof parsed.title === 'string' ? parsed.title : ''
      const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
      const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints : []
      const keyLines = keyPoints.filter((p: unknown) => typeof p === 'string').map((p: string) => `- ${p}`)
      return [title, '', summary, ...(keyLines.length > 0 ? ['', 'Key points:', ...keyLines] : [])]
        .filter((x) => typeof x === 'string' && x.length > 0)
        .join('\n')
        .trim()
    }

    if (parsed?.type === 'capture-analysis') {
      const screenTitle = typeof parsed.screenTitle === 'string' ? parsed.screenTitle : 'Capture'
      const lines: string[] = [screenTitle]

      const email = parsed.email && typeof parsed.email === 'object' ? parsed.email : null
      const emailDetected = Boolean(email && (email as any).detected)

      if (emailDetected) {
        const subject = typeof (email as any)?.subject === 'string' ? (email as any).subject : ''
        const originalSender =
          typeof (email as any)?.originalSender === 'string' ? (email as any).originalSender : ''
        const draft = typeof (email as any)?.draft === 'string' ? (email as any).draft : ''
        lines.push('', 'Email reply:')
        if (subject) lines.push(`Subject: ${subject}`)
        if (originalSender) lines.push(`To: ${originalSender}`)
        if (draft) lines.push('', draft)
      }

      const memoryCandidates = Array.isArray(parsed.memoryCandidates) ? parsed.memoryCandidates : []
      const memLines = memoryCandidates
        .map((raw: any) => {
          if (!raw || typeof raw !== 'object') return null
          const kind = typeof raw.kind === 'string' ? raw.kind : 'other'
          const title = typeof raw.title === 'string' ? raw.title : ''
          const dueAt = typeof raw.dueAt === 'string' ? raw.dueAt : ''
          if (!title) return null
          return dueAt ? `- [${kind}] ${title} (due: ${dueAt})` : `- [${kind}] ${title}`
        })
        .filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)

      if (memLines.length > 0) {
        lines.push('', 'Memory candidates:', ...memLines)
      }

      return lines.join('\n').trim()
    }
  } catch {
    // ignore
  }

  return record.resultJson
}

function getRecordTitle(record: HistoryRecord): string {
  const text = getRecordText(record)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  if (record.resultType === 'email-reply') {
    const subjectLine = lines.find((l) => l.toLowerCase().startsWith('subject:'))
    return subjectLine ? subjectLine.replace(/^subject:\s*/i, '') : 'Email Reply'
  }

  if (record.resultType === 'page-summary') {
    return lines[0] || 'Page Summary'
  }

  if (record.resultType === 'capture-analysis') {
    // Prefer the screen title, or email subject if present.
    try {
      const parsed = JSON.parse(record.resultJson) as any
      if (parsed?.type === 'capture-analysis') {
        const email = parsed.email && typeof parsed.email === 'object' ? parsed.email : null
        const emailDetected = Boolean(email && (email as any).detected)
        if (emailDetected && typeof (email as any).subject === 'string' && (email as any).subject.trim()) {
          return String((email as any).subject).trim()
        }
        if (typeof parsed.screenTitle === 'string' && parsed.screenTitle.trim()) {
          return String(parsed.screenTitle).trim()
        }
      }
    } catch {
      // ignore
    }
    return lines[0] || 'Capture'
  }

  return lines[0] || record.resultType || 'Capture'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`
}

function bytesToMb(bytes: number): number {
  return Math.max(0, Math.round(bytes / (1024 * 1024)))
}

function mbToBytes(mb: number): number {
  return Math.round(mb * 1024 * 1024)
}

function clampStorageMb(value: number): number {
  if (!Number.isFinite(value)) return MIN_STORAGE_MB
  return clampNumber(Math.round(value), MIN_STORAGE_MB, MAX_STORAGE_MB)
}

export function MainAppShell() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const demoMode = urlParams.get('demo') === '1'

  const [route, setRoute] = useState<Route>('home')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS)
  const [lastSavedSettings, setLastSavedSettings] = useState<AppSettings>(FALLBACK_SETTINGS)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isTestingApi, setIsTestingApi] = useState(false)
  const [storageUsage, setStorageUsage] = useState<StorageUsageSummary | null>(null)
  const [isLoadingStorage, setIsLoadingStorage] = useState(false)
  const [isSavingStorageLimit, setIsSavingStorageLimit] = useState(false)
  const [isEnforcingStorageLimit, setIsEnforcingStorageLimit] = useState(false)
  const [storageLimitMbInput, setStorageLimitMbInput] = useState<number>(() =>
    bytesToMb(FALLBACK_SETTINGS.maxStorageBytes)
  )

  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [isLoadingMemory, setIsLoadingMemory] = useState(true)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatting, setIsChatting] = useState(false)
  const [isContextModalOpen, setIsContextModalOpen] = useState(false)
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState(0)
  const [screenshotDataCache, setScreenshotDataCache] = useState<Record<string, string>>({})
  const [isLoadingScreenshotPreview, setIsLoadingScreenshotPreview] = useState(false)
  const [screenshotPreviewError, setScreenshotPreviewError] = useState<string | null>(null)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const [isSidebarSearchOpen, setIsSidebarSearchOpen] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null)
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)
  const [showSidebarTopFade, setShowSidebarTopFade] = useState(false)
  const [showSidebarBottomFade, setShowSidebarBottomFade] = useState(false)
  const settingsScrollRef = useRef<HTMLDivElement | null>(null)
  const [showSettingsTopFade, setShowSettingsTopFade] = useState(false)
  const [showSettingsBottomFade, setShowSettingsBottomFade] = useState(false)

  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const updateSidebarScrollFades = () => {
    const el = sidebarScrollRef.current
    if (!el) return

    const nextTop = el.scrollTop > 0
    const nextBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1

    setShowSidebarTopFade(nextTop)
    setShowSidebarBottomFade(nextBottom)
  }

  const updateSettingsScrollFades = () => {
    const el = settingsScrollRef.current
    if (!el) return

    const nextTop = el.scrollTop > 0
    const nextBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1

    setShowSettingsTopFade(nextTop)
    setShowSettingsBottomFade(nextBottom)
  }

  const getMaxSidebarWidth = (): number => {
    // Keep a minimum main content width so the UI doesn't collapse.
    return clampNumber(
      window.innerWidth - MAIN_MIN_WIDTH_PX - SIDEBAR_RESIZER_WIDTH_PX,
      SIDEBAR_MIN_WIDTH_PX,
      SIDEBAR_MAX_WIDTH_PX
    )
  }

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const max = getMaxSidebarWidth()
    try {
      const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
      if (Number.isFinite(saved)) return clampNumber(saved, SIDEBAR_MIN_WIDTH_PX, max)
    } catch {
      // ignore
    }
    return clampNumber(SIDEBAR_DEFAULT_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, max)
  })

  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number }>({
    startX: 0,
    startWidth: SIDEBAR_DEFAULT_WIDTH_PX
  })
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
    } catch {
      // ignore
    }
  }, [sidebarWidth])

  useEffect(() => {
    const onResize = () => {
      const max = getMaxSidebarWidth()
      setSidebarWidth((w) => clampNumber(w, SIDEBAR_MIN_WIDTH_PX, max))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const stopResizingSidebar = () => {
    sidebarResizeCleanupRef.current?.()
    sidebarResizeCleanupRef.current = null
    setIsResizingSidebar(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const onSidebarResizeMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()

    // Clear any stuck listeners from a previous interrupted drag.
    sidebarResizeCleanupRef.current?.()
    sidebarResizeCleanupRef.current = null

    sidebarResizeRef.current.startX = e.clientX
    sidebarResizeRef.current.startWidth = sidebarWidth
    setIsResizingSidebar(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - sidebarResizeRef.current.startX
      const max = getMaxSidebarWidth()
      setSidebarWidth(clampNumber(sidebarResizeRef.current.startWidth + dx, SIDEBAR_MIN_WIDTH_PX, max))
    }

    const onStop = () => stopResizingSidebar()

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onStop()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onStop)
    window.addEventListener('blur', onStop)
    window.addEventListener('keydown', onKeyDown)

    sidebarResizeCleanupRef.current = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onStop)
      window.removeEventListener('blur', onStop)
      window.removeEventListener('keydown', onKeyDown)
    }
  }

  const onSidebarResizeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const max = getMaxSidebarWidth()
    const step = e.shiftKey ? 48 : 16

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setSidebarWidth((w) => clampNumber(w - step, SIDEBAR_MIN_WIDTH_PX, max))
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setSidebarWidth((w) => clampNumber(w + step, SIDEBAR_MIN_WIDTH_PX, max))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setSidebarWidth(clampNumber(SIDEBAR_DEFAULT_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, max))
    }
  }

  useEffect(() => {
    return () => {
      sidebarResizeCleanupRef.current?.()
      sidebarResizeCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const loaded = await window.electronAPI.getSettings()
        if (active) {
          setSettings(loaded)
          setLastSavedSettings(loaded)
          setStorageLimitMbInput(bytesToMb(loaded.maxStorageBytes))
        }
      } catch {
        if (active) setStatusMessage('Failed to load settings')
      } finally {
        if (active) setIsLoadingSettings(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const refreshHistory = async (selectLatest = false): Promise<HistoryRecord | null> => {
    setIsLoadingHistory(true)
    try {
      const records = await window.electronAPI.getHistory()
      setHistory(records)

      if (selectLatest && records.length > 0) {
        const latest = records[records.length - 1]
        setActiveRecordId(typeof latest.id === 'number' ? latest.id : null)
        return latest
      }
    } catch {
      setStatusMessage('Failed to load history')
    } finally {
      setIsLoadingHistory(false)
    }
    return null
  }

  const refreshMemory = async (): Promise<void> => {
    setIsLoadingMemory(true)
    try {
      const items = await window.electronAPI.getMemory()
      setMemory(items)
    } catch {
      setStatusMessage('Failed to load memory')
    } finally {
      setIsLoadingMemory(false)
    }
  }

  const refreshStorageUsage = async (showLoading = true, syncLimitInput = true): Promise<void> => {
    if (showLoading) setIsLoadingStorage(true)
    try {
      const usage = await window.electronAPI.getStorageUsage()
      setStorageUsage(usage)
      if (syncLimitInput) {
        setStorageLimitMbInput(bytesToMb(usage.maxBytes))
      }
    } catch {
      setStatusMessage('Failed to load storage usage')
    } finally {
      if (showLoading) setIsLoadingStorage(false)
    }
  }

  const saveStorageLimit = async (): Promise<void> => {
    const nextMb = clampStorageMb(storageLimitMbInput)
    setStorageLimitMbInput(nextMb)
    setIsSavingStorageLimit(true)
    setStatusMessage(null)
    try {
      const result = await window.electronAPI.setStorageLimit(mbToBytes(nextMb))
      setSettings(result.settings)
      setLastSavedSettings(result.settings)
      setStorageUsage(result.usage)
      setStorageLimitMbInput(bytesToMb(result.settings.maxStorageBytes))
      setStatusMessage(`Storage limit saved (${nextMb} MB)`)
    } catch {
      setStatusMessage('Failed to save storage limit')
    } finally {
      setIsSavingStorageLimit(false)
    }
  }

  const runStorageCleanup = async (): Promise<void> => {
    setIsEnforcingStorageLimit(true)
    setStatusMessage(null)
    try {
      const result = await window.electronAPI.enforceStorageLimit()
      await refreshStorageUsage(false, true)
      if (result.reclaimedBytes > 0 || result.deletedRecords > 0) {
        setStatusMessage(
          `Cleanup reclaimed ${formatBytes(result.reclaimedBytes)} (${result.deletedRecords} capture${result.deletedRecords === 1 ? '' : 's'} removed)`
        )
      } else if (result.isOverLimit) {
        setStatusMessage(
          `Still over limit by ${formatBytes(result.remainingOverageBytes)}. Increase limit or manually clean screenshots.`
        )
      } else {
        setStatusMessage('Storage is already within limit')
      }
    } catch {
      setStatusMessage('Failed to run storage cleanup')
    } finally {
      setIsEnforcingStorageLimit(false)
    }
  }

  const revealStoragePath = async (categoryOrPath: string): Promise<void> => {
    try {
      const result = await window.electronAPI.revealStoragePath(categoryOrPath)
      setStatusMessage(result.ok ? `Opened: ${result.path}` : 'Failed to reveal path')
    } catch {
      setStatusMessage('Failed to reveal path')
    }
  }

  const copyStoragePath = async (categoryOrPath: string): Promise<void> => {
    try {
      const result = await window.electronAPI.copyStoragePath(categoryOrPath)
      setStatusMessage(result.ok ? `Path copied: ${result.path}` : 'Failed to copy path')
    } catch {
      setStatusMessage('Failed to copy path')
    }
  }

  useEffect(() => {
    void refreshMemory()
  }, [])

  useEffect(() => {
    if (route !== 'settings' || settingsSection !== 'storage') return
    void refreshStorageUsage()

    const timer = window.setInterval(() => {
      void refreshStorageUsage(false, false)
    }, 8000)

    return () => {
      window.clearInterval(timer)
    }
  }, [route, settingsSection])

  useEffect(() => {
    void (async () => {
      const latest = await refreshHistory(demoMode)
      if (demoMode && latest) {
        setChatMessages([])
        setChatInput('')
        setRoute('chat')
      }
    })()

    const cleanups: Array<() => void> = []

    cleanups.push(
      window.electronAPI.onShowLoading(() => {
        setIsCapturing(true)
      })
    )
    cleanups.push(
      window.electronAPI.onShowResult(() => {
        setIsCapturing(false)
        void (async () => {
          const latest = await refreshHistory(true)
          if (latest) {
            setChatMessages([])
            setChatInput('')
            setRoute('chat')
          }
        })()
      })
    )
    cleanups.push(
      window.electronAPI.onShowError((message) => {
        setIsCapturing(false)
        setStatusMessage(message)
      })
    )

    return () => cleanups.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [chatMessages, isChatting])

  useEffect(() => {
    if (!isSidebarSearchOpen) return
    sidebarSearchRef.current?.focus()
  }, [isSidebarSearchOpen])

  useEffect(() => {
    const el = sidebarScrollRef.current
    if (!el) return

    updateSidebarScrollFades()

    const onScroll = () => updateSidebarScrollFades()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [route])

  useEffect(() => {
    updateSidebarScrollFades()
  }, [isLoadingHistory, history.length, sidebarQuery, sidebarWidth])

  useEffect(() => {
    if (route !== 'settings') return
    const el = settingsScrollRef.current
    if (!el) return

    updateSettingsScrollFades()

    const onScroll = () => updateSettingsScrollFades()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [route, settingsSection])

  useEffect(() => {
    if (route !== 'settings') return
    updateSettingsScrollFades()
  }, [route, settingsSection, isLoadingSettings, isLoadingStorage, storageUsage])

  const canSave = useMemo(() => {
    return settings.apiBaseUrl.trim().length > 0 && settings.apiModel.trim().length > 0
  }, [settings.apiBaseUrl, settings.apiModel])

  const isDirty = useMemo(() => {
    return (
      settings.apiBaseUrl !== lastSavedSettings.apiBaseUrl ||
      settings.apiKey !== lastSavedSettings.apiKey ||
      settings.apiModel !== lastSavedSettings.apiModel ||
      settings.apiTimeoutMs !== lastSavedSettings.apiTimeoutMs ||
      settings.maxStorageBytes !== lastSavedSettings.maxStorageBytes
    )
  }, [
    lastSavedSettings.apiBaseUrl,
    lastSavedSettings.apiKey,
    lastSavedSettings.apiModel,
    lastSavedSettings.apiTimeoutMs,
    lastSavedSettings.maxStorageBytes,
    settings.apiBaseUrl,
    settings.apiKey,
    settings.apiModel,
    settings.apiTimeoutMs,
    settings.maxStorageBytes
  ])

  const activeRecord: HistoryRecord | null = useMemo(() => {
    if (history.length === 0) return null
    if (activeRecordId == null) return null
    return history.find((r) => r.id === activeRecordId) || null
  }, [history, activeRecordId])

  const activePayload: any | null = useMemo(() => {
    if (!activeRecord) return null
    try {
      return JSON.parse(activeRecord.resultJson) as any
    } catch {
      return null
    }
  }, [activeRecord])

  const activeMetadata = useMemo(() => {
    if (!activeRecord) return null

    const metaRaw =
      activePayload && typeof activePayload === 'object' && !Array.isArray(activePayload)
        ? (activePayload as any).metadata
        : null

    const meta =
      metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw) ? (metaRaw as any) : null

    const activeApp = typeof meta?.activeApp === 'string' ? meta.activeApp : activeRecord.activeApp
    const windowTitle = typeof meta?.windowTitle === 'string' ? meta.windowTitle : activeRecord.windowTitle
    const activeUrl = typeof meta?.activeUrl === 'string' ? meta.activeUrl : undefined
    const capturedAt = typeof meta?.capturedAt === 'number' ? meta.capturedAt : activeRecord.timestamp

    const tabsRaw = Array.isArray(meta?.tabs) ? meta.tabs : []
    const tabs = tabsRaw
      .map((t: any) => {
        const title = typeof t?.title === 'string' ? t.title.trim() : ''
        const url = typeof t?.url === 'string' ? t.url.trim() : ''
        return { title, url }
      })
      .filter((t: { title: string; url: string }) => t.title.length > 0 || t.url.length > 0)

    return { activeApp, windowTitle, activeUrl, tabs, capturedAt }
  }, [activeRecord, activePayload])

  const activeScreenshots = useMemo(() => {
    if (!activeRecord || !Array.isArray(activeRecord.screenshots)) return []
    return activeRecord.screenshots
  }, [activeRecord])

  const selectedScreenshot = useMemo(() => {
    if (activeScreenshots.length === 0) return null
    const index = clampNumber(selectedScreenshotIndex, 0, activeScreenshots.length - 1)
    return activeScreenshots[index] || null
  }, [activeScreenshots, selectedScreenshotIndex])

  const selectedScreenshotPath = selectedScreenshot?.relativePath ?? ''
  const selectedScreenshotDataUrl =
    selectedScreenshotPath.length > 0 ? screenshotDataCache[selectedScreenshotPath] : undefined

  const contextModalEnabled = Boolean(activeRecord)

  useEffect(() => {
    if (!isContextModalOpen) return
    setSelectedScreenshotIndex(0)
    setScreenshotPreviewError(null)
  }, [isContextModalOpen, activeRecord?.id])

  useEffect(() => {
    if (activeScreenshots.length === 0) {
      setSelectedScreenshotIndex(0)
      return
    }
    setSelectedScreenshotIndex((prev) => clampNumber(prev, 0, activeScreenshots.length - 1))
  }, [activeScreenshots.length])

  useEffect(() => {
    if (!isContextModalOpen) return
    if (!selectedScreenshotPath) {
      setIsLoadingScreenshotPreview(false)
      setScreenshotPreviewError(null)
      return
    }
    if (typeof selectedScreenshotDataUrl === 'string' && selectedScreenshotDataUrl.length > 0) {
      setIsLoadingScreenshotPreview(false)
      setScreenshotPreviewError(null)
      return
    }

    let cancelled = false
    setIsLoadingScreenshotPreview(true)
    setScreenshotPreviewError(null)

    void window.electronAPI
      .readCaptureImageData(selectedScreenshotPath)
      .then((result) => {
        if (cancelled) return
        if (result.ok && typeof result.dataUrl === 'string' && result.dataUrl.length > 0) {
          setScreenshotDataCache((prev) => ({ ...prev, [selectedScreenshotPath]: result.dataUrl as string }))
          setScreenshotPreviewError(null)
          return
        }
        setScreenshotPreviewError(result.message || 'Failed to load screenshot preview')
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setScreenshotPreviewError(message || 'Failed to load screenshot preview')
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingScreenshotPreview(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isContextModalOpen, selectedScreenshotPath, selectedScreenshotDataUrl])

  const activeMetadataText = useMemo(() => {
    if (!activeMetadata) return ''
    const lines: string[] = []
    lines.push(`Captured: ${formatTime(activeMetadata.capturedAt)}`)
    lines.push(`Active app: ${activeMetadata.activeApp}`)
    lines.push(`Window: ${activeMetadata.windowTitle}`)
    if (activeMetadata.activeUrl) lines.push(`Active URL: ${activeMetadata.activeUrl}`)

    if (activeMetadata.tabs.length > 0) {
      lines.push('', `Tabs (${activeMetadata.tabs.length}):`)
      for (const t of activeMetadata.tabs) {
        const left = t.title ? t.title : '(untitled)'
        const right = t.url ? ` — ${t.url}` : ''
        lines.push(`- ${left}${right}`)
      }
    }

    return lines.join('\n').trim()
  }, [activeMetadata])

  const activeUrlHost = useMemo(() => {
    const url = activeMetadata?.activeUrl
    if (!url) return ''
    try {
      return new URL(url).host
    } catch {
      return ''
    }
  }, [activeMetadata])

  const activeMemoryCandidates = useMemo(() => {
    if (!activePayload || typeof activePayload !== 'object' || Array.isArray(activePayload)) return []
    if (activePayload.type !== 'capture-analysis') return []
    const raw = Array.isArray((activePayload as any).memoryCandidates) ? (activePayload as any).memoryCandidates : []
    return raw
      .map((c: any) => {
        const kind = typeof c?.kind === 'string' ? c.kind : 'other'
        const title = typeof c?.title === 'string' ? c.title.trim() : ''
        const dueAt = typeof c?.dueAt === 'string' ? c.dueAt : null
        const confidence = typeof c?.confidence === 'number' ? c.confidence : null
        if (!title) return null
        return { kind, title, dueAt, confidence }
      })
      .filter(Boolean)
  }, [activePayload])

  const contextText = useMemo(() => {
    // Prefer raw metadata (app/window/url/tabs) as the primary context so the chat aligns
    // with the "no summary, keep original context" direction.
    const parts: string[] = []
    if (activeMetadataText.trim().length > 0) parts.push(activeMetadataText.trim())
    if (activeRecord) {
      const derived = getRecordText(activeRecord).trim()
      if (derived.length > 0) parts.push(derived)
    }
    return parts.join('\n\n').trim()
  }, [activeMetadataText, activeRecord])

  const filteredHistory = useMemo(() => {
    const query = sidebarQuery.trim().toLowerCase()
    if (!query) return history
    return history.filter((r) => getRecordTitle(r).toLowerCase().includes(query))
  }, [history, sidebarQuery])

  const displayHistory = useMemo(() => {
    return [...filteredHistory].slice().reverse()
  }, [filteredHistory])

  const groupedHistory = useMemo(() => {
    const groups: Array<{ key: string; label: string; records: HistoryRecord[] }> = []
    for (const record of displayHistory) {
      const label = dayLabel(record.timestamp) || 'Earlier'
      const key = label
      const last = groups[groups.length - 1]
      if (last && last.key === key) {
        last.records.push(record)
      } else {
        groups.push({ key, label, records: [record] })
      }
    }
    return groups
  }, [displayHistory])

  const storagePercent = storageUsage ? Math.max(0, storageUsage.percent) : 0
  const storageProgressPercent = Math.min(100, storagePercent)
  const storageTone =
    storagePercent > 100 ? 'danger' : storagePercent >= 80 ? 'warning' : 'normal'
  const storageProgressClass =
    storageTone === 'danger'
      ? 'bg-rose-500'
      : storageTone === 'warning'
        ? 'bg-amber-500'
        : 'bg-[#6e8f95]'

  const storageCategories: StorageCategoryUsage[] = storageUsage?.categories ?? []

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = async () => {
    if (!canSave) return

    setIsSavingSettings(true)
    setStatusMessage(null)

    try {
      const saved = await window.electronAPI.saveSettings(settings)
      setSettings(saved)
      setLastSavedSettings(saved)
      setStatusMessage('All changes saved')
    } catch {
      setStatusMessage('Failed to save settings')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const testApi = async () => {
    setIsTestingApi(true)
    setStatusMessage(null)
    try {
      const res = await window.electronAPI.apiTest(settings)
      setStatusMessage(res.ok ? `API test ok (${res.latencyMs}ms)` : `API test failed: ${res.message} (${res.latencyMs}ms)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(`API test failed: ${message}`)
    } finally {
      setIsTestingApi(false)
    }
  }

  const triggerCapture = async () => {
    setIsCapturing(true)
    setStatusMessage(null)
    try {
      await window.electronAPI.triggerCapture()
    } catch {
      setIsCapturing(false)
      setStatusMessage('Failed to trigger capture')
    }
  }

  const startNewChat = () => {
    setActiveRecordId(null)
    setChatMessages([])
    setChatInput('')
    setIsSidebarSearchOpen(false)
    setSidebarQuery('')
    setStatusMessage(null)
    setRoute('chat')
  }

  const openSettings = (section: SettingsSection = 'general') => {
    setIsSidebarSearchOpen(false)
    setSidebarQuery('')
    setStatusMessage(null)
    setSettingsSection(section)
    setRoute('settings')
  }

  const openMemory = () => {
    setIsSidebarSearchOpen(false)
    setSidebarQuery('')
    setStatusMessage(null)
    setRoute('memory')
    void refreshMemory()
  }

  const selectRecord = (record: HistoryRecord) => {
    setIsSidebarSearchOpen(false)
    setSidebarQuery('')
    setRoute('chat')
    setActiveRecordId(typeof record.id === 'number' ? record.id : null)
    setChatMessages([])
    setChatInput('')
    setStatusMessage(null)
  }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text) return

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: text }]
    setChatMessages(nextMessages)
    setChatInput('')
    setIsChatting(true)
    setStatusMessage(null)

    try {
      const res = await window.electronAPI.chatSend({ contextText, messages: nextMessages })
      setChatMessages([...nextMessages, { role: 'assistant', content: res.text }])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatusMessage(`Chat failed: ${message}`)
    } finally {
      setIsChatting(false)
    }
  }

  const showHome = () => {
    setIsSidebarSearchOpen(false)
    setSidebarQuery('')
    setRoute('home')
  }

  return (
    <div
      className="h-full w-full min-h-0 grid text-slate-800 overflow-hidden bg-[radial-gradient(900px_600px_at_65%_35%,#ffffff_0%,#f2f5f8_55%,#eef2f6_100%)]"
      style={{ gridTemplateColumns: `${sidebarWidth}px ${SIDEBAR_RESIZER_WIDTH_PX}px 1fr`, gridTemplateRows: '1fr' }}
    >
      <aside className="bg-[#f7f9fc] flex flex-col relative min-w-0 min-h-0 overflow-hidden">
        <div className="h-12 flex items-center gap-2 px-3 pl-16 app-drag">
          <button
            className="app-nodrag h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-200/50 flex items-center justify-center transition"
            onClick={showHome}
            aria-label="Home"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            className="app-nodrag h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-200/50 flex items-center justify-center transition"
            onClick={() => {
              if (route === 'settings') {
                setStatusMessage('Search in settings is not available yet')
                return
              }
              setIsSidebarSearchOpen((v) => !v)
            }}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            className="app-nodrag h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-200/50 flex items-center justify-center transition"
            onClick={startNewChat}
            aria-label="New chat"
          >
            <PenSquare className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <button
            className="app-nodrag h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-200/50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center transition"
            onClick={() => void triggerCapture()}
            disabled={isCapturing}
            aria-label="Capture"
            title="Capture (Cmd+Shift+.)"
          >
            {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </button>
        </div>

        {route !== 'settings' && isSidebarSearchOpen && (
          <div className="px-3 pb-2">
            <div className="rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-2 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={sidebarSearchRef}
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                placeholder="Search"
                className="app-nodrag flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              <button
                className="app-nodrag text-slate-400 hover:text-slate-600 transition"
                onClick={() => {
                  setSidebarQuery('')
                  setIsSidebarSearchOpen(false)
                }}
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3 app-nodrag flex flex-col">
          {route === 'settings' ? (
            <div className="pt-2">
              <div className="px-2 pb-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                Settings
              </div>
              <div className="space-y-1">
                <button
                  className={cn(
                    'app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-2xl border transition text-sm',
                    settingsSection === 'general'
                      ? 'bg-white/80 border-slate-200/70 shadow-sm text-slate-800'
                      : 'bg-white/0 border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200/60'
                  )}
                  onClick={() => setSettingsSection('general')}
                >
                  <Cog className="h-4 w-4 text-slate-500" />
                  <span className="flex-1 text-left">General</span>
                </button>
                <button
                  className={cn(
                    'app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-2xl border transition text-sm',
                    settingsSection === 'provider'
                      ? 'bg-white/80 border-slate-200/70 shadow-sm text-slate-800'
                      : 'bg-white/0 border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200/60'
                  )}
                  onClick={() => setSettingsSection('provider')}
                >
                  <SettingsIcon className="h-4 w-4 text-slate-500" />
                  <span className="flex-1 text-left">Providers</span>
                </button>
                <button
                  className={cn(
                    'app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-2xl border transition text-sm',
                    settingsSection === 'storage'
                      ? 'bg-white/80 border-slate-200/70 shadow-sm text-slate-800'
                      : 'bg-white/0 border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200/60'
                  )}
                  onClick={() => setSettingsSection('storage')}
                >
                  <HardDrive className="h-4 w-4 text-slate-500" />
                  <span className="flex-1 text-left">Storage</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 rounded-2xl bg-white/70 backdrop-blur border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-slate-200/60 bg-white/60 flex items-center justify-between">
                <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Captures</div>
                <div className="text-[11px] text-slate-400">{filteredHistory.length}</div>
              </div>
              <div className="relative flex-1 min-h-0">
                <div ref={sidebarScrollRef} className="sidebar-scroll h-full overflow-y-auto p-2">
                  {isLoadingHistory ? (
                    <div className="px-2 py-2 text-sm text-slate-500 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : groupedHistory.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-slate-500">No captures yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {groupedHistory.map((group) => (
                        <div key={group.key}>
                          <div className="sticky top-0 z-10 -mx-2 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase bg-white/70 backdrop-blur">
                            {group.label}
                          </div>
                          <div className="space-y-1">
                            {group.records.map((record) => {
                              const isActive =
                                activeRecord?.id != null && record.id === activeRecord.id && route === 'chat'

                              return (
                                <button
                                  key={record.id ?? `${record.timestamp}`}
                                  onClick={() => selectRecord(record)}
                                  className={cn(
                                    'app-nodrag w-full text-left rounded-lg px-2 py-1.5 transition relative',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25',
                                    isActive ? 'bg-white/90' : 'bg-transparent hover:bg-white/70'
                                  )}
                                >
                                  <div className="flex items-baseline justify-between gap-3">
                                    <div className="min-w-0 flex-1 text-[13px] font-medium text-slate-700 truncate">
                                      {getRecordTitle(record)}
                                    </div>
                                    <div className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap tabular-nums">
                                      {formatCompactTime(record.timestamp)}
                                    </div>
                                  </div>
                                  {isActive && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-[#6e8f95]" />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'pointer-events-none absolute left-0 right-0 top-0 h-7 bg-gradient-to-b from-white/90 to-transparent',
                    'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                    showSidebarTopFade ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div
                  className={cn(
                    'pointer-events-none absolute left-0 right-0 bottom-0 h-7 bg-gradient-to-t from-white/90 to-transparent',
                    'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                    showSidebarBottomFade ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </div>
            </div>
          )}
        </div>

        {route !== 'settings' && (
          <div className="px-3 pb-3 shrink-0 app-nodrag">
            <div className="relative w-full group">
              <div
                className={cn(
                  'absolute left-0 right-0 bottom-9 z-50 pb-2 origin-bottom-left will-change-transform',
                  'transition duration-200 ease-out motion-reduce:transition-none',
                  'opacity-0 scale-[0.98] translate-y-2 pointer-events-none',
                  'group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 group-hover:pointer-events-auto'
                )}
              >
                <div className="w-[220px] rounded-2xl bg-white/85 border border-slate-200/70 shadow-[0_24px_48px_-24px_rgba(15,23,42,0.35)] backdrop-blur p-2">
                  <div className="space-y-1">
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25"
                      onClick={() => setStatusMessage('Manage Prompt Apps not implemented yet')}
                    >
                      <SlidersHorizontal className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">
                        Manage Prompt Apps
                      </span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25"
                      onClick={openMemory}
                    >
                      <Bookmark className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Memory</span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25"
                      onClick={() => setStatusMessage('Live Coding not implemented yet')}
                    >
                      <Code2 className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Live Coding</span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25"
                      onClick={() => openSettings('general')}
                    >
                      <SettingsIcon className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Settings</span>
                    </button>
                  </div>

                  <div className="my-2 h-px bg-slate-200/70" />

                  <div className="space-y-1">
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25"
                      onClick={() =>
                        setSidebarWidth(clampNumber(SIDEBAR_DEFAULT_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, getMaxSidebarWidth()))
                      }
                    >
                      <LayoutGrid className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Reset width</span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/25"
                      onClick={() => setStatusMessage('Detector v1.0.0')}
                    >
                      <Sparkles className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">About</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                className="app-nodrag h-9 w-9 rounded-xl bg-white/80 border border-slate-200/70 shadow-sm text-slate-600 hover:bg-white transition flex items-center justify-center"
                aria-label="More actions"
                title="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      <div
        className={cn(
          'app-nodrag relative cursor-col-resize group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e8f95]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2f5f8]',
          isResizingSidebar ? 'bg-slate-200/20' : 'hover:bg-slate-200/10'
        )}
        style={{ WebkitAppRegion: 'no-drag' }}
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
        aria-valuemax={getMaxSidebarWidth()}
        aria-valuenow={Math.round(sidebarWidth)}
        tabIndex={0}
        onDoubleClick={() =>
          setSidebarWidth(clampNumber(SIDEBAR_DEFAULT_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, getMaxSidebarWidth()))
        }
        onMouseDown={onSidebarResizeMouseDown}
        onKeyDown={onSidebarResizeKeyDown}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full transition-colors',
            isResizingSidebar ? 'bg-slate-900/25' : 'bg-slate-900/10 group-hover:bg-slate-900/15'
          )}
        />
        <div
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full transition-opacity',
            isResizingSidebar
              ? 'opacity-100 bg-slate-900/20'
              : 'opacity-0 bg-slate-900/15 group-hover:opacity-100'
          )}
        />
      </div>

      <section className="min-h-0 min-w-0 flex flex-col">
        {route === 'home' && (
          <div className="flex-1 min-h-0 flex items-center justify-center px-12 py-14">
            <div className="w-full max-w-[480px] flex flex-col items-center text-center gap-5">
              <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-slate-700" />
              </div>

              <div className="text-[46px] leading-none font-semibold tracking-tight text-slate-800 font-serif">
                Detector
              </div>
              <div className="text-[15px] text-slate-500">
                An elegant desktop for screen understanding and follow-up chat
              </div>

              <button
                className="app-nodrag mt-2 w-[360px] max-w-full h-12 rounded-xl bg-[#6e8f95] hover:bg-[#628389] text-white text-sm font-medium shadow-sm transition flex items-center justify-center"
                onClick={startNewChat}
              >
                New Chat
              </button>

              <div className="flex items-center gap-3 w-full max-w-[360px]">
                <button
                  className="app-nodrag flex-1 h-11 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:bg-slate-50 text-sm font-medium transition"
                  onClick={() => openSettings('provider')}
                >
                  Configure Provider
                </button>
                <button
                  className="app-nodrag flex-1 h-11 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:bg-slate-50 text-sm font-medium transition"
                  onClick={() => openSettings('general')}
                >
                  Settings
                </button>
              </div>

              <div className="text-[13px] text-slate-400 mt-1">
                {settings.apiKey.trim().length === 0
                  ? 'Please configure an API key to start chatting'
                  : 'Press Cmd+Shift+. to capture your screen at any time'}
              </div>
            </div>
          </div>
        )}

        {route === 'settings' && (
          <div className="flex-1 min-h-0 flex flex-col px-10 py-12">
            <div className="mx-auto w-full max-w-4xl min-h-0 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Settings</div>
                  <div className="text-2xl font-semibold tracking-tight text-slate-800 mt-1">
                    {settingsSection === 'general' ? 'General' : settingsSection === 'provider' ? 'Providers' : 'Storage'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {settingsSection === 'general'
                      ? 'Model and request behavior used by Detector.'
                      : settingsSection === 'provider'
                        ? 'OpenAI-compatible endpoint and API credentials.'
                        : 'Manage local Detector data usage.'}
                  </div>
                </div>
                <button
                  className="app-nodrag h-9 w-9 rounded-xl hover:bg-slate-200/40 text-slate-500 flex items-center justify-center transition"
                  onClick={showHome}
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 flex-1 min-h-0 pr-2">
                <div className="relative h-full min-h-0">
                  <div ref={settingsScrollRef} className="h-full overflow-y-auto pr-1 space-y-6">
                    {isLoadingSettings ? (
                      <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6 text-sm text-slate-500 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading settings...
                      </div>
                    ) : (
                      <>
                    {settingsSection === 'general' && (
                      <>
                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-slate-800">Tool Model</div>
                              <div className="text-sm text-slate-500 mt-1">
                                Model used for chat and screen understanding.
                              </div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <input
                              value={settings.apiModel}
                              onChange={(e) => updateSetting('apiModel', e.target.value)}
                              className="app-nodrag w-full rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                              placeholder="gpt-4o"
                            />
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="text-lg font-semibold text-slate-800">Request Timeout</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Maximum time to wait for API responses.
                          </div>
                          <div className="mt-4 max-w-sm">
                            <input
                              type="number"
                              min={1000}
                              step={1000}
                              value={settings.apiTimeoutMs}
                              onChange={(e) => updateSetting('apiTimeoutMs', Number(e.target.value))}
                              className="app-nodrag w-full rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {settingsSection === 'provider' && (
                      <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                        <div>
                          <div className="text-lg font-semibold text-slate-800">Provider</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Configure your OpenAI-compatible endpoint and API key.
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500">API Base URL</span>
                            <input
                              value={settings.apiBaseUrl}
                              onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                              className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                              placeholder="https://api.openai.com/v1"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500">API Key</span>
                            <input
                              type="password"
                              value={settings.apiKey}
                              onChange={(e) => updateSetting('apiKey', e.target.value)}
                              className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                              placeholder="sk-..."
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {settingsSection === 'storage' && (
                      <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6 space-y-6">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                              <Database className="h-5 w-5 text-slate-500" />
                              Storage
                            </div>
                            <div className="text-sm text-slate-500 mt-1">
                              Track local database size and set an auto-cleanup limit for capture data.
                            </div>
                          </div>
                          <button
                            onClick={() => void refreshStorageUsage()}
                            disabled={isLoadingStorage}
                            className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          >
                            {isLoadingStorage ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Refreshing
                              </>
                            ) : (
                              <>
                                <HardDrive className="h-3.5 w-3.5" />
                                Refresh
                              </>
                            )}
                          </button>
                        </div>

                        {isLoadingStorage && !storageUsage ? (
                          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-5 text-sm text-slate-500 flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading storage usage...
                          </div>
                        ) : (
                          <>
                            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm text-slate-600">
                                  <span className="font-semibold text-slate-800">
                                    {formatBytes(storageUsage?.usedBytes ?? 0)}
                                  </span>{' '}
                                  / {formatBytes(storageUsage?.maxBytes ?? settings.maxStorageBytes)}
                                </div>
                                <div
                                  className={cn(
                                    'text-xs font-semibold tabular-nums',
                                    storageTone === 'danger'
                                      ? 'text-rose-600'
                                      : storageTone === 'warning'
                                        ? 'text-amber-600'
                                        : 'text-slate-500'
                                  )}
                                >
                                  {storagePercent.toFixed(1)}%
                                </div>
                              </div>
                              <div className="h-2.5 w-full rounded-full bg-slate-200/80 overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-[width] duration-200', storageProgressClass)}
                                  style={{ width: `${storageProgressPercent}%` }}
                                />
                              </div>
                              <div className="text-xs text-slate-500">
                                Auto-prunable: {formatBytes(storageUsage?.prunableBytes ?? 0)}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4">
                              <div className="text-sm font-semibold text-slate-800">Max storage limit</div>
                              <div className="text-xs text-slate-500 mt-1">
                                Limit applies to all local data. Detector auto-cleans oldest captures when above this
                                limit.
                              </div>
                              <div className="mt-4 space-y-3">
                                <input
                                  type="range"
                                  min={MIN_STORAGE_MB}
                                  max={MAX_STORAGE_MB}
                                  step={50}
                                  value={clampStorageMb(storageLimitMbInput)}
                                  onChange={(e) => setStorageLimitMbInput(clampStorageMb(Number(e.target.value)))}
                                  className="app-nodrag w-full accent-[#6e8f95]"
                                />
                                <div className="flex items-center gap-3">
                                  <div className="relative w-40">
                                    <input
                                      type="number"
                                      min={MIN_STORAGE_MB}
                                      max={MAX_STORAGE_MB}
                                      step={50}
                                      value={storageLimitMbInput}
                                      onChange={(e) =>
                                        setStorageLimitMbInput(clampStorageMb(Number(e.target.value || MIN_STORAGE_MB)))
                                      }
                                      className="app-nodrag w-full rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 pr-11 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                      MB
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => void saveStorageLimit()}
                                    disabled={isSavingStorageLimit || isLoadingStorage}
                                    className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[#6e8f95] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#628389] disabled:opacity-60 disabled:cursor-not-allowed transition"
                                  >
                                    {isSavingStorageLimit ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving...
                                      </>
                                    ) : (
                                      'Save limit'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {storageUsage && storageUsage.isOverLimit && (
                              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 flex items-center justify-between gap-3">
                                <div className="text-sm text-rose-700">
                                  Storage is above limit by{' '}
                                  <span className="font-semibold">
                                    {formatBytes(storageUsage.usedBytes - storageUsage.maxBytes)}
                                  </span>
                                  . Run cleanup to remove oldest captures.
                                </div>
                                <button
                                  onClick={() => void runStorageCleanup()}
                                  disabled={isEnforcingStorageLimit}
                                  className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                                >
                                  {isEnforcingStorageLimit ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Cleaning...
                                    </>
                                  ) : (
                                    'Run cleanup now'
                                  )}
                                </button>
                              </div>
                            )}

                            <div className="rounded-2xl border border-slate-200/70 bg-white/80 overflow-hidden">
                              <div className="px-4 py-3 border-b border-slate-200/60 bg-slate-50/70 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                                Storage breakdown
                              </div>
                              <div className="divide-y divide-slate-200/60">
                                {storageCategories.map((category) => (
                                  <div key={category.key} className="px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-800">{category.label}</div>
                                        <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                                          <span>{formatBytes(category.bytes)}</span>
                                          {typeof category.itemCount === 'number' && (
                                            <span className="tabular-nums">{category.itemCount} items</span>
                                          )}
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400 break-all">{category.path}</div>
                                      </div>
                                      <div className="shrink-0 flex items-center gap-2">
                                        <button
                                          onClick={() => void revealStoragePath(category.key)}
                                          className="app-nodrag inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          Reveal
                                        </button>
                                        <button
                                          onClick={() => void copyStoragePath(category.key)}
                                          className="app-nodrag inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                          Copy path
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                      </>
                    )}
                  </div>
                  <div
                    className={cn(
                      'pointer-events-none absolute left-0 right-1 top-0 h-8 bg-gradient-to-b from-[#eef2f6]/95 to-transparent',
                      'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                      showSettingsTopFade ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div
                    className={cn(
                      'pointer-events-none absolute left-0 right-1 bottom-0 h-8 bg-gradient-to-t from-[#eef2f6]/95 to-transparent',
                      'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                      showSettingsBottomFade ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-white/80 border border-slate-200/70 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-500 truncate">
                  {statusMessage
                    ? statusMessage
                    : settingsSection === 'storage'
                      ? 'Storage usage refreshes automatically while this tab is open'
                      : isSavingSettings
                        ? 'Saving...'
                        : isDirty
                          ? 'Unsaved changes'
                          : 'All changes saved'}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={showHome}
                    className="app-nodrag inline-flex items-center justify-center rounded-xl bg-white border border-slate-200/80 shadow-sm px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  {settingsSection !== 'storage' && (
                    <>
                      <button
                        onClick={testApi}
                        disabled={isTestingApi || isLoadingSettings}
                        className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                      >
                        {isTestingApi ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Test API
                          </>
                        )}
                      </button>
                      <button
                        onClick={saveSettings}
                        disabled={!canSave || isSavingSettings || !isDirty || isLoadingSettings}
                        className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[#6e8f95] px-4 py-2 text-sm font-medium text-white hover:bg-[#628389] disabled:opacity-60 disabled:cursor-not-allowed transition"
                      >
                        {isSavingSettings ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <SettingsIcon className="h-4 w-4" />
                            Save
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {route === 'memory' && (
          <div className="flex-1 min-h-0 flex flex-col px-10 py-12">
            <div className="mx-auto w-full max-w-4xl min-h-0 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Memory</div>
                  <div className="text-2xl font-semibold tracking-tight text-slate-800 mt-1">Saved items</div>
                  <div className="text-sm text-slate-500 mt-1">
                    Things you chose to remember from your screen captures.
                  </div>
                </div>
                <button
                  className="app-nodrag h-9 w-9 rounded-xl hover:bg-slate-200/40 text-slate-500 flex items-center justify-center transition"
                  onClick={showHome}
                  aria-label="Close memory"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 flex-1 min-h-0 overflow-y-auto pr-2 space-y-3">
                {isLoadingMemory ? (
                  <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading memory...
                  </div>
                ) : memory.length === 0 ? (
                  <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6 text-sm text-slate-500">
                    No saved memory yet. Use the capture panel to save important items.
                  </div>
                ) : (
                  [...memory]
                    .slice()
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                    .map((item) => (
                      <div
                        key={item.id ?? `${item.createdAt}-${item.title}`}
                        className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{item.title}</div>
                            <div className="mt-1 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200/70 px-2 py-0.5">
                                {item.kind}
                              </span>
                              {typeof item.dueAt === 'string' && item.dueAt.trim().length > 0 && (
                                <span className="tabular-nums">Due: {item.dueAt}</span>
                              )}
                              <span className="tabular-nums">{formatTime(item.createdAt)}</span>
                            </div>
                            {typeof item.details === 'string' && item.details.trim().length > 0 && (
                              <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{item.details}</div>
                            )}
                            {typeof item.source === 'string' && item.source.trim().length > 0 && (
                              <div className="mt-3 text-xs text-slate-500 whitespace-pre-wrap">{item.source}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {route === 'chat' && (
          <div className="flex-1 min-h-0 flex flex-col px-10 py-14">
            <div className="mx-auto w-full max-w-3xl min-h-0 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Chat</div>
                  <div className="text-lg font-semibold text-slate-800 mt-1">
                    {activeRecord ? getRecordTitle(activeRecord) : 'New Chat'}
                  </div>
                  {activeRecord ? (
                    <div className="text-xs text-slate-400 mt-1 truncate">
                      {formatTime(activeRecord.timestamp)}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-1">
                      No screen context selected
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openSettings('general')}
                    className="app-nodrag h-9 w-9 rounded-xl bg-white/70 border border-slate-200/60 shadow-sm text-slate-600 hover:bg-white transition flex items-center justify-center"
                    aria-label="Settings"
                    title="Settings"
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1 min-h-0 rounded-3xl bg-white border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-slate-200/60 bg-slate-50/60">
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">Context</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-slate-200/70 px-2.5 py-1 text-[11px] text-slate-600">
                            <Monitor className="h-3.5 w-3.5 text-slate-500" />
                            {activeMetadata ? activeMetadata.activeApp : activeRecord ? activeRecord.activeApp : '—'}
                          </span>
                          {activeUrlHost && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-slate-200/70 px-2.5 py-1 text-[11px] text-slate-600">
                              <Globe className="h-3.5 w-3.5 text-slate-500" />
                              {activeUrlHost}
                            </span>
                          )}
                          {activeMetadata && activeMetadata.tabs.length > 0 && (
                            <span className="inline-flex items-center rounded-full bg-white/80 border border-slate-200/70 px-2.5 py-1 text-[11px] text-slate-600 tabular-nums">
                              {activeMetadata.tabs.length} tabs
                            </span>
                          )}
                          {activeScreenshots.length > 0 && (
                            <span className="inline-flex items-center rounded-full bg-white/80 border border-slate-200/70 px-2.5 py-1 text-[11px] text-slate-600 tabular-nums">
                              {activeScreenshots.length} screenshot{activeScreenshots.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => setIsContextModalOpen(true)}
                          disabled={!contextModalEnabled}
                          className="app-nodrag inline-flex items-center justify-center rounded-xl bg-white border border-slate-200/70 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => window.electronAPI.clipboardWrite(activeMetadataText || '')}
                          disabled={!activeMetadataText}
                          className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/70 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          title="Copy raw metadata"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </button>
                      </div>
                    </div>

                    {isContextModalOpen && (
                      <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 py-10">
                        <button
                          className="absolute inset-0 bg-slate-900/20"
                          aria-label="Close"
                          onClick={() => setIsContextModalOpen(false)}
                        />
                        <div className="relative w-full max-w-3xl rounded-3xl bg-white border border-slate-200/70 shadow-2xl overflow-hidden">
                          <div className="px-4 py-3 border-b border-slate-200/60 bg-slate-50/70 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-slate-400">Metadata</div>
                              <div className="text-sm font-semibold text-slate-800 truncate">
                                {(activeMetadata?.activeApp || activeRecord?.activeApp || 'Unknown app')} ·{' '}
                                {(activeMetadata?.windowTitle || activeRecord?.windowTitle || 'Unknown window')}
                              </div>
                            </div>
                            <button
                              className="app-nodrag h-9 w-9 rounded-xl hover:bg-slate-200/40 text-slate-500 flex items-center justify-center transition"
                              onClick={() => setIsContextModalOpen(false)}
                              aria-label="Close metadata"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="p-4 space-y-4">
                            <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm overflow-hidden">
                              {activeScreenshots.length > 0 && (
                                <div className="px-4 py-3 border-b border-slate-200/60 bg-white/60 flex items-center gap-2 flex-wrap">
                                  {activeScreenshots.map((asset, idx) => (
                                    <button
                                      key={`${asset.relativePath}-${idx}`}
                                      onClick={() => setSelectedScreenshotIndex(idx)}
                                      className={cn(
                                        'app-nodrag inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] transition',
                                        idx === selectedScreenshotIndex
                                          ? 'bg-[#6e8f95] text-white border-[#6e8f95]'
                                          : 'bg-white/80 text-slate-600 border-slate-200/70 hover:bg-slate-50'
                                      )}
                                    >
                                      {asset.displayId || `Display ${idx + 1}`}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="aspect-[16/9] bg-[radial-gradient(800px_260px_at_35%_35%,rgba(110,143,149,0.20)_0%,rgba(255,255,255,0)_60%),linear-gradient(180deg,rgba(255,255,255,0.70)_0%,rgba(241,245,249,0.95)_100%)] flex items-center justify-center overflow-hidden">
                                {activeScreenshots.length === 0 ? (
                                  <div className="text-center px-6">
                                    <Monitor className="h-7 w-7 text-slate-500 mx-auto" />
                                    <div className="mt-2 text-sm font-semibold text-slate-700">Screenshot preview</div>
                                    <div className="mt-1 text-xs text-slate-500">(No persisted screenshot)</div>
                                  </div>
                                ) : isLoadingScreenshotPreview && !selectedScreenshotDataUrl ? (
                                  <div className="text-center px-6">
                                    <Loader2 className="h-7 w-7 text-slate-500 mx-auto animate-spin" />
                                    <div className="mt-2 text-sm font-semibold text-slate-700">Loading screenshot</div>
                                  </div>
                                ) : selectedScreenshotDataUrl ? (
                                  <img
                                    src={selectedScreenshotDataUrl}
                                    alt={`Screenshot ${selectedScreenshotIndex + 1}`}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="text-center px-6">
                                    <Monitor className="h-7 w-7 text-slate-500 mx-auto" />
                                    <div className="mt-2 text-sm font-semibold text-slate-700">Preview unavailable</div>
                                    {screenshotPreviewError && (
                                      <div className="mt-1 text-xs text-rose-500">{screenshotPreviewError}</div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {selectedScreenshot && (
                                <div className="px-4 py-3 border-t border-slate-200/60 text-xs text-slate-500 flex items-center justify-between gap-3">
                                  <div className="truncate">
                                    {selectedScreenshot.displayId || `Display ${selectedScreenshotIndex + 1}`} ·{' '}
                                    {selectedScreenshot.width}×{selectedScreenshot.height}
                                  </div>
                                  <div className="tabular-nums shrink-0">
                                    {formatBytes(selectedScreenshot.bytes)}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-4 text-sm text-slate-700 space-y-1">
                              <div className="tabular-nums">
                                <span className="text-slate-400">Captured:</span>{' '}
                                {activeRecord ? formatTime(activeRecord.timestamp) : '—'}
                              </div>
                              <div className="break-all">
                                <span className="text-slate-400">Active URL:</span>{' '}
                                {activeMetadata?.activeUrl ? activeMetadata.activeUrl : '—'}
                              </div>
                            </div>

                            {activeMetadata && activeMetadata.tabs.length > 0 && (
                              <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-200/60 bg-white/60 flex items-center justify-between">
                                  <div className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                                    Browser tabs
                                  </div>
                                  <div className="text-xs text-slate-400 tabular-nums">
                                    {activeMetadata.tabs.length}
                                  </div>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                  {activeMetadata.tabs.map((t, idx) => (
                                    <div
                                      key={`${idx}-${t.title}-${t.url}`}
                                      className="px-4 py-2 border-b border-slate-200/50 last:border-b-0 hover:bg-slate-50/60 transition"
                                    >
                                      <div className="text-sm font-medium text-slate-800 truncate">
                                        {t.title || 'Untitled'}
                                      </div>
                                      <div className="text-[11px] text-slate-500 truncate">{t.url}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                  {chatMessages.length === 0 && !isChatting ? (
                    <div className="text-sm text-slate-500">
                      Ask a question. This chat will use the screen context above (if any).
                    </div>
                  ) : (
                    chatMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                          m.role === 'user'
                            ? 'ml-auto bg-[#6e8f95] text-white'
                            : 'mr-auto bg-slate-50 border border-slate-200/60 text-slate-800'
                        }`}
                      >
                        {m.content}
                      </div>
                    ))
                  )}

                  {isChatting && (
                    <div className="mr-auto max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200/60 text-slate-800 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="border-t border-slate-200/60 p-3 bg-white">
                  <div className="flex items-center gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void sendMessage()
                        }
                      }}
                      placeholder={settings.apiKey.trim().length === 0 ? 'Set API key in Settings first…' : 'Type a message…'}
                      disabled={isChatting || settings.apiKey.trim().length === 0}
                      className="app-nodrag flex-1 rounded-xl bg-slate-50 border border-slate-200/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30 disabled:opacity-60"
                    />
                    <button
                      onClick={() => void sendMessage()}
                      disabled={isChatting || chatInput.trim().length === 0 || settings.apiKey.trim().length === 0}
                      className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[#6e8f95] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#628389] disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {route !== 'settings' && statusMessage && (
          <div className="px-6 pb-6">
            <div className="mx-auto w-full max-w-3xl">
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm px-4 py-3 text-sm text-slate-700 flex items-start justify-between gap-3">
                <div className="flex-1">{statusMessage}</div>
                <button
                  onClick={() => setStatusMessage(null)}
                  className="app-nodrag text-slate-400 hover:text-slate-600 transition"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
