import { IPC } from '@shared/ipc-channels'
import type {
  AgentAction,
  AgentActionPlan,
  AgentStage,
  AgentStatusPush,
  BroadcastFn
} from '@shared/agent-types'
import { validateAction } from './agent-validator'
import { executeCreateReminder } from './agent-adapter-reminder'
import { appendAuditEntry, computeInputDigest } from './agent-audit'

// ── State ──

interface PipelineEntry {
  plan: AgentActionPlan
  stages: Map<string, AgentStage>
  startedAt: number
}

const activePipelines = new Map<string, PipelineEntry>()

let broadcast: BroadcastFn = () => {
  console.warn('[AgentPipeline] Broadcast not set yet')
}

const CLEANUP_DELAY_MS = 5 * 60 * 1000

// ── Public API ──

export function setAgentBroadcast(fn: BroadcastFn): void {
  broadcast = fn
}

export function startAgentPipeline(plan: AgentActionPlan): void {
  console.log('[AgentPipeline] Starting pipeline:', plan.requestId, 'actions:', plan.actions.length)

  const entry: PipelineEntry = {
    plan,
    stages: new Map(),
    startedAt: Date.now()
  }
  activePipelines.set(plan.requestId, entry)

  for (const action of plan.actions) {
    processAction(plan.requestId, action, entry)
  }
}

export function confirmAgentAction(requestId: string, actionId: string, confirmed: boolean): void {
  const entry = activePipelines.get(requestId)
  if (!entry) {
    console.warn('[AgentPipeline] No active pipeline for requestId:', requestId)
    return
  }

  const currentStage = entry.stages.get(actionId)
  if (currentStage !== 'CONFIRMATION_SHOWN') {
    console.warn('[AgentPipeline] Action not awaiting confirmation:', actionId, 'stage:', currentStage)
    return
  }

  const action = entry.plan.actions.find((a) => a.id === actionId)
  if (!action) {
    console.warn('[AgentPipeline] Action not found:', actionId)
    return
  }

  if (!confirmed) {
    transition(entry, action, requestId, 'CANCELLED')
    scheduleCleanup(requestId)
    return
  }

  transition(entry, action, requestId, 'CONFIRMED')
  void executeAction(entry, action, requestId)
}

// ── Internal ──

function processAction(requestId: string, action: AgentAction, entry: PipelineEntry): void {
  const stageStart = Date.now()

  // PLANNED
  transition(entry, action, requestId, 'PLANNED')

  // VALIDATE
  const validation = validateAction(action)
  audit(requestId, action, 'VALIDATED', validation.ok ? 'ok' : 'error', stageStart, {
    resultSummary: validation.ok ? 'Validation passed' : `${validation.issues.length} issue(s)`
  })

  if (!validation.ok) {
    const errorIssues = validation.issues.filter((i) => i.severity === 'error')
    pushStatus(requestId, action, 'FAILED', {
      validation,
      error: {
        code: 'VALIDATION_FAILED',
        message: errorIssues.map((i) => i.message).join('; ')
      }
    })
    entry.stages.set(action.id, 'FAILED')
    scheduleCleanup(requestId)
    return
  }

  // CONFIRMATION_SHOWN
  transition(entry, action, requestId, 'CONFIRMATION_SHOWN', { validation })
}

async function executeAction(
  entry: PipelineEntry,
  action: AgentAction,
  requestId: string
): Promise<void> {
  const execStart = Date.now()
  transition(entry, action, requestId, 'EXECUTING')

  try {
    const result = await executeCreateReminder(action)

    if (result.ok) {
      audit(requestId, action, 'EXECUTED', 'ok', execStart, {
        resultSummary: `Created: ${result.createdTitle} in ${result.targetList}`
      })
      pushStatus(requestId, action, 'EXECUTED', { result })
      entry.stages.set(action.id, 'EXECUTED')
    } else {
      audit(requestId, action, 'FAILED', 'error', execStart, {
        errorCode: result.errorCode,
        errorMessage: result.errorMessage
      })
      pushStatus(requestId, action, 'FAILED', {
        result,
        error: {
          code: result.errorCode || 'EXECUTION_FAILED',
          message: result.errorMessage || 'Reminder creation failed'
        }
      })
      entry.stages.set(action.id, 'FAILED')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    audit(requestId, action, 'FAILED', 'error', execStart, {
      errorCode: 'UNEXPECTED_ERROR',
      errorMessage: message.slice(0, 200)
    })
    pushStatus(requestId, action, 'FAILED', {
      error: { code: 'UNEXPECTED_ERROR', message: message.slice(0, 200) }
    })
    entry.stages.set(action.id, 'FAILED')
  }

  scheduleCleanup(requestId)
}

function transition(
  entry: PipelineEntry,
  action: AgentAction,
  requestId: string,
  stage: AgentStage,
  extra?: Partial<AgentStatusPush>
): void {
  const now = Date.now()
  entry.stages.set(action.id, stage)
  audit(requestId, action, stage, 'ok', now)
  pushStatus(requestId, action, stage, extra)
}

function pushStatus(
  requestId: string,
  action: AgentAction,
  stage: AgentStage,
  extra?: Partial<AgentStatusPush>
): void {
  const status: AgentStatusPush = {
    requestId,
    actionId: action.id,
    stage,
    action,
    ...extra
  }
  broadcast(IPC.AGENT_STATUS_PUSH, status)
}

function audit(
  requestId: string,
  action: AgentAction,
  stage: AgentStage,
  status: 'ok' | 'error',
  refTime: number,
  extra?: { resultSummary?: string; errorCode?: string; errorMessage?: string }
): void {
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    requestId,
    actionId: action.id,
    stage,
    status,
    actionType: action.type,
    inputDigest: computeInputDigest(action),
    latencyMs: Date.now() - refTime,
    ...extra
  })
}

function scheduleCleanup(requestId: string): void {
  setTimeout(() => {
    activePipelines.delete(requestId)
  }, CLEANUP_DELAY_MS)
}
