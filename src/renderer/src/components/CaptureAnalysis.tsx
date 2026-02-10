import { useMemo, useState } from 'react'
import { BookmarkPlus, Check, Copy, Mail, X } from 'lucide-react'
import type { CaptureAnalysisResult, MemoryCandidate } from '@shared/types'

interface Props {
  data: CaptureAnalysisResult
  onCopy: (text: string) => void
  onDismiss: () => void
}

function formatCandidateForCopy(c: MemoryCandidate): string {
  const due = typeof c.dueAt === 'string' && c.dueAt.trim().length > 0 ? `\nDue: ${c.dueAt}` : ''
  const details = typeof c.details === 'string' && c.details.trim().length > 0 ? `\n${c.details}` : ''
  const source = typeof c.source === 'string' && c.source.trim().length > 0 ? `\nSource: ${c.source}` : ''
  return `[${c.kind}] ${c.title}${due}${details}${source}`.trim()
}

export function CaptureAnalysis({ data, onCopy, onDismiss }: Props) {
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(() => new Set())
  const [saveError, setSaveError] = useState<string | null>(null)

  const emailDetected = Boolean(data.email?.detected)
  const emailDraftText =
    emailDetected && typeof data.email.draft === 'string' ? data.email.draft.trim() : ''

  const memoryCandidates = Array.isArray(data.memoryCandidates) ? data.memoryCandidates : []

  const memoryHeader = useMemo(() => {
    if (memoryCandidates.length === 0) return 'No memory candidates detected'
    return `Memory candidates (${memoryCandidates.length})`
  }, [memoryCandidates.length])

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

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">Capture</div>
          <div className="text-sm font-medium text-foreground truncate">{data.screenTitle}</div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-md hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
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
              {memoryCandidates.map((c, idx) => {
                const isSaved = savedIndexes.has(idx)
                const isSaving = savingIndex === idx
                return (
                  <div
                    key={`${c.kind}-${idx}-${c.title}`}
                    className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-start justify-between gap-3"
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
                        {typeof c.details === 'string' && c.details.trim().length > 0 ? ` • ${c.details}` : ''}
                      </div>
                      {typeof c.source === 'string' && c.source.trim().length > 0 && (
                        <div className="mt-1 text-[11px] text-muted-foreground/80 truncate">
                          {c.source}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => onCopy(formatCandidateForCopy(c))}
                        className="p-2 rounded-md hover:bg-white/10 transition-colors"
                        aria-label="Copy"
                        title="Copy"
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => void saveCandidate(c, idx)}
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

          {saveError && <div className="mt-2 text-xs text-destructive">{saveError}</div>}
        </div>
      </div>
    </div>
  )
}
