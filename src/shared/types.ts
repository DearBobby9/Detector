export interface ActiveWindowInfo {
  appName: string
  windowTitle: string
  url?: string
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
}

export interface AppSettings {
  apiBaseUrl: string
  apiKey: string
  apiModel: string
  apiTimeoutMs: number
  maxStorageBytes: number
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}
