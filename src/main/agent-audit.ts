import { app } from 'electron'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { createHash } from 'crypto'
import { AgentAuditEntry, AgentAction } from '@shared/agent-types'

const LOG_FILE = join(app.getPath('userData'), 'agent-actions.jsonl')

export function computeInputDigest(action: AgentAction): string {
  const payload = JSON.stringify({
    type: action.type,
    title: action.title,
    dueAt: action.dueAt,
    listName: action.listName
  })
  return createHash('sha256').update(payload).digest('hex')
}

export function appendAuditEntry(entry: AgentAuditEntry): void {
  try {
    const redacted = { ...entry }

    if (
      typeof redacted.resultSummary === 'string' &&
      redacted.resultSummary.length > 64
    ) {
      redacted.resultSummary = redacted.resultSummary.slice(0, 64) + ' [redacted]'
    }

    const dir = dirname(LOG_FILE)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    appendFileSync(LOG_FILE, JSON.stringify(redacted) + '\n')
  } catch (err) {
    console.error('[AgentAudit]', err)
  }
}
