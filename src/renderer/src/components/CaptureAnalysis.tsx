import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BookmarkPlus, Check, ChevronDown, Copy, Mail, X } from 'lucide-react'
import type { CaptureAnalysisResult, MemoryCandidate } from '@shared/types'
import type { AgentAction } from '@shared/agent-types'
import { useAgentAction } from '@/hooks/useAgentAction'
import { ActionReviewCard } from './ActionReviewCard'

const ACTIONABLE_KINDS = new Set(['reminder', 'event', 'todo'])

interface Props {
  data: CaptureAnalysisResult
  onCopy: (text: string) => void
  onDetailViewChange?: (isOpen: boolean) => void
  detailCloseSignal?: number
  agentEnabled?: boolean
}

function formatCandidateForCopy(c: MemoryCandidate): string {
  const due = typeof c.dueAt === 'string' && c.dueAt.trim().length > 0 ? `\nDue: ${c.dueAt}` : ''
  const details = typeof c.details === 'string' && c.details.trim().length > 0 ? `\n${c.details}` : ''
  const source = typeof c.source === 'string' && c.source.trim().length > 0 ? `\nSource: ${c.source}` : ''
  return `[${c.kind}] ${c.title}${due}${details}${source}`.trim()
}

function parseLineList(details: string): string[] {
  return details
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

export function CaptureAnalysis({ data, onCopy, onDetailViewChange, detailCloseSignal, agentEnabled }: Props) {
  const agentAction = useAgentAction()

  const createAgentAction = (candidate: MemoryCandidate): void => {
    const action: AgentAction = {
      id: crypto.randomUUID(),
      type: 'create_reminder',
      title: candidate.title,
      notes: candidate.details || undefined,
      dueAt: typeof candidate.dueAt === 'string' ? candidate.dueAt : undefined,
      listName: 'Reminders'
    }
    agentAction.startFromAction(action)
  }
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(() => new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  const [chromeTabsExpanded, setChromeTabsExpanded] = useState(false)
  const [chromeTabsPopoverOpen, setChromeTabsPopoverOpen] = useState(false)
  const [expandedCandidateIndex, setExpandedCandidateIndex] = useState<number | null>(null)
  const lastDetailCloseSignalRef = useRef(detailCloseSignal ?? 0)

  const emailDetected = Boolean(data.email?.detected)
  const emailDraftText =
    emailDetected && typeof data.email.draft === 'string' ? data.email.draft.trim() : ''

  const memoryCandidates = Array.isArray(data.memoryCandidates) ? data.memoryCandidates : []

  const tabsUi = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const v = params.get('tabsui')
    return v === 'b' || v === 'c' ? v : 'a'
  }, [])

  const chromeTabsIndex = useMemo(() => {
    return memoryCandidates.findIndex((c) => {
      const source = typeof c.source === 'string' ? c.source.toLowerCase() : ''
      return c.kind === 'reading' && source.includes('chrome') && typeof c.details === 'string'
    })
  }, [memoryCandidates])

  const chromeTabsCandidate = chromeTabsIndex >= 0 ? memoryCandidates[chromeTabsIndex] : null
  const chromeTabTitles =
    chromeTabsCandidate && typeof chromeTabsCandidate.details === 'string'
      ? parseLineList(chromeTabsCandidate.details)
      : []

  const otherCandidates = useMemo(() => {
    return memoryCandidates
      .map((c, idx) => ({ c, idx }))
      .filter(({ idx }) => idx !== chromeTabsIndex)
  }, [memoryCandidates, chromeTabsIndex])

  const memoryHeader = useMemo(() => {
    if (memoryCandidates.length === 0) return 'No memory candidates detected'
    return `Memory candidates (${memoryCandidates.length})`
  }, [memoryCandidates.length])

  const expandedCandidate = useMemo(() => {
    if (expandedCandidateIndex == null) return null
    const candidate = memoryCandidates[expandedCandidateIndex]
    return candidate ?? null
  }, [expandedCandidateIndex, memoryCandidates])

  const expandedCandidateTabTitles = useMemo(() => {
    if (expandedCandidateIndex == null || expandedCandidateIndex !== chromeTabsIndex) return []
    if (!expandedCandidate || typeof expandedCandidate.details !== 'string') return []
    return parseLineList(expandedCandidate.details)
  }, [expandedCandidateIndex, chromeTabsIndex, expandedCandidate])

  const expandedCandidateDetails = useMemo(() => {
    if (!expandedCandidate || typeof expandedCandidate.details !== 'string') return ''
    return expandedCandidate.details.trim()
  }, [expandedCandidate])

  const expandedCandidateSource = useMemo(() => {
    if (!expandedCandidate || typeof expandedCandidate.source !== 'string') return ''
    return expandedCandidate.source.trim()
  }, [expandedCandidate])

  useEffect(() => {
    if (expandedCandidateIndex == null) return
    if (!memoryCandidates[expandedCandidateIndex]) {
      setExpandedCandidateIndex(null)
    }
  }, [expandedCandidateIndex, memoryCandidates])

  useEffect(() => {
    const nextSignal = detailCloseSignal ?? 0
    if (nextSignal === lastDetailCloseSignalRef.current) return
    lastDetailCloseSignalRef.current = nextSignal
    if (expandedCandidateIndex == null) return
    setExpandedCandidateIndex(null)
  }, [detailCloseSignal, expandedCandidateIndex])

  const saveCandidate = async (candidate: MemoryCandidate, index: number) => {
    if (savingIndex !== null) return
    if (savedIndexes.has(index)) return

    setSaveError(null)
    setSavingIndex(index)
    try {
      await window.electronAPI.saveMemory({
        kind: candidate.kind,
        title: candidate.title,
        details: candidate.details,
        dueAt: candidate.dueAt ?? null,
        source: candidate.source
      })
      setSavedIndexes((prev) => new Set(prev).add(index))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSaveError(message || 'Failed to save')
    } finally {
      setSavingIndex(null)
    }
  }

  const openCandidateDetail = (index: number) => {
    if (!Number.isFinite(index) || index < 0) return
    setExpandedCandidateIndex(index)
    onDetailViewChange?.(true)
  }

  const closeCandidateDetail = () => {
    setExpandedCandidateIndex(null)
    onDetailViewChange?.(false)
  }

  useEffect(() => {
    if (expandedCandidateIndex == null) return
    return () => {
      onDetailViewChange?.(false)
    }
  }, [expandedCandidateIndex, onDetailViewChange])

  const renderChromeTabsInline = () => {
    if (!chromeTabsCandidate) return null

    const isSaved = savedIndexes.has(chromeTabsIndex)
    const isSaving = savingIndex === chromeTabsIndex
    const count = chromeTabTitles.length
    const preview = chromeTabTitles.slice(0, 4)
    const remaining = Math.max(0, count - preview.length)

    return (
      <div
        className="rounded-lg bg-white/5 border border-white/10 p-3 cursor-pointer hover:bg-white/[0.07] transition-colors"
        onClick={() => openCandidateDetail(chromeTabsIndex)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openCandidateDetail(chromeTabsIndex)
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="min-w-0 text-sm font-medium truncate">{chromeTabsCandidate.title}</div>
              <div className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground tabular-nums">
                {count} tabs
              </div>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              [{chromeTabsCandidate.kind}]
              {typeof chromeTabsCandidate.source === 'string' && chromeTabsCandidate.source.trim()
                ? ` • ${chromeTabsCandidate.source}`
                : ''}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                setChromeTabsExpanded((v) => !v)
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={chromeTabsExpanded}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${chromeTabsExpanded ? 'rotate-180' : ''}`}
              />
              {chromeTabsExpanded ? 'Hide titles' : 'Show titles'}
            </button>

            {!chromeTabsExpanded && preview.length > 0 && (
              <div className="mt-2 space-y-1">
                {preview.map((t) => (
                  <div key={t} className="text-[11px] text-muted-foreground/90 truncate">
                    {t}
                  </div>
                ))}
                {remaining > 0 && (
                  <div className="text-[11px] text-muted-foreground/70">+{remaining} more…</div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopy(formatCandidateForCopy(chromeTabsCandidate))
              }}
              className="p-2 rounded-md hover:bg-white/10 transition-colors"
              aria-label="Copy"
              title="Copy"
            >
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void saveCandidate(chromeTabsCandidate, chromeTabsIndex)
              }}
              disabled={isSaved || isSaving}
              className="p-2 rounded-md hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              aria-label="Save"
              title={isSaved ? 'Saved' : 'Save'}
            >
              {isSaved ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <BookmarkPlus className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {chromeTabsExpanded && chromeTabTitles.length > 0 && (
          <div className="mt-2 rounded-md bg-white/5 border border-white/10 p-2 max-h-[180px] overflow-y-auto">
            <div className="space-y-1">
              {chromeTabTitles.map((t, i) => (
                <div key={`${i}-${t}`} className="text-[11px] text-muted-foreground/90 leading-relaxed">
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderChromeTabsCard = () => {
    if (!chromeTabsCandidate) return null

    const isSaved = savedIndexes.has(chromeTabsIndex)
    const isSaving = savingIndex === chromeTabsIndex
    const count = chromeTabTitles.length
    const preview = chromeTabTitles.slice(0, 6)
    const remaining = Math.max(0, count - preview.length)

    return (
      <div
        className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 cursor-pointer hover:bg-white/[0.07] transition-colors"
        onClick={() => openCandidateDetail(chromeTabsIndex)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openCandidateDetail(chromeTabsIndex)
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">Browser tabs</div>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="text-sm font-medium text-foreground truncate">Chrome reading list</div>
              <div className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground tabular-nums">
                {count} titles
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopy(chromeTabTitles.join('\n'))
              }}
              className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-muted-foreground hover:bg-white/10 transition-colors"
            >
              Copy
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void saveCandidate(chromeTabsCandidate, chromeTabsIndex)
              }}
              disabled={isSaved || isSaving}
              className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-muted-foreground hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="rounded-md bg-white/5 border border-white/10 p-2">
            <div className="space-y-1">
              {preview.map((t) => (
                <div key={t} className="text-[11px] text-muted-foreground/90 truncate">
                  {t}
                </div>
              ))}
              {remaining > 0 && <div className="text-[11px] text-muted-foreground/70">+{remaining} more…</div>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-start gap-3 relative">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">Capture</div>
          <div className="text-sm font-medium text-foreground truncate">{data.screenTitle}</div>
          {tabsUi === 'c' && chromeTabsCandidate && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setChromeTabsPopoverOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-muted-foreground hover:bg-white/10 transition-colors"
                aria-expanded={chromeTabsPopoverOpen}
              >
                Chrome tabs
                <span className="tabular-nums">{chromeTabTitles.length}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${chromeTabsPopoverOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
          )}
        </div>
        {tabsUi === 'c' && chromeTabsCandidate && chromeTabsPopoverOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 z-20">
            {renderChromeTabsInline()}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-4">
        {emailDetected && (
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-400" />
                <div className="text-xs font-medium text-muted-foreground">Email reply draft</div>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {typeof data.email.confidence === 'number'
                  ? `${Math.round(data.email.confidence * 100)}%`
                  : ''}
              </div>
            </div>

            {typeof data.email.originalSender === 'string' && data.email.originalSender.trim() && (
              <div className="text-xs text-muted-foreground">To: {data.email.originalSender}</div>
            )}

            {typeof data.email.subject === 'string' && data.email.subject.trim() && (
              <div className="text-sm font-medium">{data.email.subject}</div>
            )}

            <div className="bg-white/5 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap max-h-[180px] overflow-y-auto">
              {emailDraftText || 'Draft not available.'}
            </div>

            <button
              onClick={() => onCopy(emailDraftText)}
              disabled={!emailDraftText}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              <Copy className="h-4 w-4" />
              Copy Reply
            </button>
          </div>
        )}

        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="text-xs font-medium text-muted-foreground">{memoryHeader}</div>

          {memoryCandidates.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">
              Try capturing when the actionable info is visible (dates, tasks, delivery ETA, etc.).
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {tabsUi === 'b' && renderChromeTabsCard()}

              {tabsUi === 'a' &&
                memoryCandidates.map((c, idx) => {
                  if (idx === chromeTabsIndex && chromeTabsCandidate) {
                    return (
                      <div key={`chrome-tabs-${idx}`} className="rounded-lg">
                        {renderChromeTabsInline()}
                      </div>
                    )
                  }

                  const isSaved = savedIndexes.has(idx)
                  const isSaving = savingIndex === idx
                  return (
                    <div
                      key={`${c.kind}-${idx}-${c.title}`}
                      className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-white/[0.07] transition-colors"
                      onClick={() => openCandidateDetail(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openCandidateDetail(idx)
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium truncate">{c.title}</div>
                          <div className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {typeof c.dueAt === 'string' ? c.dueAt : ''}
                          </div>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          [{c.kind}]
                          {typeof c.details === 'string' && c.details.trim().length > 0
                            ? ` • ${c.details}`
                            : ''}
                        </div>
                        {typeof c.source === 'string' && c.source.trim().length > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground/80 truncate">
                            {c.source}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {agentEnabled && ACTIONABLE_KINDS.has(c.kind) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              createAgentAction(c)
                            }}
                            className="p-2 rounded-md hover:bg-white/10 transition-colors"
                            aria-label="Create Reminder"
                            title="Create Reminder"
                          >
                            <Bell className="h-4 w-4 text-blue-400" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onCopy(formatCandidateForCopy(c))
                          }}
                          className="p-2 rounded-md hover:bg-white/10 transition-colors"
                          aria-label="Copy"
                          title="Copy"
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void saveCandidate(c, idx)
                          }}
                          disabled={isSaved || isSaving}
                          className="p-2 rounded-md hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          aria-label="Save"
                          title={isSaved ? 'Saved' : 'Save'}
                        >
                          {isSaved ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <BookmarkPlus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}

              {(tabsUi === 'b' || tabsUi === 'c') &&
                otherCandidates.map(({ c, idx }) => {
                  const isSaved = savedIndexes.has(idx)
                  const isSaving = savingIndex === idx
                  return (
                    <div
                      key={`${c.kind}-${idx}-${c.title}`}
                      className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-white/[0.07] transition-colors"
                      onClick={() => openCandidateDetail(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openCandidateDetail(idx)
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium truncate">{c.title}</div>
                          <div className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {typeof c.dueAt === 'string' ? c.dueAt : ''}
                          </div>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          [{c.kind}]
                          {typeof c.details === 'string' && c.details.trim().length > 0
                            ? ` • ${c.details}`
                            : ''}
                        </div>
                        {typeof c.source === 'string' && c.source.trim().length > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground/80 truncate">
                            {c.source}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {agentEnabled && ACTIONABLE_KINDS.has(c.kind) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              createAgentAction(c)
                            }}
                            className="p-2 rounded-md hover:bg-white/10 transition-colors"
                            aria-label="Create Reminder"
                            title="Create Reminder"
                          >
                            <Bell className="h-4 w-4 text-blue-400" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onCopy(formatCandidateForCopy(c))
                          }}
                          className="p-2 rounded-md hover:bg-white/10 transition-colors"
                          aria-label="Copy"
                          title="Copy"
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void saveCandidate(c, idx)
                          }}
                          disabled={isSaved || isSaving}
                          className="p-2 rounded-md hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          aria-label="Save"
                          title={isSaved ? 'Saved' : 'Save'}
                        >
                          {isSaved ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <BookmarkPlus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Agent action review card (capture path) */}
          {agentAction.pendingAction && agentAction.pendingAction.action && (
            <ActionReviewCard
              key={agentAction.pendingAction.actionId}
              action={agentAction.pendingAction.action}
              requestId={agentAction.pendingAction.requestId}
              stage={agentAction.pendingAction.stage}
              validation={agentAction.pendingAction.validation}
              result={agentAction.pendingAction.result}
              error={agentAction.pendingAction.error}
              onConfirm={(edits) =>
                agentAction.confirm(
                  agentAction.pendingAction!.requestId,
                  agentAction.pendingAction!.actionId,
                  edits
                )
              }
              onCancel={() =>
                agentAction.cancel(
                  agentAction.pendingAction!.requestId,
                  agentAction.pendingAction!.actionId
                )
              }
            />
          )}
          {agentAction.result && agentAction.result.action && (
            <ActionReviewCard
              action={agentAction.result.action}
              requestId={agentAction.result.requestId}
              stage={agentAction.result.stage}
              result={agentAction.result.result}
              error={agentAction.result.error}
              onConfirm={() => {}}
              onCancel={() => {}}
            />
          )}

          {saveError && <div className="mt-2 text-xs text-destructive">{saveError}</div>}
        </div>
      </div>

      {expandedCandidate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-3">
          <button
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            aria-label="Close candidate detail"
            onClick={closeCandidateDetail}
          />
          <div className="relative w-full max-w-[900px] max-h-[74vh] rounded-2xl bg-[hsl(var(--card))]/95 border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Candidate detail • Split view
                </div>
                <div className="mt-0.5 text-[17px] leading-tight font-semibold text-foreground truncate">
                  {expandedCandidate.title}
                </div>
              </div>
              <button
                onClick={closeCandidateDetail}
                className="shrink-0 p-1.5 rounded-md hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-12 min-h-0 max-h-[calc(74vh-52px)]">
              <aside className="col-span-4 border-r border-white/10 bg-black/10 p-3 space-y-2.5 overflow-y-auto">
                <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Kind</div>
                  <div className="text-[13px] font-medium text-foreground">[{expandedCandidate.kind}]</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Due</div>
                  <div className="text-[13px] text-foreground/90">
                    {typeof expandedCandidate.dueAt === 'string' && expandedCandidate.dueAt.trim()
                      ? expandedCandidate.dueAt
                      : 'No due time'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Tab titles</div>
                  <div className="text-[13px] text-foreground/90">{expandedCandidateTabTitles.length}</div>
                </div>

                {expandedCandidateSource && (
                  <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Source</div>
                    <div className="mt-1.5 text-[12px] leading-5 whitespace-pre-wrap break-words text-foreground/85">
                      {expandedCandidateSource}
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-white/5 border border-white/10 p-2 space-y-2">
                  <button
                    onClick={() => onCopy(formatCandidateForCopy(expandedCandidate))}
                    className="w-full px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-[13px] text-muted-foreground hover:bg-white/10 transition-colors"
                  >
                    Copy
                  </button>
                  <button
                    onClick={closeCandidateDetail}
                    className="w-full px-3 py-1.5 rounded-md bg-white/10 border border-white/10 text-[13px] text-foreground hover:bg-white/15 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </aside>

              <section className="col-span-8 p-3 overflow-y-auto space-y-2.5">
                <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Details</div>
                  <div className="mt-1.5 text-[13px] leading-5 whitespace-pre-wrap break-words text-foreground">
                    {expandedCandidateDetails || 'No extra details.'}
                  </div>
                </div>

                {expandedCandidateTabTitles.length > 0 && (
                  <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                    <div className="px-2.5 py-1.5 border-b border-white/10 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Chrome tab titles
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {expandedCandidateTabTitles.map((title, index) => (
                        <div
                          key={`${index}-${title}`}
                          className="px-2.5 py-1.5 border-b border-white/5 last:border-b-0 text-[12px] leading-5 text-foreground/90 break-words"
                        >
                          <span className="text-muted-foreground tabular-nums mr-2">{index + 1}.</span>
                          {title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
