import { app } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { getHistory } from './database'
import { listMemory } from './memory-database'

export interface ExportTimelineInput {
  fromDate?: string
  toDate?: string
}

export interface ExportTimelineResult {
  ok: boolean
  path?: string
  message?: string
  historyCount?: number
  memoryCount?: number
}

function parseDateStart(dateText: string | undefined): number | null {
  if (!dateText || !dateText.trim()) return null
  const candidate = new Date(`${dateText.trim()}T00:00:00`)
  if (Number.isNaN(candidate.getTime())) return null
  return candidate.getTime()
}

function parseDateEnd(dateText: string | undefined): number | null {
  if (!dateText || !dateText.trim()) return null
  const candidate = new Date(`${dateText.trim()}T23:59:59.999`)
  if (Number.isNaN(candidate.getTime())) return null
  return candidate.getTime()
}

function inRange(timestamp: number, from: number | null, to: number | null): boolean {
  if (!Number.isFinite(timestamp)) return false
  if (from != null && timestamp < from) return false
  if (to != null && timestamp > to) return false
  return true
}

function formatDateTime(value: number): string {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

export function exportTimelineMarkdown(input: ExportTimelineInput): ExportTimelineResult {
  const from = parseDateStart(input.fromDate)
  const to = parseDateEnd(input.toDate)
  if (from != null && to != null && from > to) {
    return { ok: false, message: 'Invalid date range: start date is after end date.' }
  }

  const history = getHistory()
    .filter((record) => inRange(record.timestamp, from, to))
    .sort((a, b) => a.timestamp - b.timestamp)
  const memory = listMemory()
    .filter((item) => inRange(item.createdAt, from, to))
    .sort((a, b) => a.createdAt - b.createdAt)

  const lines: string[] = []
  lines.push('# Detector Timeline Export')
  lines.push('')
  lines.push(`Generated: ${formatDateTime(Date.now())}`)
  lines.push(`Range: ${input.fromDate || 'Any'} → ${input.toDate || 'Any'}`)
  lines.push(`History items: ${history.length}`)
  lines.push(`Memory items: ${memory.length}`)
  lines.push('')
  lines.push('## Captures')
  lines.push('')

  if (history.length === 0) {
    lines.push('- No captures in selected range.')
  } else {
    for (const record of history) {
      lines.push(`### ${record.windowTitle || 'Capture'} (${formatDateTime(record.timestamp)})`)
      lines.push('')
      lines.push(`- Active app: ${record.activeApp || 'Unknown'}`)
      lines.push(`- Result type: ${record.resultType}`)
      if (typeof record.resultText === 'string' && record.resultText.trim().length > 0) {
        lines.push('- Result:')
        lines.push('```text')
        lines.push(record.resultText.trim())
        lines.push('```')
      } else {
        lines.push('- Result JSON:')
        lines.push('```json')
        lines.push(record.resultJson)
        lines.push('```')
      }
      lines.push('')
    }
  }

  lines.push('## Memory')
  lines.push('')
  if (memory.length === 0) {
    lines.push('- No saved memory in selected range.')
  } else {
    for (const item of memory) {
      lines.push(`- [${item.kind}] ${item.title} (${formatDateTime(item.createdAt)})`)
      if (item.details) lines.push(`  - Details: ${item.details}`)
      if (item.source) lines.push(`  - Source: ${item.source}`)
      if (item.dueAt) lines.push(`  - Due: ${item.dueAt}`)
    }
  }

  const filename = `detector-timeline-${new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')}.md`
  const path = join(app.getPath('downloads'), filename)
  writeFileSync(path, lines.join('\n'))

  return {
    ok: true,
    path,
    historyCount: history.length,
    memoryCount: memory.length
  }
}
