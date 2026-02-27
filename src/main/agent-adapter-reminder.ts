import { execFile } from 'child_process'
import type { AgentAction, AgentExecutionResult } from '@shared/agent-types'

function buildReminderJxa(action: AgentAction): string {
  const params = {
    title: action.title,
    notes: action.notes || '',
    dueAt: action.dueAt || null,
    listName: action.listName || 'Reminders'
  }
  return `
var PARAMS = ${JSON.stringify(params)};
var app = Application('Reminders');
app.includeStandardAdditions = true;
var lists = app.lists.whose({name: PARAMS.listName});
var targetList = lists.length > 0 ? lists[0] : app.defaultList();
var props = {name: PARAMS.title, body: PARAMS.notes};
if (PARAMS.dueAt) { props.dueDate = new Date(PARAMS.dueAt); }
var reminder = app.Reminder(props);
targetList.reminders.push(reminder);
JSON.stringify({ok: true, title: reminder.name(), list: targetList.name()});
`.trim()
}

export async function executeCreateReminder(action: AgentAction): Promise<AgentExecutionResult> {
  const script = buildReminderJxa(action)

  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', '-e', script],
      { timeout: 15000 },
      (error, stdout) => {
        if (error) {
          const message = (error.message || 'Unknown JXA error').slice(0, 200)
          console.error('[AgentAdapter] Failed to create reminder:', message)
          resolve({
            ok: false,
            errorCode: 'JXA_ERROR',
            errorMessage: message
          })
          return
        }

        try {
          const parsed = JSON.parse(String(stdout || '').trim()) as {
            ok: boolean
            title: string
            list: string
          }
          console.log('[AgentAdapter] Reminder created:', {
            title: parsed.title,
            list: parsed.list,
            dueAt: action.dueAt || null
          })
          resolve({
            ok: true,
            createdTitle: parsed.title,
            targetList: parsed.list,
            normalizedDueAt: action.dueAt
          })
        } catch (parseError) {
          const message = (parseError instanceof Error ? parseError.message : 'Failed to parse JXA output').slice(
            0,
            200
          )
          console.error('[AgentAdapter] Failed to parse reminder result:', message)
          resolve({
            ok: false,
            errorCode: 'JXA_ERROR',
            errorMessage: message
          })
        }
      }
    )
  })
}
