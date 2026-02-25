export interface ActiveWindowInfo {
  appName: string
  windowTitle: string
  url?: string
  browserTabs?: BrowserTabInfo[]
  browserSessions?: BrowserSessionInfo[]
  activeTabIndex?: number
}

export interface BrowserTabInfo {
  index: number
  title: string
  url: string
  appName?: string
  windowIndex?: number
}

export interface BrowserSessionInfo {
  appName: string
  tabs: BrowserTabInfo[]
  windowCount: number
  activeUrl?: string
  activeTabIndex?: number
}

export interface CaptureMetadata {
  activeApp: string
  windowTitle: string
  activeUrl?: string
  capturedAt: number
  tabs: BrowserTabInfo[]
  browserSessions?: BrowserSessionInfo[]
  activeTabIndex?: number
}

export type StorageCategory = 'history' | 'memory' | 'screenshots'

export interface StorageCategoryUsage {
  key: StorageCategory
  label: string
  bytes: number
  path: string
  itemCount?: number
}

export interface StorageUsageSummary {
  usedBytes: number
  maxBytes: number
  percent: number
  isOverLimit: boolean
  categories: StorageCategoryUsage[]
  prunableBytes: number
}

export interface StorageEnforceResult {
  deletedRecords: number
  deletedScreenshotFiles?: number
  deletedScreenshotDirs?: number
  reclaimedBytes: number
  usedBytes: number
  maxBytes: number
  remainingOverageBytes: number
  isOverLimit: boolean
}

export interface StorageLimitUpdateResult {
  settings: AppSettings
  usage: StorageUsageSummary
}

export interface ScreenCapture {
  displayId: string
  base64: string // JPEG base64
  width: number
  height: number
}

export interface ScreenshotAsset {
  displayId: string
  relativePath: string
  width: number
  height: number
  bytes: number
  mime: 'image/jpeg'
}

export interface EmailReplyResult {
  type: 'email-reply'
  subject: string
  draft: string
  originalSender: string
}

export interface PageSummaryResult {
  type: 'page-summary'
  title: string
  summary: string
  keyPoints: string[]
}

export type MemoryCandidateKind =
  | 'todo'
  | 'reminder'
  | 'delivery'
  | 'reading'
  | 'follow-up'
  | 'finance'
  | 'event'
  | 'note'
  | 'link'
  | 'other'

export interface MemoryCandidate {
  kind: MemoryCandidateKind
  title: string
  details?: string
  dueAt?: string | null // ISO 8601, null if unknown
  source?: string
  confidence: number // 0..1
}

export interface CaptureEmailDraft {
  detected: boolean
  confidence: number // 0..1
  evidence: string[]
  subject?: string
  originalSender?: string
  draft?: string
}

export interface CaptureAnalysisResult {
  type: 'capture-analysis'
  screenTitle: string
  email: CaptureEmailDraft
  memoryCandidates: MemoryCandidate[]
  metadata?: CaptureMetadata
}

export type DetectionResult = EmailReplyResult | PageSummaryResult | CaptureAnalysisResult

export interface MemoryItem {
  id?: number
  createdAt: number
  kind: MemoryCandidateKind
  title: string
  details?: string
  dueAt?: string | null
  source?: string
  captureId?: number
  activeApp?: string
  windowTitle?: string
  url?: string
}

export interface HistoryRecord {
  id?: number
  timestamp: number
  activeApp: string
  windowTitle: string
  resultType: string
  resultJson: string
  resultText?: string
  screenshots?: ScreenshotAsset[]
  screenshotPersistedAt?: number
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ChatProvider = 'api' | 'codex-cli'

export type PermissionStatus = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export type CaptureServiceStatus = 'active' | 'idle' | 'error'

export interface SettingsRuntimeStatus {
  screenPermission: PermissionStatus
  automationPermission: PermissionStatus
  captureService: CaptureServiceStatus
  lastCheckedAt: number
}

export interface ScreenPermissionRequestResult {
  ok: boolean
  status: PermissionStatus
  prompted: boolean
  message: string
}

export interface ScreenPermissionSettingsResult {
  ok: boolean
  status: PermissionStatus
  url: string
  message?: string
}

export interface AppSettings {
  apiBaseUrl: string
  apiKey: string
  apiModel: string
  apiTimeoutMs: number
  chatProvider: ChatProvider
  codexCliPath: string
  codexCliModel: string
  codexCliTimeoutMs: number
  maxStorageBytes: number
  themeMode: ThemeMode
  launchAtLogin: boolean
  showDockIcon: boolean
  shareCrashReports: boolean
  shareAnonymousUsage: boolean
  showTimelineIcons: boolean
  outputLanguageOverride: string
  capturePromptTemplate?: string
  chatPromptTemplate?: string
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}
