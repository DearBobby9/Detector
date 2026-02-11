import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppSettings } from '@shared/types'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_STORAGE_BYTES = 512 * 1024 * 1024
const MIN_MAX_STORAGE_BYTES = 50 * 1024 * 1024
const MAX_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024

function getDefaultSettings(): AppSettings {
  const timeoutFromEnv = Number(process.env.API_TIMEOUT_MS)
  const maxStorageFromEnv = Number(process.env.MAX_STORAGE_BYTES)

  return {
    apiBaseUrl: (process.env.API_BASE_URL || 'https://api.openai.com/v1').trim(),
    apiKey: (process.env.API_KEY || '').trim(),
    apiModel: (process.env.API_MODEL || 'gpt-4o').trim(),
    apiTimeoutMs:
      Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
        ? Math.floor(timeoutFromEnv)
        : DEFAULT_TIMEOUT_MS,
    maxStorageBytes:
      Number.isFinite(maxStorageFromEnv) &&
      maxStorageFromEnv >= MIN_MAX_STORAGE_BYTES &&
      maxStorageFromEnv <= MAX_MAX_STORAGE_BYTES
        ? Math.floor(maxStorageFromEnv)
        : DEFAULT_MAX_STORAGE_BYTES
  }
}

function readSettingsFile(): Partial<AppSettings> {
  if (!existsSync(SETTINGS_FILE)) return {}

  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Partial<AppSettings>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  const defaults = getDefaultSettings()

  const apiBaseUrl =
    typeof input.apiBaseUrl === 'string' && input.apiBaseUrl.trim().length > 0
      ? input.apiBaseUrl.trim()
      : defaults.apiBaseUrl
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : defaults.apiKey
  const apiModel =
    typeof input.apiModel === 'string' && input.apiModel.trim().length > 0
      ? input.apiModel.trim()
      : defaults.apiModel
  const timeoutCandidate =
    typeof input.apiTimeoutMs === 'number' ? input.apiTimeoutMs : Number(input.apiTimeoutMs)
  const apiTimeoutMs =
    Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
      ? Math.floor(timeoutCandidate)
      : defaults.apiTimeoutMs
  const storageCandidate =
    typeof input.maxStorageBytes === 'number'
      ? input.maxStorageBytes
      : Number((input as Partial<AppSettings> & { maxStorageBytes?: string }).maxStorageBytes)
  const maxStorageBytes =
    Number.isFinite(storageCandidate) && storageCandidate > 0
      ? Math.min(MAX_MAX_STORAGE_BYTES, Math.max(MIN_MAX_STORAGE_BYTES, Math.floor(storageCandidate)))
      : defaults.maxStorageBytes

  return {
    apiBaseUrl,
    apiKey,
    apiModel,
    apiTimeoutMs,
    maxStorageBytes
  }
}

export function getSettings(): AppSettings {
  return normalizeSettings(readSettingsFile())
}

export function saveSettings(input: Partial<AppSettings>): AppSettings {
  const merged = normalizeSettings({
    ...getSettings(),
    ...input
  })
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2))
  return merged
}
