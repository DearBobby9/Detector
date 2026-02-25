import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { AppSettings, ChatProvider, ThemeMode } from '@shared/types'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')
const LEGACY_SETTINGS_FILES = Array.from(
  new Set([
    join(app.getPath('appData'), 'Detector', 'settings.json'),
    join(app.getPath('appData'), 'detector', 'settings.json')
  ])
).filter((candidate) => candidate !== SETTINGS_FILE)
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_CODEX_CLI_TIMEOUT_MS = 120000
const DEFAULT_MAX_STORAGE_BYTES = 512 * 1024 * 1024
const MIN_MAX_STORAGE_BYTES = 50 * 1024 * 1024
const MAX_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024
const DEFAULT_THEME_MODE: ThemeMode = 'light'
const DEFAULT_CHAT_PROVIDER: ChatProvider = 'api'
const DEFAULT_CODEX_CLI_PATH = 'codex'
const DEFAULT_SHOW_DOCK_ICON = false

function normalizeChatProvider(raw: unknown): ChatProvider {
  return raw === 'codex-cli' ? 'codex-cli' : 'api'
}

function normalizeThemeMode(raw: unknown): ThemeMode {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return DEFAULT_THEME_MODE
}

function normalizeBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

function normalizeOptionalTemplate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value.length > 0 ? value : undefined
}

function getDefaultSettings(): AppSettings {
  const timeoutFromEnv = Number(process.env.API_TIMEOUT_MS)
  const codexCliTimeoutFromEnv = Number(process.env.CODEX_CLI_TIMEOUT_MS)
  const maxStorageFromEnv = Number(process.env.MAX_STORAGE_BYTES)
  const themeModeFromEnv = normalizeThemeMode((process.env.THEME_MODE || '').trim().toLowerCase())
  const chatProviderFromEnv = normalizeChatProvider((process.env.CHAT_PROVIDER || '').trim().toLowerCase())

  return {
    apiBaseUrl: (process.env.API_BASE_URL || 'https://api.openai.com/v1').trim(),
    apiKey: (process.env.API_KEY || '').trim(),
    apiModel: (process.env.API_MODEL || 'gpt-4o').trim(),
    apiTimeoutMs:
      Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
        ? Math.floor(timeoutFromEnv)
        : DEFAULT_TIMEOUT_MS,
    chatProvider: chatProviderFromEnv,
    codexCliPath: (process.env.CODEX_CLI_PATH || DEFAULT_CODEX_CLI_PATH).trim() || DEFAULT_CODEX_CLI_PATH,
    codexCliModel: (process.env.CODEX_CLI_MODEL || '').trim(),
    codexCliTimeoutMs:
      Number.isFinite(codexCliTimeoutFromEnv) && codexCliTimeoutFromEnv > 0
        ? Math.floor(codexCliTimeoutFromEnv)
        : DEFAULT_CODEX_CLI_TIMEOUT_MS,
    maxStorageBytes:
      Number.isFinite(maxStorageFromEnv) &&
      maxStorageFromEnv >= MIN_MAX_STORAGE_BYTES &&
      maxStorageFromEnv <= MAX_MAX_STORAGE_BYTES
        ? Math.floor(maxStorageFromEnv)
        : DEFAULT_MAX_STORAGE_BYTES,
    themeMode: themeModeFromEnv,
    launchAtLogin: false,
    showDockIcon: DEFAULT_SHOW_DOCK_ICON,
    shareCrashReports: false,
    shareAnonymousUsage: false,
    showTimelineIcons: false,
    outputLanguageOverride: '',
    capturePromptTemplate: undefined,
    chatPromptTemplate: undefined
  }
}

