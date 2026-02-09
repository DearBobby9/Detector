import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ChatMessage, HistoryRecord } from '@shared/types'
import {
  ArrowUpCircle,
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

export function MainAppShell() {
  const [route, setRoute] = useState<Route>('home')

  const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS)
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

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const loaded = await window.electronAPI.getSettings()
        if (active) setSettings(loaded)
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
    if (!isMoreMenuOpen) return

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (!moreMenuRef.current) return
      if (moreMenuRef.current.contains(target)) return
      setIsMoreMenuOpen(false)
    }

    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [isMoreMenuOpen])

  const canSave = useMemo(() => {
    return settings.apiBaseUrl.trim().length > 0 && settings.apiModel.trim().length > 0
  }, [settings.apiBaseUrl, settings.apiModel])

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
      setStatusMessage('Settings saved')
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
    setStatusMessage(null)
    setRoute('chat')
  }

  const openSettings = () => {
    setIsMoreMenuOpen(false)
    setStatusMessage(null)
    setRoute('settings')
  }

  const selectRecord = (record: HistoryRecord) => {
    setIsMoreMenuOpen(false)
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
    setIsMoreMenuOpen(false)
    setRoute('home')
  }

  return (
    <div className="h-full w-full flex bg-[#f3f5f7] text-slate-800">
      <aside className="w-[320px] bg-[#fbfcfd] border-r border-slate-200/80 flex flex-col relative">
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
            onClick={() => setIsSidebarSearchOpen((v) => !v)}
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
        </div>

        {isSidebarSearchOpen && (
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

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {isLoadingHistory ? (
            <div className="px-3 py-3 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">
              No captures yet.
            </div>
          ) : (
            <div className="space-y-1">
              {[...filteredHistory]
                .slice()
                .reverse()
                .map((record) => {
                  const isActive = activeRecord?.id != null && record.id === activeRecord.id && route === 'chat'
                  return (
                    <button
                      key={record.id ?? `${record.timestamp}`}
                      onClick={() => selectRecord(record)}
                      className={`app-nodrag w-full text-left rounded-xl px-3 py-2 transition ${
                        isActive ? 'bg-slate-200/60' : 'hover:bg-slate-200/40'
                      }`}
                    >
                      <div className="text-[13px] font-medium text-slate-700 truncate">
                        {getRecordTitle(record)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {formatTime(record.timestamp)}
                      </div>
                    </button>
                  )
                })}
            </div>
          )}
        </div>

        <div className="p-3 flex items-center justify-between gap-2">
          <div className="relative" ref={moreMenuRef}>
            <button
              className="app-nodrag h-9 w-9 rounded-xl bg-white border border-slate-200/80 shadow-sm text-slate-600 hover:bg-slate-50 flex items-center justify-center transition"
              onClick={() => setIsMoreMenuOpen((v) => !v)}
              aria-label="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute left-0 bottom-12 w-[260px] rounded-2xl bg-white border border-slate-200/80 shadow-xl p-2">
                <button
                  className="app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 transition text-sm"
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  Manage Prompt Apps
                </button>
                <button
                  className="app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 transition text-sm"
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <ImageIcon className="h-4 w-4 text-slate-500" />
                  Gallery
                </button>
                <button
                  className="app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 transition text-sm"
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <Code2 className="h-4 w-4 text-slate-500" />
                  Live Coding
                </button>
                <button
                  className="app-nodrag w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 transition text-sm"
                  onClick={openSettings}
                >
                  <SettingsIcon className="h-4 w-4 text-slate-500" />
                  Settings
                </button>
              </div>
            )}
          </div>

          <button
            className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition"
            onClick={() => setStatusMessage('Update not configured yet')}
          >
            <ArrowUpCircle className="h-4 w-4 text-slate-400" />
            Update
          </button>
        </div>
      </aside>

      <section className="flex-1 min-h-0 flex flex-col">
        {route === 'home' && (
          <div className="flex-1 min-h-0 flex items-center justify-center px-10 py-16">
            <div className="w-full max-w-[520px] flex flex-col items-center text-center gap-5">
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
                  onClick={openSettings}
                >
                  Configure Provider
                </button>
                <button
                  className="app-nodrag flex-1 h-11 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:bg-slate-50 text-sm font-medium transition"
                  onClick={openSettings}
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
          <div className="flex-1 min-h-0 overflow-y-auto px-10 py-14">
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold text-slate-800">Settings</div>
                  <div className="text-sm text-slate-500 mt-1">Configure OpenAI-compatible API</div>
                </div>
                <button
                  className="app-nodrag h-9 w-9 rounded-xl hover:bg-slate-200/40 text-slate-500 flex items-center justify-center transition"
                  onClick={showHome}
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
                {isLoadingSettings ? (
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading settings...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-slate-500">API Base URL</span>
                      <input
                        value={settings.apiBaseUrl}
                        onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                        className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                        placeholder="https://api.openai.com/v1"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-slate-500">API Key</span>
                      <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => updateSetting('apiKey', e.target.value)}
                        className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                        placeholder="sk-..."
                      />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs text-slate-500">Model</span>
                        <input
                          value={settings.apiModel}
                          onChange={(e) => updateSetting('apiModel', e.target.value)}
                          className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                          placeholder="gpt-4o"
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs text-slate-500">Timeout (ms)</span>
                        <input
                          type="number"
                          min={1000}
                          step={1000}
                          value={settings.apiTimeoutMs}
                          onChange={(e) => updateSetting('apiTimeoutMs', Number(e.target.value))}
                          className="app-nodrag rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={testApi}
                        disabled={isTestingApi}
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
                        disabled={!canSave || isSavingSettings}
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
                    onClick={triggerCapture}
                    disabled={isCapturing}
                    className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {isCapturing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Capturing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Capture
                      </>
                    )}
                  </button>
                  <button
                    onClick={openSettings}
                    className="app-nodrag inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 shadow-sm px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <SettingsIcon className="h-4 w-4" />
                    Settings
                  </button>
                </div>
              </div>

              {activeRecord && (
                <details className="mt-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm p-4">
                  <summary className="cursor-pointer select-none text-sm font-medium text-slate-700">
                    Screen context
                  </summary>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700 max-h-56 overflow-y-auto">
                    {contextText}
                  </div>
                </details>
              )}

              <div className="mt-5 flex-1 min-h-0 rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                  {chatMessages.length === 0 && !isChatting ? (
                    <div className="text-sm text-slate-500">
                      Ask a question. If you select a capture from the left sidebar, this chat will use that saved context.
                    </div>
                  ) : (
                    chatMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
                          m.role === 'user'
                            ? 'ml-auto bg-[#6e8f95] text-white'
                            : 'mr-auto bg-slate-50 border border-slate-200/80 text-slate-800'
                        }`}
                      >
                        {m.content}
                      </div>
                    ))
                  )}

                  {isChatting && (
                    <div className="mr-auto max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200/80 text-slate-800 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="border-t border-slate-200/80 p-3">
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
                      className="app-nodrag flex-1 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6e8f95]/30 disabled:opacity-60"
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

        {statusMessage && (
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

