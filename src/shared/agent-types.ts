// ── Action types ──

export type AgentActionType = 'create_reminder'

export const ALLOWED_ACTION_TYPES: readonly AgentActionType[] = ['create_reminder'] as const

// ── Action plan (model output) ──

export interface AgentAction {
  id: string
  type: AgentActionType
  title: string
  notes?: string
  dueAt?: string // ISO 8601 with timezone
  listName?: string // default "Reminders"
}

export interface AgentActionPlan {
  version: '1'
  requestId: string
  actions: AgentAction[]
}

// ── Action edits (user modifications before confirm) ──

export interface AgentActionEdits {
  title?: string
  notes?: string
  dueAt?: string | null // null = clear the due date
  listName?: string
}

// ── Validation ──

export interface ValidationIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  actionId: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

// ── Pipeline stages ──

export type AgentStage =
  | 'PLANNED'
  | 'VALIDATED'
  | 'CONFIRMATION_SHOWN'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'

// ── Status push (main → renderer) ──

export interface AgentStatusPush {
  requestId: string
  actionId: string
  stage: AgentStage
  validation?: ValidationResult
  action?: AgentAction
  result?: AgentExecutionResult
  error?: { code: string; message: string }
}

// ── Execution result ──

export interface AgentExecutionResult {
  ok: boolean
  createdTitle?: string
  targetList?: string
  normalizedDueAt?: string
  errorCode?: string
  errorMessage?: string
}

// ── Audit log entry ──

export interface AgentAuditEntry {
  timestamp: string
  requestId: string
  actionId: string
  stage: AgentStage
  status: 'ok' | 'error'
  actionType: AgentActionType
  inputDigest: string
  resultSummary?: string
  errorCode?: string
  errorMessage?: string
  latencyMs: number
}

// ── Permission probe ──

export interface AgentPermissionProbe {
  reminders: 'granted' | 'denied' | 'unknown'
}

// ── Broadcast function type ──

export type BroadcastFn = (channel: string, ...args: unknown[]) => void
