export interface ActiveWindowInfo {
  appName: string
  windowTitle: string
  url?: string
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

export type DetectionResult = EmailReplyResult | PageSummaryResult

export interface HistoryRecord {
  id?: number
  timestamp: number
  activeApp: string
  windowTitle: string
  resultType: string
  resultJson: string
}
