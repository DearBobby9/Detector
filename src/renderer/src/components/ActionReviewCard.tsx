import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, Loader2, X, AlertTriangle } from 'lucide-react'
import type { AgentAction, AgentExecutionResult, AgentStage, ValidationResult } from '@shared/agent-types'

interface ActionReviewCardProps {
  action: AgentAction
  requestId: string
  stage: AgentStage
  validation?: ValidationResult
  result?: AgentExecutionResult
  error?: { code: string; message: string }
  onConfirm: () => void
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

  const warnings = validation?.issues.filter((i) => i.severity === 'warning') ?? []
  const formattedDue = formatDueDate(action.dueAt)

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
                      : action.title}
            </div>
          </div>
        </div>

        {/* Body — details */}
        {!isCancelled && (
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
              onClick={onConfirm}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
            >
              Create Reminder
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