function readSettingsFileAt(filePath: string): Partial<AppSettings> | null {
  if (!existsSync(filePath)) return null

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<AppSettings>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function ensurePrimarySettingsFile(): void {
  if (existsSync(SETTINGS_FILE)) return

  for (const legacyFile of LEGACY_SETTINGS_FILES) {
    const legacy = readSettingsFileAt(legacyFile)
    if (!legacy) continue

    try {
      mkdirSync(dirname(SETTINGS_FILE), { recursive: true })
      writeFileSync(SETTINGS_FILE, JSON.stringify(legacy, null, 2))
      console.log(`[Settings] Migrated settings file from legacy path: ${legacyFile}`)
      return
    } catch {
      // Try next legacy path.
    }
  }
}

function readSettingsFile(): Partial<AppSettings> {
  ensurePrimarySettingsFile()

  const primary = readSettingsFileAt(SETTINGS_FILE)
  if (primary) return primary

  for (const legacyFile of LEGACY_SETTINGS_FILES) {
    const legacy = readSettingsFileAt(legacyFile)
    if (legacy) return legacy
  }

  return {}
}

function syncLegacySettingsCopies(serializedSettings: string): void {
  for (const legacyFile of LEGACY_SETTINGS_FILES) {
    if (!existsSync(legacyFile)) continue
    try {
      writeFileSync(legacyFile, serializedSettings)
    } catch {
      // Keep primary settings write successful even if legacy sync fails.
    }
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
  const chatProvider = normalizeChatProvider((input as Partial<AppSettings> & { chatProvider?: unknown }).chatProvider)
  const codexCliPath =
    typeof input.codexCliPath === 'string' && input.codexCliPath.trim().length > 0
      ? input.codexCliPath.trim()
      : defaults.codexCliPath
  const codexCliModel =
    typeof input.codexCliModel === 'string' ? input.codexCliModel.trim() : defaults.codexCliModel
  const codexCliTimeoutCandidate =
    typeof input.codexCliTimeoutMs === 'number'
      ? input.codexCliTimeoutMs
      : Number((input as Partial<AppSettings> & { codexCliTimeoutMs?: string }).codexCliTimeoutMs)
  const codexCliTimeoutMs =
    Number.isFinite(codexCliTimeoutCandidate) && codexCliTimeoutCandidate > 0
      ? Math.floor(codexCliTimeoutCandidate)
      : defaults.codexCliTimeoutMs
  const storageCandidate =
    typeof input.maxStorageBytes === 'number'
      ? input.maxStorageBytes
      : Number((input as Partial<AppSettings> & { maxStorageBytes?: string }).maxStorageBytes)
  const maxStorageBytes =
    Number.isFinite(storageCandidate) && storageCandidate > 0
      ? Math.min(MAX_MAX_STORAGE_BYTES, Math.max(MIN_MAX_STORAGE_BYTES, Math.floor(storageCandidate)))
      : defaults.maxStorageBytes
  const themeMode = normalizeThemeMode((input as Partial<AppSettings> & { themeMode?: unknown }).themeMode)
  const launchAtLogin = normalizeBoolean((input as Partial<AppSettings> & { launchAtLogin?: unknown }).launchAtLogin, defaults.launchAtLogin)
  const showDockIcon = normalizeBoolean((input as Partial<AppSettings> & { showDockIcon?: unknown }).showDockIcon, defaults.showDockIcon)
  const shareCrashReports = normalizeBoolean(
    (input as Partial<AppSettings> & { shareCrashReports?: unknown }).shareCrashReports,
    defaults.shareCrashReports
  )
  const shareAnonymousUsage = normalizeBoolean(
    (input as Partial<AppSettings> & { shareAnonymousUsage?: unknown }).shareAnonymousUsage,
    defaults.shareAnonymousUsage
  )
  const showTimelineIcons = normalizeBoolean(
    (input as Partial<AppSettings> & { showTimelineIcons?: unknown }).showTimelineIcons,
    defaults.showTimelineIcons
  )
  const outputLanguageOverride =
    typeof input.outputLanguageOverride === 'string'
      ? input.outputLanguageOverride.trim().slice(0, 64)
      : defaults.outputLanguageOverride
  const capturePromptTemplate = normalizeOptionalTemplate(
    (input as Partial<AppSettings> & { capturePromptTemplate?: unknown }).capturePromptTemplate
  )
  const chatPromptTemplate = normalizeOptionalTemplate(
    (input as Partial<AppSettings> & { chatPromptTemplate?: unknown }).chatPromptTemplate
  )

  return {
    apiBaseUrl,
    apiKey,
    apiModel,
    apiTimeoutMs,
    chatProvider,
    codexCliPath,
    codexCliModel,
    codexCliTimeoutMs,
    maxStorageBytes,
    themeMode,
    launchAtLogin,
    showDockIcon,
    shareCrashReports,
    shareAnonymousUsage,
    showTimelineIcons,
    outputLanguageOverride,
    capturePromptTemplate,
    chatPromptTemplate
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
  const serialized = JSON.stringify(merged, null, 2)
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true })
  writeFileSync(SETTINGS_FILE, serialized)
  syncLegacySettingsCopies(serialized)
  return merged
}
