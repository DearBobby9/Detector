import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { HistoryRecord } from '@shared/types'

const DB_FILE = join(app.getPath('userData'), 'history.json')

function readDb(): HistoryRecord[] {
  if (!existsSync(DB_FILE)) return []
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeDb(records: HistoryRecord[]): void {
  writeFileSync(DB_FILE, JSON.stringify(records, null, 2))
}

export function getHistoryDbPath(): string {
  return DB_FILE
}

export function saveRecord(record: Omit<HistoryRecord, 'id'>): void {
  const records = readDb()
  const newRecord: HistoryRecord = {
    ...record,
    id: records.length > 0 ? Math.max(...records.map((r) => r.id || 0)) + 1 : 1
  }
  records.push(newRecord)

  // Keep only last 100 records
  const trimmed = records.slice(-100)
  writeDb(trimmed)
  console.log('[Database] Saved record #' + newRecord.id, record.resultType)
}

export function getHistory(): HistoryRecord[] {
  return readDb()
}

export function replaceHistory(records: HistoryRecord[]): void {
  writeDb(records)
}
