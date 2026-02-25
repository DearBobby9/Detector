import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  AppSettings,
  BrowserSessionInfo,
  BrowserTabInfo,
  ChatMessage,
  HistoryRecord,
  MemoryItem,
  SettingsRuntimeStatus,
  ThemeMode,
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
  FlaskConical,
  Globe,
  HardDrive,
  LayoutGrid,
  Languages,
  Loader2,
  Monitor,
  MoreHorizontal,
  PenSquare,
  Rocket,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
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

type SettingsSection = 'general' | 'storage' | 'provider' | 'other'

const FALLBACK_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o',
  apiTimeoutMs: 30000,
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

const DEFAULT_CAPTURE_PROMPT_TEMPLATE = `You are a macOS screen understanding assistant.
Analyze screenshot(s) + active context and return strict JSON in Detector capture-analysis schema.
Be conservative and only detect emails when evidence is clear.`

const DEFAULT_CHAT_PROMPT_TEMPLATE = `You are a helpful desktop assistant.
Use screen context to answer follow-up questions with concise, practical guidance.`

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'light', label: 'Day', hint: 'Parchment surface with taupe text' },
  { value: 'dark', label: 'Night', hint: 'Taupe canvas with warm neutral contrast' },
  { value: 'system', label: 'System', hint: 'Follow macOS appearance' }
]

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return 'Never checked'
  const deltaMs = Date.now() - ts
  if (deltaMs < 15_000) return 'just now'
  const seconds = Math.max(1, Math.floor(deltaMs / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
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
  const [runtimeStatus, setRuntimeStatus] = useState<SettingsRuntimeStatus | null>(null)
  const [isCheckingRuntimeStatus, setIsCheckingRuntimeStatus] = useState(false)
  const [isRequestingScreenPermission, setIsRequestingScreenPermission] = useState(false)
  const [isOpeningScreenSettings, setIsOpeningScreenSettings] = useState(false)
  const [providerHealth, setProviderHealth] = useState<{ ok: boolean; message: string; latencyMs: number } | null>(null)
  const [providerLastCheckedAt, setProviderLastCheckedAt] = useState<number | null>(null)
  const [isExportingTimeline, setIsExportingTimeline] = useState(false)
  const [timelineFromDate, setTimelineFromDate] = useState('')
  const [timelineToDate, setTimelineToDate] = useState('')
  const [debugDayInput, setDebugDayInput] = useState('')
  const [isDebugReprocessing, setIsDebugReprocessing] = useState(false)
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
  const [expandedModalCandidateMap, setExpandedModalCandidateMap] = useState<Record<string, boolean>>({})

  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const [isSidebarSearchOpen, setIsSidebarSearchOpen] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null)
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)
  const [showSidebarTopFade, setShowSidebarTopFade] = useState(false)
  const [showSidebarBottomFade, setShowSidebarBottomFade] = useState(false)
  const settingsScrollRef = useRef<HTMLDivElement | null>(null)
  const [showSettingsTopFade, setShowSettingsTopFade] = useState(false)
  const [showSettingsBottomFade, setShowSettingsBottomFade] = useState(false)
  const contextModalScrollRef = useRef<HTMLDivElement | null>(null)
  const [showContextModalTopFade, setShowContextModalTopFade] = useState(false)
  const [showContextModalBottomFade, setShowContextModalBottomFade] = useState(false)

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

  const updateContextModalScrollFades = () => {
    const el = contextModalScrollRef.current
    if (!el) return

    const nextTop = el.scrollTop > 0
    const nextBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1

    setShowContextModalTopFade(nextTop)
    setShowContextModalBottomFade(nextBottom)
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
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    setSystemPrefersDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

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

  const loadRuntimeStatus = async (): Promise<void> => {
    try {
      const status = await window.electronAPI.getSettingsStatusCheck()
      setRuntimeStatus(status)
    } catch {
      // non-blocking
    }
  }

  const runRuntimeStatusCheck = async (): Promise<void> => {
    setIsCheckingRuntimeStatus(true)
    setStatusMessage(null)
    try {
      const status = await window.electronAPI.runSettingsStatusCheck()
      setRuntimeStatus(status)
      setStatusMessage(`Status check complete (${formatRelativeTime(status.lastCheckedAt)})`)
    } catch {
      setStatusMessage('Failed to run status check')
    } finally {
      setIsCheckingRuntimeStatus(false)
    }
  }

  const requestScreenPermission = async (): Promise<void> => {
    setIsRequestingScreenPermission(true)
    setStatusMessage(null)
    try {
      const result = await window.electronAPI.requestScreenPermission()
      setRuntimeStatus((prev) => ({
        ...(prev || {
          automationPermission: 'unknown',
          captureService: 'idle'
        }),
        screenPermission: result.status,
        lastCheckedAt: Date.now()
      }))
      setStatusMessage(result.message)
      void loadRuntimeStatus()
    } catch {
      setStatusMessage('Failed to request screen recording permission')
    } finally {
      setIsRequestingScreenPermission(false)
    }
  }

  const openScreenPermissionSettings = async (): Promise<void> => {
    setIsOpeningScreenSettings(true)
    setStatusMessage(null)
    try {
      const result = await window.electronAPI.openScreenPermissionSettings()
      setRuntimeStatus((prev) => ({
        ...(prev || {
          automationPermission: 'unknown',
          captureService: 'idle'
        }),
        screenPermission: result.status,
        lastCheckedAt: Date.now()
      }))
      setStatusMessage(result.ok ? 'Opened Screen Recording settings.' : result.message || 'Failed to open settings')
    } catch {
      setStatusMessage('Failed to open Screen Recording settings')
    } finally {
      setIsOpeningScreenSettings(false)
    }
  }

  const toggleSetting = (key: keyof Pick<
    AppSettings,
    'launchAtLogin' | 'showDockIcon' | 'shareCrashReports' | 'shareAnonymousUsage' | 'showTimelineIcons'
  >) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const resetPromptTemplates = () => {
    updateSetting('capturePromptTemplate', DEFAULT_CAPTURE_PROMPT_TEMPLATE)
    updateSetting('chatPromptTemplate', DEFAULT_CHAT_PROMPT_TEMPLATE)
  }

  const exportTimeline = async (): Promise<void> => {
    setIsExportingTimeline(true)
    setStatusMessage(null)
    try {
      const result = await window.electronAPI.exportTimelineMarkdown({
        fromDate: timelineFromDate || undefined,
        toDate: timelineToDate || undefined
      })
      if (result.ok) {
        setStatusMessage(
          `Timeline exported (${result.historyCount ?? 0} captures, ${result.memoryCount ?? 0} memory) -> ${result.path}`
        )
      } else {
        setStatusMessage(result.message || 'Timeline export failed')
      }
    } catch {
      setStatusMessage('Timeline export failed')
    } finally {
      setIsExportingTimeline(false)
    }
  }

  const runDebugReprocess = async (): Promise<void> => {
    if (!debugDayInput.trim()) {
      setStatusMessage('Please provide a day in YYYY-MM-DD format')
      return
    }

    setIsDebugReprocessing(true)
    setStatusMessage(null)
    try {
      const result = await window.electronAPI.debugReprocessDay({ day: debugDayInput.trim() })
      setStatusMessage(result.message)
    } catch {
      setStatusMessage('Debug reprocess failed')
    } finally {
      setIsDebugReprocessing(false)
    }
  }

  useEffect(() => {
    void refreshMemory()
  }, [])

  useEffect(() => {
    if (route !== 'settings') return
    if (settingsSection === 'storage') {
      void refreshStorageUsage()
    }
    if (settingsSection === 'general') {
      void loadRuntimeStatus()
    }

    const timer = window.setInterval(() => {
      if (settingsSection === 'storage') {
        void refreshStorageUsage(false, false)
      }
      if (settingsSection === 'general') {
        void loadRuntimeStatus()
      }
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
      settings.maxStorageBytes !== lastSavedSettings.maxStorageBytes ||
      settings.themeMode !== lastSavedSettings.themeMode ||
      settings.launchAtLogin !== lastSavedSettings.launchAtLogin ||
      settings.showDockIcon !== lastSavedSettings.showDockIcon ||
      settings.shareCrashReports !== lastSavedSettings.shareCrashReports ||
      settings.shareAnonymousUsage !== lastSavedSettings.shareAnonymousUsage ||
      settings.showTimelineIcons !== lastSavedSettings.showTimelineIcons ||
      settings.outputLanguageOverride !== lastSavedSettings.outputLanguageOverride ||
      (settings.capturePromptTemplate || '') !== (lastSavedSettings.capturePromptTemplate || '') ||
      (settings.chatPromptTemplate || '') !== (lastSavedSettings.chatPromptTemplate || '')
    )
  }, [
    lastSavedSettings.apiBaseUrl,
    lastSavedSettings.apiKey,
    lastSavedSettings.apiModel,
    lastSavedSettings.apiTimeoutMs,
    lastSavedSettings.maxStorageBytes,
    lastSavedSettings.themeMode,
    lastSavedSettings.launchAtLogin,
    lastSavedSettings.showDockIcon,
    lastSavedSettings.shareCrashReports,
    lastSavedSettings.shareAnonymousUsage,
    lastSavedSettings.showTimelineIcons,
    lastSavedSettings.outputLanguageOverride,
    lastSavedSettings.capturePromptTemplate,
    lastSavedSettings.chatPromptTemplate,
    settings.apiBaseUrl,
    settings.apiKey,
    settings.apiModel,
    settings.apiTimeoutMs,
    settings.maxStorageBytes,
    settings.themeMode,
    settings.launchAtLogin,
    settings.showDockIcon,
    settings.shareCrashReports,
    settings.shareAnonymousUsage,
    settings.showTimelineIcons,
    settings.outputLanguageOverride,
    settings.capturePromptTemplate,
    settings.chatPromptTemplate
  ])

  const resolvedThemeMode: Exclude<ThemeMode, 'system'> =
    settings.themeMode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : settings.themeMode

  useEffect(() => {
    document.body.dataset.themeMode = resolvedThemeMode
    document.documentElement.classList.toggle('dark', resolvedThemeMode === 'dark')
    return () => {
      delete document.body.dataset.themeMode
      document.documentElement.classList.remove('dark')
    }
  }, [resolvedThemeMode])

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
        const appName = typeof t?.appName === 'string' ? t.appName.trim() : ''
        const rawWindowIndex = Number(t?.windowIndex)
        const windowIndex = Number.isFinite(rawWindowIndex) && rawWindowIndex > 0 ? Math.floor(rawWindowIndex) : undefined
        return { title, url, appName: appName || undefined, windowIndex }
      })
      .filter((t: BrowserTabInfo) => t.title.length > 0 || t.url.length > 0)

    const browserSessionsRaw = Array.isArray(meta?.browserSessions) ? meta.browserSessions : []
    const browserSessions = browserSessionsRaw
      .map((sessionRaw: any) => {
        const appName = typeof sessionRaw?.appName === 'string' ? sessionRaw.appName.trim() : ''
        if (!appName) return null
        const sessionTabsRaw = Array.isArray(sessionRaw?.tabs) ? sessionRaw.tabs : []
        const sessionTabs = sessionTabsRaw
          .map((tabRaw: any, tabIndex: number) => {
            const title = typeof tabRaw?.title === 'string' ? tabRaw.title.trim() : ''
            const url = typeof tabRaw?.url === 'string' ? tabRaw.url.trim() : ''
            if (!title && !url) return null
            const rawIndex = Number(tabRaw?.index)
            const index = Number.isFinite(rawIndex) && rawIndex > 0 ? Math.floor(rawIndex) : tabIndex + 1
            const tabAppName = typeof tabRaw?.appName === 'string' ? tabRaw.appName.trim() : ''
            const rawWindowIndex = Number(tabRaw?.windowIndex)
            const windowIndex =
              Number.isFinite(rawWindowIndex) && rawWindowIndex > 0 ? Math.floor(rawWindowIndex) : undefined
            return { index, title, url, appName: tabAppName || appName, windowIndex }
          })
          .filter((tab: BrowserTabInfo | null): tab is BrowserTabInfo => Boolean(tab))

        const rawWindowCount = Number(sessionRaw?.windowCount)
        const windowCount = Number.isFinite(rawWindowCount) && rawWindowCount >= 0 ? Math.floor(rawWindowCount) : 0
        const activeUrl = typeof sessionRaw?.activeUrl === 'string' ? sessionRaw.activeUrl.trim() : ''
        const rawActiveTabIndex = Number(sessionRaw?.activeTabIndex)
        const activeTabIndex =
          Number.isFinite(rawActiveTabIndex) && rawActiveTabIndex > 0 ? Math.floor(rawActiveTabIndex) : undefined

        if (sessionTabs.length === 0 && windowCount === 0) return null
        return {
          appName,
          tabs: sessionTabs,
          windowCount,
          activeUrl: activeUrl || undefined,
          activeTabIndex
        } as BrowserSessionInfo
      })
      .filter((session: BrowserSessionInfo | null): session is BrowserSessionInfo => Boolean(session))

    const flattenedTabs = tabs.length > 0 ? tabs : browserSessions.flatMap((session) => session.tabs)

    return { activeApp, windowTitle, activeUrl, tabs: flattenedTabs, browserSessions, capturedAt }
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
        const details = typeof c?.details === 'string' ? c.details.trim() : ''
        const source = typeof c?.source === 'string' ? c.source.trim() : ''
        if (!title) return null
        return { kind, title, dueAt, confidence, details, source }
      })
      .filter(Boolean)
  }, [activePayload])

  useEffect(() => {
    if (!isContextModalOpen) return
    setSelectedScreenshotIndex(0)
    setScreenshotPreviewError(null)
  }, [isContextModalOpen, activeRecord?.id])

  useEffect(() => {
    setExpandedModalCandidateMap({})
  }, [activeRecord?.id])

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

  useEffect(() => {
    if (!isContextModalOpen) {
      setShowContextModalTopFade(false)
      setShowContextModalBottomFade(false)
      return
    }
    updateContextModalScrollFades()
  }, [
    isContextModalOpen,
    activeRecord?.id,
    activeScreenshots.length,
    selectedScreenshotIndex,
    selectedScreenshotDataUrl,
    isLoadingScreenshotPreview,
    activeMemoryCandidates.length,
    activeMetadata?.tabs.length,
    activeMetadata?.browserSessions.length
  ])

  useEffect(() => {
    if (!isContextModalOpen) return
    const el = contextModalScrollRef.current
    if (!el) return

    const onScroll = () => updateContextModalScrollFades()
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [isContextModalOpen, activeRecord?.id])

  const activeMetadataText = useMemo(() => {
    if (!activeMetadata) return ''
    const lines: string[] = []
    lines.push(`Captured: ${formatTime(activeMetadata.capturedAt)}`)
    lines.push(`Active app: ${activeMetadata.activeApp}`)
    lines.push(`Window: ${activeMetadata.windowTitle}`)
    if (activeMetadata.activeUrl) lines.push(`Active URL: ${activeMetadata.activeUrl}`)

    if (activeMetadata.browserSessions.length > 0) {
      lines.push('', `Browser sessions (${activeMetadata.browserSessions.length}):`)
      activeMetadata.browserSessions.forEach((session, sessionIndex) => {
        const sessionHeader: string[] = [
          `${sessionIndex + 1}. ${session.appName || 'Browser'}`,
          `${session.tabs.length} tabs`
        ]
        if (session.windowCount > 0) {
          sessionHeader.push(`${session.windowCount} windows`)
        }
        lines.push(sessionHeader.join(' · '))
        if (session.activeUrl) {
          lines.push(`Active URL: ${session.activeUrl}`)
        }
        session.tabs.forEach((tab) => {
          const left = tab.title ? tab.title : '(untitled)'
          const right = tab.url ? ` — ${tab.url}` : ''
          lines.push(`- ${left}${right}`)
        })
        lines.push('')
      })
      if (lines[lines.length - 1] === '') {
        lines.pop()
      }
    } else if (activeMetadata.tabs.length > 0) {
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

  const activeSummaryText = useMemo(() => {
    if (!activeRecord) return ''

    if (activePayload?.type === 'page-summary') {
      const summary = typeof activePayload.summary === 'string' ? activePayload.summary.trim() : ''
      if (summary) return summary
    }

    if (activePayload?.type === 'capture-analysis') {
      const payloadSummaryCandidates = [
        (activePayload as any).summary,
        (activePayload as any).overview,
        (activePayload as any).briefSummary
      ]
      for (const candidate of payloadSummaryCandidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate.trim()
        }
      }

      const lines = getRecordText(activeRecord)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const screenTitle = typeof (activePayload as any).screenTitle === 'string' ? String((activePayload as any).screenTitle).trim() : ''
      const filtered = lines.filter((line, index) => {
        if (index === 0 && screenTitle && line === screenTitle) return false
        if (/^email reply:$/i.test(line) || /^memory candidates:$/i.test(line)) return false
        if (/^- \[[a-z-]+\]/i.test(line)) return false
        return true
      })
      if (filtered.length > 0) {
        return filtered.slice(0, 4).join(' ')
      }

      const metaParts: string[] = []
      if (screenTitle) metaParts.push(screenTitle)
      if (activeMetadata?.activeApp) metaParts.push(`App: ${activeMetadata.activeApp}`)
      if (activeMetadata?.tabs?.length) metaParts.push(`${activeMetadata.tabs.length} tabs visible`)
      if (activeMemoryCandidates.length > 0) metaParts.push(`${activeMemoryCandidates.length} candidates extracted`)
      return metaParts.join(' • ')
    }

    const fallback = getRecordText(activeRecord)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return fallback.slice(0, 4).join(' ')
  }, [activeRecord, activePayload, activeMetadata, activeMemoryCandidates.length])

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
      ? 'bg-[var(--ui-progress-danger)]'
      : storageTone === 'warning'
        ? 'bg-[var(--ui-progress-warning)]'
        : 'bg-[var(--ui-progress-normal)]'

  const storageCategories: StorageCategoryUsage[] = storageUsage?.categories ?? []

  const runtimeScreenPermission = runtimeStatus?.screenPermission ?? 'unknown'
  const runtimeAutomationPermission = runtimeStatus?.automationPermission ?? 'unknown'
  const runtimeCaptureService = runtimeStatus?.captureService ?? 'idle'
  const screenPermissionNeedsRequest =
    runtimeScreenPermission === 'not-determined' || runtimeScreenPermission === 'unknown'
  const screenPermissionNeedsSettings =
    runtimeScreenPermission === 'denied' || runtimeScreenPermission === 'restricted'
  const providerKeyConfigured = settings.apiKey.trim().length > 0
  const providerBaseHost = (() => {
    try {
      const url = new URL(settings.apiBaseUrl)
      return url.host || settings.apiBaseUrl
    } catch {
      return settings.apiBaseUrl || '—'
    }
  })()

  const permissionToneClass = (permission: SettingsRuntimeStatus['screenPermission']) => {
    if (permission === 'granted') return 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
    if (permission === 'denied' || permission === 'restricted')
      return 'bg-rose-50 text-rose-700 border-rose-200/70'
    return 'bg-amber-50 text-amber-700 border-amber-200/70'
  }

  const permissionLabel = (permission: SettingsRuntimeStatus['screenPermission']) => {
    if (permission === 'not-determined') return 'not determined'
    return permission
  }

  const captureServiceToneClass = (status: SettingsRuntimeStatus['captureService']) => {
    if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
    if (status === 'error') return 'bg-rose-50 text-rose-700 border-rose-200/70'
    return 'bg-slate-100 text-slate-600 border-slate-200/70'
  }

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
      setProviderHealth(res)
      setProviderLastCheckedAt(Date.now())
      setStatusMessage(res.ok ? `API test ok (${res.latencyMs}ms)` : `API test failed: ${res.message} (${res.latencyMs}ms)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProviderHealth({ ok: false, message, latencyMs: 0 })
      setProviderLastCheckedAt(Date.now())
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
      className="app-shell-background h-full w-full min-h-0 grid text-[var(--ui-text)] overflow-hidden"
      style={{ gridTemplateColumns: `${sidebarWidth}px ${SIDEBAR_RESIZER_WIDTH_PX}px 1fr`, gridTemplateRows: '1fr' }}
    >
      <aside className="app-sidebar flex flex-col relative min-w-0 min-h-0 overflow-hidden">
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
                <button
                  className={cn(
                    'app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-2xl border transition text-sm',
                    settingsSection === 'other'
                      ? 'bg-white/80 border-slate-200/70 shadow-sm text-slate-800'
                      : 'bg-white/0 border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200/60'
                  )}
                  onClick={() => setSettingsSection('other')}
                >
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  <span className="flex-1 text-left">Other</span>
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
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]',
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
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-[var(--ui-accent)]" />
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
                    'app-scroll-fade app-scroll-fade-top pointer-events-none absolute left-0 right-0 top-0 h-7',
                    'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                    showSidebarTopFade ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div
                  className={cn(
                    'app-scroll-fade app-scroll-fade-bottom pointer-events-none absolute left-0 right-0 bottom-0 h-7',
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
                <div className="w-[220px] rounded-2xl bg-white/80 border border-slate-200/70 shadow-2xl backdrop-blur p-2">
                  <div className="space-y-1">
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]"
                      onClick={() => setStatusMessage('Manage Prompt Apps not implemented yet')}
                    >
                      <SlidersHorizontal className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">
                        Manage Prompt Apps
                      </span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]"
                      onClick={openMemory}
                    >
                      <Bookmark className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Memory</span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]"
                      onClick={() => setStatusMessage('Live Coding not implemented yet')}
                    >
                      <Code2 className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Live Coding</span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]"
                      onClick={() => openSettings('general')}
                    >
                      <SettingsIcon className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Settings</span>
                    </button>
                  </div>

                  <div className="my-2 h-px bg-white/20" />

                  <div className="space-y-1">
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]"
                      onClick={() =>
                        setSidebarWidth(clampNumber(SIDEBAR_DEFAULT_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, getMaxSidebarWidth()))
                      }
                    >
                      <LayoutGrid className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Reset width</span>
                    </button>
                    <button
                      className="app-nodrag w-full h-10 flex items-center gap-3 px-3 rounded-xl hover:bg-slate-100/80 transition text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]"
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
          'app-nodrag relative cursor-col-resize group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-bg-base)]',
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
        <div className="h-12 shrink-0 app-drag" />

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
                className="app-nodrag mt-2 w-[360px] max-w-full h-12 rounded-xl bg-[var(--ui-accent)] hover:bg-[var(--ui-accent-hover)] text-[var(--ui-accent-contrast)] text-sm font-medium shadow-sm transition flex items-center justify-center"
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
                    {settingsSection === 'general'
                      ? 'General'
                      : settingsSection === 'provider'
                        ? 'Providers'
                        : settingsSection === 'storage'
                          ? 'Storage'
                          : 'Other'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {settingsSection === 'general'
                      ? 'Runtime status, permissions, and core app preferences.'
                      : settingsSection === 'provider'
                        ? 'Manage provider config, health checks, and prompt templates.'
                        : settingsSection === 'storage'
                          ? 'Track local disk usage and cleanup limits.'
                          : 'Export, diagnostics, and non-core controls.'}
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
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-slate-800">Recording status</div>
                              <div className="text-sm text-slate-500 mt-1">
                                Ensure screen capture and metadata collection are available.
                              </div>
                            </div>
                            <button
                              onClick={() => void runRuntimeStatusCheck()}
                              disabled={isCheckingRuntimeStatus}
                              className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                              {isCheckingRuntimeStatus ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Checking
                                </>
                              ) : (
                                'Run status check'
                              )}
                            </button>
                          </div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">Screen recording</div>
                              <div className="mt-1 flex items-center gap-2">
                                {runtimeScreenPermission === 'granted' ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                                )}
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                                    permissionToneClass(runtimeScreenPermission)
                                  )}
                                >
                                  {permissionLabel(runtimeScreenPermission)}
                                </span>
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">Automation</div>
                              <div className="mt-1 flex items-center gap-2">
                                {runtimeAutomationPermission === 'granted' ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                                )}
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                                    permissionToneClass(runtimeAutomationPermission)
                                  )}
                                >
                                  {permissionLabel(runtimeAutomationPermission)}
                                </span>
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">Capture service</div>
                              <div className="mt-1 flex items-center gap-2">
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                                    captureServiceToneClass(runtimeCaptureService)
                                  )}
                                >
                                  {runtimeCaptureService}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-slate-500">
                            Last checked: {formatRelativeTime(runtimeStatus?.lastCheckedAt)}
                          </div>
                          {(screenPermissionNeedsRequest || screenPermissionNeedsSettings) && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {screenPermissionNeedsRequest && (
                                <button
                                  onClick={() => void requestScreenPermission()}
                                  disabled={isRequestingScreenPermission}
                                  className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[var(--ui-accent)] px-3 py-1.5 text-xs font-medium text-[var(--ui-accent-contrast)] hover:bg-[var(--ui-accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
                                >
                                  {isRequestingScreenPermission ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Requesting
                                    </>
                                  ) : (
                                    'Request access'
                                  )}
                                </button>
                              )}
                              {screenPermissionNeedsSettings && (
                                <button
                                  onClick={() => void openScreenPermissionSettings()}
                                  disabled={isOpeningScreenSettings}
                                  className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                                >
                                  {isOpeningScreenSettings ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Opening settings
                                    </>
                                  ) : (
                                    'Open System Settings'
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600">
                          Core preferences and language are in <span className="font-semibold">Other</span>. Storage usage and cleanup limits are in <span className="font-semibold">Storage</span>.
                        </div>
                      </>
                    )}

                    {settingsSection === 'other' && (
                      <>
                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="text-lg font-semibold text-slate-800">Appearance</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Keep Detector aligned with your system look and behavior.
                          </div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {THEME_MODE_OPTIONS.map((option) => {
                              const active = settings.themeMode === option.value
                              return (
                                <button
                                  key={option.value}
                                  className={cn(
                                    'app-nodrag rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent-ring)]',
                                    active
                                      ? 'bg-[var(--ui-accent)] text-[var(--ui-accent-contrast)] border-[var(--ui-accent)] shadow-sm'
                                      : 'bg-white/60 text-slate-700 border-slate-200/70 hover:bg-white/80'
                                  )}
                                  onClick={() => updateSetting('themeMode', option.value)}
                                >
                                  <div className="text-sm font-semibold">{option.label}</div>
                                  <div className={cn('mt-0.5 text-xs', active ? 'opacity-85' : 'text-slate-500')}>
                                    {option.hint}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          <div className="mt-3 text-xs text-slate-500">
                            Active palette: {resolvedThemeMode === 'dark' ? 'Night' : 'Day'}
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="text-lg font-semibold text-slate-800">App preferences</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Runtime behavior and privacy controls.
                          </div>
                          <div className="mt-4 space-y-3">
                            <button
                              className="app-nodrag w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-white transition"
                              onClick={() => toggleSetting('launchAtLogin')}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">Launch at login</span>
                                <span className="block text-xs text-slate-500 mt-0.5">Start Detector when macOS signs in.</span>
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                                <ToggleLeft className={cn('h-4 w-4', settings.launchAtLogin ? 'text-[var(--ui-accent)]' : 'text-slate-400')} />
                                {settings.launchAtLogin ? 'On' : 'Off'}
                              </span>
                            </button>

                            <button
                              className="app-nodrag w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-white transition"
                              onClick={() => toggleSetting('showDockIcon')}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">Show Dock icon</span>
                                <span className="block text-xs text-slate-500 mt-0.5">Off = menu bar only mode.</span>
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                                <ToggleLeft className={cn('h-4 w-4', settings.showDockIcon ? 'text-[var(--ui-accent)]' : 'text-slate-400')} />
                                {settings.showDockIcon ? 'On' : 'Off'}
                              </span>
                            </button>

                            <button
                              className="app-nodrag w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-white transition"
                              onClick={() => toggleSetting('shareCrashReports')}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">Share crash reports</span>
                                <span className="block text-xs text-slate-500 mt-0.5">Planned: telemetry pipeline hookup.</span>
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                                <span className="rounded-full border border-slate-200/70 px-2 py-0.5">Planned</span>
                                {settings.shareCrashReports ? 'On' : 'Off'}
                              </span>
                            </button>

                            <button
                              className="app-nodrag w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-white transition"
                              onClick={() => toggleSetting('shareAnonymousUsage')}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">Share anonymous usage</span>
                                <span className="block text-xs text-slate-500 mt-0.5">Planned: anonymized product metrics.</span>
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                                <span className="rounded-full border border-slate-200/70 px-2 py-0.5">Planned</span>
                                {settings.shareAnonymousUsage ? 'On' : 'Off'}
                              </span>
                            </button>

                            <button
                              className="app-nodrag w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-white transition"
                              onClick={() => toggleSetting('showTimelineIcons')}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">Show timeline app/site icons</span>
                                <span className="block text-xs text-slate-500 mt-0.5">Not enabled in current list view yet.</span>
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                                <span className="rounded-full border border-slate-200/70 px-2 py-0.5">Not enabled</span>
                                {settings.showTimelineIcons ? 'On' : 'Off'}
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Languages className="h-5 w-5 text-slate-500" />
                            Output language override
                          </div>
                          <div className="text-sm text-slate-500 mt-1">
                            Leave empty to follow model default language.
                          </div>
                          <div className="mt-4 max-w-md">
                            <input
                              value={settings.outputLanguageOverride}
                              onChange={(e) => updateSetting('outputLanguageOverride', e.target.value)}
                              placeholder="e.g. English, 中文, 日本語"
                              className="app-nodrag w-full rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                            />
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="text-lg font-semibold text-slate-800">Export timeline</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Export captures + memory to Markdown for a selected date range.
                          </div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-500">From</span>
                              <input
                                type="date"
                                value={timelineFromDate}
                                onChange={(e) => setTimelineFromDate(e.target.value)}
                                className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-500">To</span>
                              <input
                                type="date"
                                value={timelineToDate}
                                onChange={(e) => setTimelineToDate(e.target.value)}
                                className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                              />
                            </label>
                          </div>
                          <div className="mt-4">
                            <button
                              onClick={() => void exportTimeline()}
                              disabled={isExportingTimeline}
                              className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[var(--ui-accent)] px-4 py-2 text-sm font-medium text-[var(--ui-accent-contrast)] hover:bg-[var(--ui-accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                              {isExportingTimeline ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Exporting...
                                </>
                              ) : (
                                <>
                                  <ExternalLink className="h-4 w-4" />
                                  Export Markdown
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {import.meta.env.DEV && (
                          <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                            <div className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                              <FlaskConical className="h-5 w-5 text-slate-500" />
                              Debug: reprocess day
                            </div>
                            <div className="text-sm text-slate-500 mt-1">
                              Development-only hook to re-run day-level processing.
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                              <input
                                type="date"
                                value={debugDayInput}
                                onChange={(e) => setDebugDayInput(e.target.value)}
                                className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                              />
                              <button
                                onClick={() => void runDebugReprocess()}
                                disabled={isDebugReprocessing}
                                className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                              >
                                {isDebugReprocessing ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Running...
                                  </>
                                ) : (
                                  <>
                                    <Rocket className="h-4 w-4" />
                                    Reprocess day
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {settingsSection === 'provider' && (
                      <>
                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="text-lg font-semibold text-slate-800">Provider overview</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Single-provider mode with health checks and prompt controls.
                          </div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">Endpoint</div>
                              <div className="mt-1 text-sm font-medium text-slate-800 truncate">{providerBaseHost}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">Model</div>
                              <div className="mt-1 text-sm font-medium text-slate-800 truncate">{settings.apiModel || '—'}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">API key</div>
                              <div className="mt-1 text-sm font-medium text-slate-800">
                                {providerKeyConfigured ? 'Configured' : 'Missing'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">Connection health</div>
                              <div
                                className={cn(
                                  'mt-1 text-sm font-medium',
                                  providerHealth ? (providerHealth.ok ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-500'
                                )}
                              >
                                {providerHealth ? (providerHealth.ok ? 'Healthy' : 'Degraded') : 'Not checked'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-slate-800">Connection health</div>
                              <div className="text-sm text-slate-500 mt-1">
                                Validate API connectivity for current endpoint, model, and key.
                              </div>
                            </div>
                            <button
                              onClick={testApi}
                              disabled={isTestingApi || isLoadingSettings}
                              className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                              {isTestingApi ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Testing
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5" />
                                  Run health check
                                </>
                              )}
                            </button>
                          </div>
                          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-slate-800">
                                {providerHealth
                                  ? providerHealth.ok
                                    ? 'Connection healthy'
                                    : 'Connection issue detected'
                                  : 'No health check result yet'}
                              </div>
                              <span className="text-xs text-slate-500">
                                Last checked: {formatRelativeTime(providerLastCheckedAt)}
                              </span>
                            </div>
                            {providerHealth && (
                              <div className="mt-2 text-xs text-slate-500">
                                {providerHealth.message} · latency {providerHealth.latencyMs} ms
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div>
                            <div className="text-lg font-semibold text-slate-800">Edit configuration</div>
                            <div className="text-sm text-slate-500 mt-1">
                              Configure your OpenAI-compatible endpoint and request defaults.
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-1 gap-4">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-500">API Base URL</span>
                              <input
                                value={settings.apiBaseUrl}
                                onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                                className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                                placeholder="https://api.openai.com/v1"
                              />
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs text-slate-500">Model</span>
                                <input
                                  value={settings.apiModel}
                                  onChange={(e) => updateSetting('apiModel', e.target.value)}
                                  className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                                  placeholder="gpt-4o"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs text-slate-500">Timeout (ms)</span>
                                <input
                                  type="number"
                                  min={5000}
                                  step={1000}
                                  value={settings.apiTimeoutMs}
                                  onChange={(e) => updateSetting('apiTimeoutMs', Number(e.target.value || 0))}
                                  className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                                  placeholder="30000"
                                />
                              </label>
                            </div>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-500">API Key</span>
                              <input
                                type="password"
                                value={settings.apiKey}
                                onChange={(e) => updateSetting('apiKey', e.target.value)}
                                className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                                placeholder="sk-..."
                              />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-slate-800">Prompt customization</div>
                              <div className="text-sm text-slate-500 mt-1">
                                Customize capture-analysis and chat system prompts.
                              </div>
                            </div>
                            <button
                              onClick={resetPromptTemplates}
                              className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                            >
                              Reset defaults
                            </button>
                          </div>
                          <div className="mt-4 space-y-3">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-500">Capture prompt template</span>
                              <textarea
                                value={settings.capturePromptTemplate || ''}
                                onChange={(e) => updateSetting('capturePromptTemplate', e.target.value)}
                                rows={4}
                                className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)] resize-y min-h-[96px]"
                                placeholder={DEFAULT_CAPTURE_PROMPT_TEMPLATE}
                              />
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-500">Chat prompt template</span>
                              <textarea
                                value={settings.chatPromptTemplate || ''}
                                onChange={(e) => updateSetting('chatPromptTemplate', e.target.value)}
                                rows={4}
                                className="app-nodrag rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)] resize-y min-h-[96px]"
                                placeholder={DEFAULT_CHAT_PROMPT_TEMPLATE}
                              />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-6">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-lg font-semibold text-slate-800">Failover routing</div>
                              <div className="text-sm text-slate-500 mt-1">
                                Secondary provider failover is planned in a future phase.
                              </div>
                            </div>
                            <span className="rounded-full border border-slate-200/80 px-3 py-1 text-xs font-medium text-slate-500">
                              Planned
                            </span>
                          </div>
                        </div>
                      </>
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
                                      ? 'text-[var(--ui-progress-danger)]'
                                      : storageTone === 'warning'
                                        ? 'text-[var(--ui-progress-warning)]'
                                        : 'text-[var(--ui-text-muted)]'
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
                                  className="app-nodrag w-full accent-[var(--ui-accent)]"
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
                                      className="app-nodrag w-full rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 pr-11 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)]"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                      MB
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => void saveStorageLimit()}
                                    disabled={isSavingStorageLimit || isLoadingStorage}
                                    className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[var(--ui-accent)] px-3.5 py-2 text-sm font-medium text-[var(--ui-accent-contrast)] hover:bg-[var(--ui-accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
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
                              <div className="rounded-2xl border border-[var(--ui-progress-danger)]/45 bg-[var(--ui-progress-danger)]/18 p-4 flex items-center justify-between gap-3">
                                <div className="text-sm text-[var(--ui-text)]">
                                  Storage is above limit by{' '}
                                  <span className="font-semibold">
                                    {formatBytes(storageUsage.usedBytes - storageUsage.maxBytes)}
                                  </span>
                                  . Run cleanup to remove oldest captures.
                                </div>
                                <button
                                  onClick={() => void runStorageCleanup()}
                                  disabled={isEnforcingStorageLimit}
                                  className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[var(--ui-progress-danger)] px-3.5 py-2 text-sm font-medium text-[var(--ui-accent-contrast)] hover:bg-[var(--ui-danger-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
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
                      'app-settings-scroll-fade app-settings-scroll-fade-top pointer-events-none absolute left-0 right-1 top-0 h-8',
                      'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                      showSettingsTopFade ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div
                    className={cn(
                      'app-settings-scroll-fade app-settings-scroll-fade-bottom pointer-events-none absolute left-0 right-1 bottom-0 h-8',
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
                    : settingsSection === 'general'
                      ? `Last status check: ${formatRelativeTime(runtimeStatus?.lastCheckedAt)}`
                      : settingsSection === 'provider' && providerLastCheckedAt
                        ? `Provider health checked ${formatRelativeTime(providerLastCheckedAt)}`
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
                  {settingsSection === 'provider' && (
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
                    </>
                  )}
                  {settingsSection !== 'storage' && (
                    <>
                      <button
                        onClick={saveSettings}
                        disabled={!canSave || isSavingSettings || !isDirty || isLoadingSettings}
                        className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[var(--ui-accent)] px-4 py-2 text-sm font-medium text-[var(--ui-accent-contrast)] hover:bg-[var(--ui-accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
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
                          {activeMetadata && activeMetadata.browserSessions.length > 0 && (
                            <span className="inline-flex items-center rounded-full bg-white/80 border border-slate-200/70 px-2.5 py-1 text-[11px] text-slate-600 tabular-nums">
                              {activeMetadata.browserSessions.length} browser apps
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

                    <AnimatePresence>
                      {isContextModalOpen && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
                          <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className="absolute inset-0 bg-slate-900/20"
                            aria-label="Close"
                            onClick={() => setIsContextModalOpen(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 14, scale: 0.985 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.99 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="relative w-full max-w-5xl max-h-[88vh] rounded-3xl bg-white border border-slate-200/70 shadow-2xl overflow-hidden flex flex-col"
                          >
                            <div className="px-4 py-3 border-b border-slate-200/60 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
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

                            <div className="relative min-h-0 flex-1 flex flex-col">
                              <div ref={contextModalScrollRef} className="min-h-0 flex-1 overflow-y-auto">
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
                                              ? 'bg-[var(--ui-accent)] text-[var(--ui-accent-contrast)] border-[var(--ui-accent)]'
                                              : 'bg-white/80 text-slate-600 border-slate-200/70 hover:bg-slate-50'
                                          )}
                                        >
                                          {asset.displayId || `Display ${idx + 1}`}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  <div className="aspect-[16/9] app-screenshot-preview-bg flex items-center justify-center overflow-hidden">
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
                                          <div className="mt-1 text-xs text-[var(--ui-progress-danger)]">
                                            {screenshotPreviewError}
                                          </div>
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

                                <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm p-4">
                                  <div className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                                    Summary
                                  </div>
                                  <div className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                                    {activeSummaryText || 'No summary extracted yet for this capture.'}
                                  </div>
                                </div>

                                <div className="rounded-3xl bg-white/80 border border-slate-200/70 shadow-sm overflow-hidden">
                                  <div className="px-4 py-3 border-b border-slate-200/60 bg-white/60 flex items-center justify-between">
                                    <div className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                                      Candidates
                                    </div>
                                    <div className="text-xs text-slate-400 tabular-nums">
                                      {activeMemoryCandidates.length}
                                    </div>
                                  </div>
                                  {activeMemoryCandidates.length === 0 ? (
                                    <div className="px-4 py-3 text-sm text-slate-500">
                                      No candidate extracted for this capture.
                                    </div>
                                  ) : (
                                    <div className="divide-y divide-slate-200/60">
                                      {activeMemoryCandidates.map((candidate, idx) => (
                                        <div key={`${candidate.title}-${idx}`} className="px-4 py-3">
                                          {(() => {
                                            const rowKey = `${activeRecord?.id ?? 'none'}:${idx}`
                                            const isExpanded = Boolean(expandedModalCandidateMap[rowKey])
                                            const detailsRaw =
                                              typeof candidate.details === 'string' ? candidate.details.trim() : ''
                                            const sourceRaw =
                                              typeof candidate.source === 'string' ? candidate.source.trim() : ''
                                            const hasLongDetails = detailsRaw.length > 220
                                            const hasLongSource = sourceRaw.length > 120
                                            const isExpandable = hasLongDetails || hasLongSource
                                            const displayDetails =
                                              isExpanded || !hasLongDetails
                                                ? detailsRaw
                                                : truncateText(detailsRaw, 220)
                                            const displaySource =
                                              isExpanded || !hasLongSource ? sourceRaw : truncateText(sourceRaw, 120)

                                            return (
                                              <>
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-semibold text-slate-800 min-w-0 truncate">
                                              {candidate.title}
                                            </div>
                                            <div className="text-[11px] text-slate-500 tabular-nums shrink-0">
                                              {typeof candidate.dueAt === 'string' && candidate.dueAt.trim()
                                                ? candidate.dueAt
                                                : ''}
                                            </div>
                                          </div>
                                          <div className="mt-1 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                            <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200/70 px-2 py-0.5">
                                              {candidate.kind}
                                            </span>
                                            {typeof candidate.confidence === 'number' && (
                                              <span className="tabular-nums">
                                                {Math.round(candidate.confidence * 100)}%
                                              </span>
                                            )}
                                          </div>
                                          {displayDetails && (
                                            <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                                              {displayDetails}
                                            </div>
                                          )}
                                          {displaySource && (
                                            <div className="mt-2 text-xs text-slate-500 whitespace-pre-wrap break-words">
                                              Source: {displaySource}
                                            </div>
                                          )}
                                          {isExpandable && (
                                            <button
                                              className="app-nodrag mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100/80 transition"
                                              onClick={() =>
                                                setExpandedModalCandidateMap((prev) => ({
                                                  ...prev,
                                                  [rowKey]: !prev[rowKey]
                                                }))
                                              }
                                            >
                                              <ChevronDown
                                                className={cn(
                                                  'h-3.5 w-3.5 transition-transform duration-200',
                                                  isExpanded && 'rotate-180'
                                                )}
                                              />
                                              {isExpanded ? 'Collapse' : 'Expand details'}
                                            </button>
                                          )}
                                              </>
                                            )
                                          })()}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {activeMetadata &&
                                  (activeMetadata.tabs.length > 0 || activeMetadata.browserSessions.length > 0) && (
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
                                      {activeMetadata.browserSessions.length > 0 ? (
                                        <div className="divide-y divide-slate-200/50">
                                          {activeMetadata.browserSessions.map((session, sessionIdx) => (
                                            <div key={`${session.appName}-${sessionIdx}`}>
                                              <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-200/50">
                                                <div className="text-xs font-medium text-slate-600">
                                                  {session.appName}
                                                  <span className="ml-2 tabular-nums text-slate-500">
                                                    {session.tabs.length} tabs
                                                    {session.windowCount > 0 ? ` · ${session.windowCount} windows` : ''}
                                                  </span>
                                                </div>
                                                {session.activeUrl && (
                                                  <div className="text-[11px] text-slate-500 truncate mt-1">
                                                    Active URL: {session.activeUrl}
                                                  </div>
                                                )}
                                              </div>
                                              {session.tabs.length === 0 ? (
                                                <div className="px-4 py-2 text-xs text-slate-500">No tabs found</div>
                                              ) : (
                                                session.tabs.map((t, tabIdx) => (
                                                  <div
                                                    key={`${sessionIdx}-${tabIdx}-${t.title}-${t.url}`}
                                                    className="px-4 py-2 border-b border-slate-200/40 last:border-b-0 hover:bg-slate-50/60 transition"
                                                  >
                                                    <div className="text-sm font-medium text-slate-800 truncate">
                                                      {t.title || 'Untitled'}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 truncate">
                                                      {typeof t.windowIndex === 'number' ? `Window ${t.windowIndex} · ` : ''}
                                                      {t.url}
                                                    </div>
                                                  </div>
                                                ))
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        activeMetadata.tabs.map((t, idx) => (
                                          <div
                                            key={`${idx}-${t.title}-${t.url}`}
                                            className="px-4 py-2 border-b border-slate-200/50 last:border-b-0 hover:bg-slate-50/60 transition"
                                          >
                                            <div className="text-sm font-medium text-slate-800 truncate">
                                              {t.title || 'Untitled'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 truncate">{t.url}</div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              </div>

                              <div
                                className={cn(
                                  'app-metadata-scroll-fade app-metadata-scroll-fade-top pointer-events-none absolute left-0 right-1 top-0 h-9 transition-opacity duration-200',
                                  showContextModalTopFade ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div
                                className={cn(
                                  'app-metadata-scroll-fade app-metadata-scroll-fade-bottom pointer-events-none absolute left-0 right-1 bottom-0 h-10 transition-opacity duration-200',
                                  showContextModalBottomFade ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>
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
                            ? 'ml-auto bg-[var(--ui-accent)] text-[var(--ui-accent-contrast)]'
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
                      className="app-nodrag flex-1 rounded-xl bg-slate-50 border border-slate-200/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ui-accent-ring)] disabled:opacity-60"
                    />
                    <button
                      onClick={() => void sendMessage()}
                      disabled={isChatting || chatInput.trim().length === 0 || settings.apiKey.trim().length === 0}
                      className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-[var(--ui-accent)] px-3.5 py-2 text-sm font-medium text-[var(--ui-accent-contrast)] hover:bg-[var(--ui-accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
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
