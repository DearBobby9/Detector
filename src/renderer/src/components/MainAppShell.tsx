import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ChatMessage, HistoryRecord } from '@shared/types'
import {
  CheckCircle2,
  History,
  Loader2,
  Play,
  Send,
  Settings2,
  Sparkles,
  XCircle
} from 'lucide-react'

type AppTab = 'main' | 'settings'

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
  // Fallback for older history entries: derive from JSON
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
  // Prefer a meaningful title line.
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
  const [tab, setTab] = useState<AppTab>('main')
  const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isTestingApi, setIsTestingApi] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatting, setIsChatting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const loaded = await window.electronAPI.getSettings()
        if (active) setSettings(loaded)
      } catch (error) {
        if (active) setStatusMessage('Failed to load settings')
      } finally {
        if (active) setIsLoadingSettings(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const refreshHistory = async (selectLatest = false) => {
    setIsLoadingHistory(true)
    try {
      const records = await window.electronAPI.getHistory()
      setHistory(records)
      if (selectLatest && records.length > 0) {
        const latest = records[records.length - 1]
        setActiveRecordId(typeof latest.id === 'number' ? latest.id : null)
      }
    } catch {
      setStatusMessage('Failed to load history')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    void refreshHistory(true)

    const cleanups: Array<() => void> = []

    // Keep main window in sync when capture is triggered from hotkey/tray.
    cleanups.push(
      window.electronAPI.onShowLoading(() => {
        setIsCapturing(true)
      })
    )
    cleanups.push(
      window.electronAPI.onShowResult(() => {
        setIsCapturing(false)
        void refreshHistory(true)
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

  const canSave = useMemo(() => {
    return settings.apiBaseUrl.trim().length > 0 && settings.apiModel.trim().length > 0
  }, [settings.apiBaseUrl, settings.apiModel])

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
      setStatusMessage(
        res.ok ? `API test ok (${res.latencyMs}ms)` : `API test failed: ${res.message} (${res.latencyMs}ms)`
      )
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
      setStatusMessage('Failed to trigger capture')
    } finally {
      // Capture completion will be driven by main-process events (success/error)
    }
  }

  const activeRecord: HistoryRecord | null = useMemo(() => {
    if (history.length === 0) return null
    if (activeRecordId == null) return history[history.length - 1]
    return history.find((r) => r.id === activeRecordId) || history[history.length - 1]
  }, [history, activeRecordId])

  const contextText = activeRecord ? getRecordText(activeRecord) : ''

  const selectRecord = (record: HistoryRecord) => {
    setActiveRecordId(typeof record.id === 'number' ? record.id : null)
    setChatMessages([])
    setChatInput('')
    setStatusMessage(null)
  }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text) return
    if (!activeRecord) {
      setStatusMessage('No capture context yet. Capture your screen first.')
      return
    }

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

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100">
      <div className="mx-auto h-full max-w-6xl px-6 py-6 flex flex-col gap-6 min-h-0">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold">Detector</div>
              <div className="text-xs text-slate-400">Desktop AI assistant</div>
            </div>
          </div>
          <div className="text-xs text-slate-400">Hotkey: Cmd+Shift+.</div>
        </header>

        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <button
            onClick={() => setTab('main')}
            className={`px-3 py-1.5 rounded-md text-sm transition ${
              tab === 'main' ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            Main
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-md text-sm transition ${
              tab === 'settings' ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            Settings
          </button>
        </div>

        <div className="flex-1 min-h-0">
          {tab === 'main' && (
            <section className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4 min-h-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Chat</h2>
                  <p className="text-sm text-slate-300 mt-2">
                    Capture your screen, then chat with the saved context.
                  </p>
                </div>
                <button
                  onClick={triggerCapture}
                  disabled={isCapturing}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {isCapturing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Capturing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Capture Now
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-4">
                <aside className="md:col-span-4 rounded-xl border border-white/10 bg-slate-900/50 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <History className="h-4 w-4 text-slate-300" />
                      Captures
                    </div>
                    <button
                      onClick={() => refreshHistory(false)}
                      className="text-xs text-slate-300 hover:text-white transition"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {isLoadingHistory ? (
                      <div className="px-4 py-4 text-sm text-slate-300 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading...
                      </div>
                    ) : history.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-slate-300">
                        No captures yet. Click <span className="font-medium">Capture Now</span>.
                      </div>
                    ) : (
                      <div className="p-2 space-y-2">
                        {[...history]
                          .slice()
                          .reverse()
                          .map((record) => {
                            const isActive = activeRecord?.id != null && record.id === activeRecord.id
                            return (
                              <button
                                key={record.id ?? `${record.timestamp}`}
                                onClick={() => selectRecord(record)}
                                className={`w-full text-left rounded-lg px-3 py-2 border transition ${
                                  isActive
                                    ? 'bg-white/10 border-white/20'
                                    : 'bg-transparent border-white/10 hover:bg-white/5'
                                }`}
                              >
                                <div className="text-sm font-medium truncate">
                                  {getRecordTitle(record)}
                                </div>
                                <div className="text-xs text-slate-400 mt-1 truncate">
                                  {formatTime(record.timestamp)}
                                </div>
                              </button>
                            )
                          })}
                      </div>
                    )}
                  </div>
                </aside>

                <main className="md:col-span-8 rounded-xl border border-white/10 bg-slate-900/50 min-h-0 flex flex-col overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="text-xs text-slate-400">Context</div>
                    <div className="text-sm font-medium mt-1 truncate">
                      {activeRecord ? getRecordTitle(activeRecord) : 'No context'}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-b border-white/10 max-h-44 overflow-y-auto whitespace-pre-wrap text-sm text-slate-200">
                    {activeRecord ? contextText : 'Capture your screen to generate context.'}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {chatMessages.length === 0 && !isChatting ? (
                      <div className="text-sm text-slate-300">
                        Ask a follow-up question about the current context.
                      </div>
                    ) : (
                      chatMessages.map((m, idx) => (
                        <div
                          key={idx}
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                            m.role === 'user'
                              ? 'ml-auto bg-emerald-500 text-black'
                              : 'mr-auto bg-white/10 text-slate-100'
                          }`}
                        >
                          {m.content}
                        </div>
                      ))
                    )}

                    {isChatting && (
                      <div className="mr-auto max-w-[85%] rounded-xl px-3 py-2 text-sm bg-white/10 text-slate-100 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="p-3 border-t border-white/10">
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
                        placeholder={activeRecord ? 'Type a message…' : 'Capture first to chat…'}
                        disabled={!activeRecord || isChatting}
                        className="flex-1 rounded-lg bg-slate-950/80 border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-60"
                      />
                      <button
                        onClick={() => void sendMessage()}
                        disabled={!activeRecord || isChatting || chatInput.trim().length === 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </button>
                    </div>
                  </div>
                </main>
              </div>
            </section>
          )}

          {tab === 'settings' && (
            <section className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4 min-h-0">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-slate-300" />
                <h2 className="text-lg font-semibold">API Settings</h2>
              </div>

              {isLoadingSettings ? (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading settings...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-slate-300">API Base URL</span>
                    <input
                      value={settings.apiBaseUrl}
                      onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                      className="rounded-lg bg-slate-900/80 border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-slate-300">API Key</span>
                    <input
                      type="password"
                      value={settings.apiKey}
                      onChange={(e) => updateSetting('apiKey', e.target.value)}
                      className="rounded-lg bg-slate-900/80 border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
                      placeholder="sk-..."
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-slate-300">Model</span>
                      <input
                        value={settings.apiModel}
                        onChange={(e) => updateSetting('apiModel', e.target.value)}
                        className="rounded-lg bg-slate-900/80 border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
                        placeholder="gpt-4o"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-slate-300">Timeout (ms)</span>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={settings.apiTimeoutMs}
                        onChange={(e) => updateSetting('apiTimeoutMs', Number(e.target.value))}
                        className="rounded-lg bg-slate-900/80 border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={testApi}
                      disabled={isTestingApi}
                      className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/15 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {isTestingApi ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Test API
                        </>
                      )}
                    </button>

                    <button
                      onClick={saveSettings}
                      disabled={!canSave || isSavingSettings}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {isSavingSettings ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Save Settings
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {statusMessage && (
          <div className="text-sm text-slate-200 bg-white/10 border border-white/15 rounded-lg px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">{statusMessage}</div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-slate-300 hover:text-white transition"
                aria-label="Dismiss"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
