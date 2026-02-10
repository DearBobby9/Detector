import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MemoryItem } from '@shared/types'

const DB_FILE = join(app.getPath('userData'), 'memory.json')

function readDb(): MemoryItem[] {
  if (!existsSync(DB_FILE)) return []
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeDb(records: MemoryItem[]): void {
  writeFileSync(DB_FILE, JSON.stringify(records, null, 2))
}

export function listMemory(): MemoryItem[] {
  return readDb()
}

export function saveMemory(item: Omit<MemoryItem, 'id'>): MemoryItem {
  const records = readDb()
  const newRecord: MemoryItem = {
    ...item,
    id: records.length > 0 ? Math.max(...records.map((r) => r.id || 0)) + 1 : 1
  }

  records.push(newRecord)
  writeDb(records)
  console.log('[MemoryDB] Saved item #' + newRecord.id, newRecord.kind, newRecord.title)
  return newRecord
}

