import { app, clipboard, shell } from 'electron'
import { dirname, join } from 'path'
import {
  existsSync,
  readdirSync,
  statSync
} from 'fs'
import type { AppSettings, StorageCategory, StorageCategoryUsage, StorageEnforceResult, StorageUsageSummary } from '@shared/types'
import { getHistory, getHistoryDbPath, replaceHistory } from './database'
import { getMemoryDbPath, listMemory } from './memory-database'
import { getSettings, saveSettings } from './settings'
import { deleteCaptureAssetsForRecord } from './capture-storage'

const MIN_MAX_STORAGE_BYTES = 50 * 1024 * 1024
const MAX_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024

interface DirStats {
  bytes: number
  files: number
}

export function getStoragePaths(): { historyFile: string; memoryFile: string; screenshotsDir: string } {
  return {
    historyFile: getHistoryDbPath(),
    memoryFile: getMemoryDbPath(),
    screenshotsDir: join(app.getPath('userData'), 'captures')
  }
}

function safeFileSize(path: string): number {
  try {
    if (!existsSync(path)) return 0
    const stat = statSync(path)
    return stat.isFile() ? stat.size : 0
  } catch {
    return 0
  }
}

function walkDirectoryStats(path: string): DirStats {
  if (!existsSync(path)) return { bytes: 0, files: 0 }
  try {
    const stat = statSync(path)
    if (!stat.isDirectory()) {
      return stat.isFile() ? { bytes: stat.size, files: 1 } : { bytes: 0, files: 0 }
    }
  } catch {
    return { bytes: 0, files: 0 }
  }

  let bytes = 0
  let files = 0

  try {
    const entries = readdirSync(path, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(path, entry.name)
      if (entry.isDirectory()) {
        const nested = walkDirectoryStats(fullPath)
        bytes += nested.bytes
        files += nested.files
        continue
      }
      if (entry.isFile()) {
        bytes += safeFileSize(fullPath)
        files += 1
      }
    }
  } catch {
    // ignore unreadable path segments
  }

  return { bytes, files }
}

function clampStorageLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return getSettings().maxStorageBytes
  return Math.min(MAX_MAX_STORAGE_BYTES, Math.max(MIN_MAX_STORAGE_BYTES, Math.floor(value)))
}

function buildCategories(settings: AppSettings): StorageCategoryUsage[] {
  const paths = getStoragePaths()
  const historyRecords = getHistory()
  const memoryItems = listMemory()
  const screenshotStats = walkDirectoryStats(paths.screenshotsDir)

  return [
    {
      key: 'history',
      label: 'Capture history',
      bytes: safeFileSize(paths.historyFile),
      path: paths.historyFile,
      itemCount: historyRecords.length
    },
    {
      key: 'memory',
      label: 'Saved memory',
      bytes: safeFileSize(paths.memoryFile),
      path: paths.memoryFile,
      itemCount: memoryItems.length
    },
    {
      key: 'screenshots',
      label: 'Screenshots',
      bytes: screenshotStats.bytes,
      path: paths.screenshotsDir,
      itemCount: screenshotStats.files
    }
  ]
}

function getCategory(categories: StorageCategoryUsage[], key: StorageCategory): StorageCategoryUsage {
  return categories.find((c) => c.key === key) || { key, label: key, bytes: 0, path: '', itemCount: 0 }
}

export function getStorageUsage(): StorageUsageSummary {
  const settings = getSettings()
  const categories = buildCategories(settings)
  const usedBytes = categories.reduce((sum, c) => sum + c.bytes, 0)
  const maxBytes = settings.maxStorageBytes
  const percent = maxBytes > 0 ? (usedBytes / maxBytes) * 100 : 0
  const historyUsage = getCategory(categories, 'history')
  const screenshotUsage = getCategory(categories, 'screenshots')

  return {
    usedBytes,
    maxBytes,
    percent,
    isOverLimit: usedBytes > maxBytes,
    categories,
    prunableBytes: historyUsage.bytes + screenshotUsage.bytes
  }
}

export function setMaxStorageBytes(maxStorageBytes: number): AppSettings {
  return saveSettings({ maxStorageBytes: clampStorageLimit(maxStorageBytes) })
}

export function enforceStorageLimit(): StorageEnforceResult {
  const before = getStorageUsage()
  const maxBytes = before.maxBytes
  if (!before.isOverLimit) {
    return {
      deletedRecords: 0,
      deletedScreenshotFiles: 0,
      deletedScreenshotDirs: 0,
      reclaimedBytes: 0,
      usedBytes: before.usedBytes,
      maxBytes,
      remainingOverageBytes: 0,
      isOverLimit: false
    }
  }

  const records = [...getHistory()].sort((a, b) => a.timestamp - b.timestamp)
  let deletedRecords = 0
  let deletedScreenshotFiles = 0
  let deletedScreenshotDirs = 0
  let working = [...records]

  while (working.length > 0) {
    const usage = getStorageUsage()
    if (usage.usedBytes <= maxBytes) break

    const oldest = working.shift()
    if (!oldest) break
    const assetCleanup = deleteCaptureAssetsForRecord(oldest)
    deletedScreenshotFiles += assetCleanup.deletedFiles
    deletedScreenshotDirs += assetCleanup.deletedDirs
    deletedRecords += 1
    replaceHistory(working)
  }

  const after = getStorageUsage()
  const reclaimedBytes = Math.max(0, before.usedBytes - after.usedBytes)

  return {
    deletedRecords,
    deletedScreenshotFiles,
    deletedScreenshotDirs,
    reclaimedBytes,
    usedBytes: after.usedBytes,
    maxBytes: after.maxBytes,
    remainingOverageBytes: Math.max(0, after.usedBytes - after.maxBytes),
    isOverLimit: after.isOverLimit
  }
}

function resolveStoragePath(categoryOrPath: string): string {
  const trimmed = String(categoryOrPath || '').trim()
  const paths = getStoragePaths()
  if (trimmed === 'history') return paths.historyFile
  if (trimmed === 'memory') return paths.memoryFile
  if (trimmed === 'screenshots') return paths.screenshotsDir
  return trimmed
}

export async function revealStoragePath(categoryOrPath: string): Promise<{ ok: boolean; path: string }> {
  const path = resolveStoragePath(categoryOrPath)
  if (!path) return { ok: false, path: '' }

  try {
    if (existsSync(path)) {
      const stat = statSync(path)
      if (stat.isDirectory()) {
        await shell.openPath(path)
      } else {
        shell.showItemInFolder(path)
      }
    } else {
      const parent = dirname(path)
      await shell.openPath(parent)
    }
    return { ok: true, path }
  } catch {
    return { ok: false, path }
  }
}

export function copyStoragePath(categoryOrPath: string): { ok: boolean; path: string } {
  const path = resolveStoragePath(categoryOrPath)
  if (!path) return { ok: false, path: '' }
  clipboard.writeText(path)
  return { ok: true, path }
}
