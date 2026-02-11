import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { HistoryRecord, ScreenshotAsset } from '@shared/types'

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

export function saveRecord(record: Omit<HistoryRecord, 'id'>): HistoryRecord {
  const records = readDb()
  const newRecord: HistoryRecord = {
    ...record,
    id: records.length > 0 ? Math.max(...records.map((r) => r.id || 0)) + 1 : 1
  }
  records.push(newRecord)
  writeDb(records)
  console.log('[Database] Saved record #' + newRecord.id, record.resultType)
  return newRecord
}

export function getHistory(): HistoryRecord[] {
  return readDb()
}

export function replaceHistory(records: HistoryRecord[]): void {
  writeDb(records)
}

export function updateRecordScreenshots(recordId: number, screenshots: ScreenshotAsset[]): HistoryRecord | null {
  if (!Number.isFinite(recordId) || recordId <= 0) return null
  const records = readDb()
  const index = records.findIndex((r) => r.id === recordId)
  if (index < 0) return null

  const updated: HistoryRecord = {
    ...records[index],
    screenshots: Array.isArray(screenshots) ? screenshots : [],
    screenshotPersistedAt: Date.now()
  }
  records[index] = updated
  writeDb(records)
  return updated
}
