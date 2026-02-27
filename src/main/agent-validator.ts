import { execFile } from 'child_process'
import type {
  AgentAction,
  ValidationResult,
  ValidationIssue,
  AgentPermissionProbe
} from '@shared/agent-types'
import { ALLOWED_ACTION_TYPES } from '@shared/agent-types'

// ── Helpers ──

const TIMEZONE_OFFSET_RE = /[+-]\d{2}:\d{2}$|Z$/

function pushIssue(
  issues: ValidationIssue[],
  actionId: string,
  code: string,
  severity: 'error' | 'warning',
  message: string
): void {
  issues.push({ code, severity, message, actionId })
}

// ── Action validation ──

export function validateAction(action: AgentAction): ValidationResult {
  const issues: ValidationIssue[] = []
  const actionId = action.id || ''

  // Schema: id must be non-empty string
  if (typeof action.id !== 'string' || action.id.length === 0) {
    pushIssue(issues, actionId, 'MISSING_ID', 'error', 'Action id must be a non-empty string')
  }

  // Schema: type must be in ALLOWED_ACTION_TYPES
  if (!ALLOWED_ACTION_TYPES.includes(action.type)) {
    pushIssue(
      issues,
      actionId,
      'UNKNOWN_ACTION_TYPE',
      'error',
      `Action type "${action.type}" is not allowed`
    )
  }

  // Schema: title must exist, trimmed length 1-200
  const trimmedTitle = typeof action.title === 'string' ? action.title.trim() : ''
  if (trimmedTitle.length < 1 || trimmedTitle.length > 200) {
    pushIssue(
      issues,
      actionId,
      'INVALID_TITLE',
      'error',
      'Title must be between 1 and 200 characters after trimming'
    )
  }

  // Schema + Policy: dueAt checks
  if (action.dueAt !== undefined) {
    const parsed = new Date(action.dueAt)
    const isValidDate = !isNaN(parsed.getTime())
    const hasTimezone = TIMEZONE_OFFSET_RE.test(action.dueAt)

    if (!isValidDate || !hasTimezone) {
      pushIssue(
        issues,
        actionId,
        'INVALID_DUE_AT',
        'error',
        'dueAt must be a valid ISO 8601 date string with a timezone offset'
      )
    } else {
      // Policy: must not be more than 365 days in the future
      const now = Date.now()
      const msIn365Days = 365 * 24 * 60 * 60 * 1000
      if (parsed.getTime() - now > msIn365Days) {
        pushIssue(
          issues,
          actionId,
          'DUE_AT_TOO_FAR',
          'warning',
          'dueAt is more than 365 days in the future'
        )
      }

      // Policy: must not be more than 24 hours in the past
      const msIn24Hours = 24 * 60 * 60 * 1000
      if (now - parsed.getTime() > msIn24Hours) {
        pushIssue(
          issues,
          actionId,
          'DUE_AT_STALE',
          'warning',
          'dueAt is more than 24 hours in the past'
        )
      }
    }
  }

  // Schema: listName if present, trimmed length 1-64
  if (action.listName !== undefined) {
    const trimmedListName = typeof action.listName === 'string' ? action.listName.trim() : ''
    if (trimmedListName.length < 1 || trimmedListName.length > 64) {
      pushIssue(
        issues,
        actionId,
        'INVALID_LIST_NAME',
        'error',
        'listName must be between 1 and 64 characters after trimming'
      )
    }
  }

  return {
    ok: issues.filter((i) => i.severity === 'error').length === 0,
    issues
  }
}

// ── Permission probe ──

export function probeReminderPermission(): Promise<AgentPermissionProbe> {
  return new Promise((resolve) => {
    try {
      execFile(
        'osascript',
        ['-l', 'JavaScript', '-e', "Application('Reminders').defaultAccount.name()"],
        { timeout: 5000 },
        (error) => {
          if (error) {
            // Distinguish timeout from permission denial
            const isTimeout =
              error.killed || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
            if (isTimeout) {
              console.log('[AgentValidator] Reminders permission probe timed out')
              resolve({ reminders: 'unknown' })
            } else {
              console.log(
                '[AgentValidator] Reminders permission denied:',
                error.message
              )
              resolve({ reminders: 'denied' })
            }
            return
          }

          console.log('[AgentValidator] Reminders permission granted')
          resolve({ reminders: 'granted' })
        }
      )
    } catch (err) {
      console.error('[AgentValidator] Failed to probe Reminders permission:', err)
      resolve({ reminders: 'unknown' })
    }
  })
}
