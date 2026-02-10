import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { AppSettings, ChatMessage, HistoryRecord } from '@shared/types'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  Cog,
  Code2,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  PenSquare,
  Search,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react'

type Route = 'home' | 'chat' | 'settings'

const SIDEBAR_WIDTH_STORAGE_KEY = 'detector.sidebarWidth'
const SIDEBAR_DEFAULT_WIDTH_PX = 260
const SIDEBAR_MIN_WIDTH_PX = 220
const SIDEBAR_MAX_WIDTH_PX = 520
const MAIN_MIN_WIDTH_PX = 420
const SIDEBAR_RESIZER_WIDTH_PX = 14

type SettingsSection = 'general' | 'provider'

const FALLBACK_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o',
  apiTimeoutMs: 30000
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

  return lines[0] || record.resultType || 'Capture'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function MainAppShell() {
  const [route, setRoute] = useState<Route>('home')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS)
  const [lastSavedSettings, setLastSavedSettings] = useState<AppSettings>(FALLBACK_SETTINGS)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isTestingApi, setIsTestingApi] = useState(false)

  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatting, setIsChatting] = useState(false)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const [isSidebarSearchOpen, setIsSidebarSearchOpen] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null)
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)
  const [showSidebarTopFade, setShowSidebarTopFade] = useState(false)
  const [showSidebarBottomFade, setShowSidebarBottomFade] = useState(false)

  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const updateSidebarScrollFades = () => {
    const el = sidebarScrollRef.current
    if (!el) return

    const nextTop = el.scrollTop > 0
    const nextBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1

    setShowSidebarTopFade(nextTop)
    setShowSidebarBottomFade(nextBottom)
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

  useEffect(() => {
    void refreshHistory(false)

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

  const canSave = useMemo(() => {
    return settings.apiBaseUrl.trim().length > 0 && settings.apiModel.trim().length > 0
  }, [settings.apiBaseUrl, settings.apiModel])

  const isDirty = useMemo(() => {
    return (
      settings.apiBaseUrl !== lastSavedSettings.apiBaseUrl ||
      settings.apiKey !== lastSavedSettings.apiKey ||
      settings.apiModel !== lastSavedSettings.apiModel ||
      settings.apiTimeoutMs !== lastSavedSettings.apiTimeoutMs
    )
  }, [
    lastSavedSettings.apiBaseUrl,
    lastSavedSettings.apiKey,
    lastSavedSettings.apiModel,
    lastSavedSettings.apiTimeoutMs,
    settings.apiBaseUrl,
    settings.apiKey,
    settings.apiModel,
    settings.apiTimeoutMs
  ])

  const activeRecord: HistoryRecord | null = useMemo(() => {
    if (history.length === 0) return null
    if (activeRecordId == null) return null
    return history.find((r) => r.id === activeRecordId) || null
  }, [history, activeRecordId])

  const contextText = useMemo(() => (activeRecord ? getRecordText(activeRecord) : ''), [activeRecord])

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
                <div className="w-full rounded-2xl bg-white/85 border border-slate-200/70 shadow-[0_24px_48px_-24px_rgba(15,23,42,0.35)] backdrop-blur p-2">
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
                      onClick={() => setStatusMessage('Gallery not implemented yet')}
                    >
                      <ImageIcon className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-700">Gallery</span>
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
                    {settingsSection === 'general' ? 'General' : 'Providers'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {settingsSection === 'general'
                      ? 'Model and request behavior used by Detector.'
                      : 'OpenAI-compatible endpoint and API credentials.'}
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

              <div className="mt-6 flex-1 min-h-0 overflow-y-auto pr-2 space-y-6">
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
                  </>
                )}
              </div>

              <div className="mt-6 rounded-2xl bg-white/80 border border-slate-200/70 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-500 truncate">
                  {statusMessage
                    ? statusMessage
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
                </div>
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
                  <details defaultOpen className="group">
                    <summary className="app-nodrag list-none cursor-pointer select-none px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                        Screen context
                      </div>
                      <div className="text-xs text-slate-400">
                        {activeRecord ? formatCompactTime(activeRecord.timestamp) : 'None'}
                      </div>
                    </summary>
                    <div className="px-4 pb-4 whitespace-pre-wrap text-sm text-slate-700 max-h-56 overflow-y-auto">
                      {activeRecord
                        ? contextText
                        : 'No screen context selected. Choose a capture from the left sidebar to attach context.'}
                    </div>
                  </details>
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
