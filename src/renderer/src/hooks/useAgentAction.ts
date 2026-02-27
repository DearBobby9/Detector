import { useState, useEffect, useCallback, useRef } from 'react'
import type { AgentAction, AgentActionPlan, AgentStatusPush } from '@shared/agent-types'

const TERMINAL_STAGES = new Set(['EXECUTED', 'FAILED', 'CANCELLED'])
const RESULT_DISMISS_MS = 8000

export function useAgentAction() {
  const [pendingAction, setPendingAction] = useState<AgentStatusPush | null>(null)
  const [result, setResult] = useState<AgentStatusPush | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.onAgentStatusPush((status: AgentStatusPush) => {
      console.log('[useAgentAction] Status push:', status.stage, status.actionId)

      if (status.stage === 'CONFIRMATION_SHOWN') {
        setPendingAction(status)
      } else if (status.stage === 'EXECUTING') {
        setPendingAction((prev) =>
          prev && prev.actionId === status.actionId ? { ...prev, stage: 'EXECUTING' } : prev
        )
      } else if (TERMINAL_STAGES.has(status.stage)) {
        setResult(status)
        setPendingAction(null)
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = setTimeout(() => setResult(null), RESULT_DISMISS_MS)
      }
    })
    return unsub
  }, [])

  const confirm = useCallback((requestId: string, actionId: string) => {
    window.electronAPI.agentConfirm({ requestId, actionId, confirmed: true })
  }, [])

  const cancel = useCallback((requestId: string, actionId: string) => {
    window.electronAPI.agentConfirm({ requestId, actionId, confirmed: false })
  }, [])

  const startFromAction = useCallback((action: AgentAction) => {
    const plan: AgentActionPlan = {
      version: '1',
      requestId: crypto.randomUUID(),
      actions: [action]
    }
    window.electronAPI.agentStart(plan)
  }, [])

  return { pendingAction, result, confirm, cancel, startFromAction }
}
