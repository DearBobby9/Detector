import type { AgentAction } from '@shared/agent-types'
import { ALLOWED_ACTION_TYPES } from '@shared/agent-types'

const ACTION_TAG_RE = /<action>([\s\S]*?)<\/action>/g

export function parseActionTags(text: string): { cleanText: string; actions: AgentAction[] } {
  const actions: AgentAction[] = []

  const cleanText = text.replace(ACTION_TAG_RE, (_match, json: string) => {
    try {
      const parsed = JSON.parse(json.trim()) as Partial<AgentAction>
      if (
        parsed &&
        typeof parsed.type === 'string' &&
        (ALLOWED_ACTION_TYPES as readonly string[]).includes(parsed.type) &&
        typeof parsed.title === 'string'
      ) {
        actions.push({
          id: crypto.randomUUID(),
          type: parsed.type as AgentAction['type'],
          title: parsed.title,
          notes: parsed.notes,
          dueAt: parsed.dueAt,
          listName: parsed.listName
        })
      }
    } catch {
      // Invalid JSON inside action tag — skip silently
    }
    return ''
  })

  return { cleanText: cleanText.trim(), actions }
}
