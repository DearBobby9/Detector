import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, Loader2, X, AlertTriangle } from 'lucide-react'
import type { AgentAction, AgentActionEdits, AgentExecutionResult, AgentStage, ValidationResult } from '@shared/agent-types'

interface ActionReviewCardProps {
  action: AgentAction
  requestId: string
  stage: AgentStage
  validation?: ValidationResult
  result?: AgentExecutionResult
  error?: { code: string; message: string }
  onConfirm: (edits?: AgentActionEdits) => void
  onCancel: () => void
}

function formatDueDate(dueAt?: string): string | null {
  if (!dueAt) return null
  try {
    const d = new Date(dueAt)
    if (isNaN(d.getTime())) return dueAt
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return dueAt
  }
}

/** Convert ISO 8601 string to datetime-local input value (YYYY-MM-DDTHH:MM) */
function isoToDatetimeLocal(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

/** Convert datetime-local value back to ISO 8601 with local timezone offset */
function datetimeLocalToIso(value: string): string | null {
  if (!value) return null
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    const offset = -d.getTimezoneOffset()
    const sign = offset >= 0 ? '+' : '-'
    const abs = Math.abs(offset)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${hh}:${mm}`
  } catch {
    return null
  }
}

/** Compare two date strings by epoch ms (handles different ISO representations) */
function datesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  try {
    return new Date(a).getTime() === new Date(b).getTime()
  } catch {
    return a === b
  }
}

const INPUT_CLASS =
  'w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-current placeholder:text-muted-foreground/40 focus:border-white/25 focus:outline-none transition-colors'

export function ActionReviewCard({
  action,
  requestId: _requestId,
  stage,
  validation,
  result,
  error,
  onConfirm,
  onCancel
}: ActionReviewCardProps) {
  const isConfirming = stage === 'CONFIRMATION_SHOWN'
  const isExecuting = stage === 'EXECUTING'
  const isSuccess = stage === 'EXECUTED'
  const isFailed = stage === 'FAILED'
  const isCancelled = stage === 'CANCELLED'
  const isTerminal = isSuccess || isFailed || isCancelled

  // Edit state — only used during CONFIRMATION_SHOWN
  const [editTitle, setEditTitle] = useState(action.title)
  const [editDueAt, setEditDueAt] = useState(isoToDatetimeLocal(action.dueAt))
  const [editListName, setEditListName] = useState(action.listName || 'Reminders')
  const [editNotes, setEditNotes] = useState(action.notes || '')

  const warnings = validation?.issues.filter((i) => i.severity === 'warning') ?? []
  const formattedDue = formatDueDate(action.dueAt)

  const handleConfirm = () => {
    const edits: AgentActionEdits = {}
    let hasEdits = false

    if (editTitle !== action.title) {
      edits.title = editTitle
      hasEdits = true
    }
    const newDueAt = datetimeLocalToIso(editDueAt)
    if (!datesEqual(newDueAt, action.dueAt)) {
      edits.dueAt = newDueAt
      hasEdits = true
    }
    const newListName = editListName.trim() || 'Reminders'
    if (newListName !== (action.listName || 'Reminders')) {
      edits.listName = newListName
      hasEdits = true
    }
    const newNotes = editNotes.trim()
    if (newNotes !== (action.notes || '')) {
      edits.notes = newNotes || undefined
      hasEdits = true
    }

    onConfirm(hasEdits ? edits : undefined)
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className={`
          mt-2 rounded-xl border p-3 shadow-sm transition-colors
          ${isSuccess ? 'border-emerald-500/30 bg-emerald-500/5' : ''}
          ${isFailed ? 'border-red-500/30 bg-red-500/5' : ''}
          ${isCancelled ? 'border-zinc-500/30 bg-zinc-500/5' : ''}
          ${!isTerminal ? 'border-blue-500/20 bg-blue-500/5' : ''}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <div
            className={`
            flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
            ${isSuccess ? 'bg-emerald-500/15' : ''}
            ${isFailed ? 'bg-red-500/15' : ''}
            ${!isTerminal && !isFailed ? 'bg-blue-500/15' : ''}
          `}
          >
            {isSuccess ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : isFailed ? (
              <X className="h-4 w-4 text-red-400" />
            ) : isExecuting ? (
              <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
            ) : (
              <Bell className="h-4 w-4 text-blue-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">
              {isSuccess
                ? `Created: ${result?.createdTitle || action.title}`
                : isFailed
                  ? 'Failed to create reminder'
                  : isCancelled
                    ? 'Cancelled'
                    : isExecuting
                      ? 'Creating reminder...'
                      : 'New Reminder'}
            </div>
          </div>
        </div>

        {/* Edit form — only during confirmation */}
        {isConfirming && (
          <div className="mt-3 space-y-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Reminder title"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-1">Due date</label>
                <input
                  type="datetime-local"
                  value={editDueAt}
                  onChange={(e) => setEditDueAt(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-1">List</label>
                <input
                  type="text"
                  value={editListName}
                  onChange={(e) => setEditListName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Reminders"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-1">Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Optional notes..."
              />
            </div>
          </div>
        )}

        {/* Read-only details — non-confirming states */}
        {!isConfirming && !isCancelled && (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {formattedDue && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">Due:</span>
                <span>{formattedDue}</span>
              </div>
            )}
            {action.listName && action.listName !== 'Reminders' && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">List:</span>
                <span>{action.listName}</span>
              </div>
            )}
            {isSuccess && result?.targetList && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">Saved to:</span>
                <span>{result.targetList}</span>
              </div>
            )}
            {action.notes && !isTerminal && (
              <div className="flex items-start gap-1.5">
                <span className="shrink-0 text-muted-foreground/60">Notes:</span>
                <span className="line-clamp-2">{action.notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Validation warnings */}
        {warnings.length > 0 && !isTerminal && (
          <div className="mt-2 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-amber-400/90">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {isFailed && error && (
          <div className="mt-2 text-xs text-red-400/90">{error.message}</div>
        )}

        {/* Actions */}
        {isConfirming && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!editTitle.trim()}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create Reminder
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
