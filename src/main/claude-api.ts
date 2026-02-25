import { ActiveWindowInfo, BrowserSessionInfo, BrowserTabInfo, DetectionResult, ScreenCapture } from '@shared/types'
import { getSettings } from './settings'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value >= 0 && value <= 1) return value
  if (value >= 1 && value <= 100) return value / 100
  return Math.max(0, Math.min(1, value))
}

function normalizeErrorSnippet(text: string, maxLength = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return '(empty response)'
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`
}

export function parseDetectionResult(text: string): DetectionResult {
  // Parse JSON from response (handle potential markdown code blocks)
  let jsonStr = text.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Model response was not valid JSON. Raw response: ${normalizeErrorSnippet(text)}`)
  }

  if (!isRecord(parsed)) {
    throw new Error('Model response JSON must be an object')
  }

  if (parsed.type === 'email-reply') {
    if (
      typeof parsed.subject !== 'string' ||
      typeof parsed.draft !== 'string' ||
      typeof parsed.originalSender !== 'string'
    ) {
      throw new Error(
        'Invalid email-reply payload: expected subject/draft/originalSender to be strings'
      )
    }

    return {
      type: 'email-reply',
      subject: parsed.subject,
      draft: parsed.draft,
      originalSender: parsed.originalSender
    }
  }

  if (parsed.type === 'page-summary') {
    if (
      typeof parsed.title !== 'string' ||
      typeof parsed.summary !== 'string' ||
      !isStringArray(parsed.keyPoints)
    ) {
      throw new Error('Invalid page-summary payload: expected title/summary strings and keyPoints[]')
    }

    return {
      type: 'page-summary',
      title: parsed.title,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints
    }
  }

  if (parsed.type === 'capture-analysis') {
    if (typeof parsed.screenTitle !== 'string') {
      throw new Error('Invalid capture-analysis payload: expected screenTitle to be a string')
    }

    if (!isRecord(parsed.email)) {
      throw new Error('Invalid capture-analysis payload: expected email to be an object')
    }

    const detected = Boolean(parsed.email.detected)
    const emailConfidence = normalizeConfidence(parsed.email.confidence)
    const evidence = isStringArray(parsed.email.evidence) ? parsed.email.evidence : []

    const subject = typeof parsed.email.subject === 'string' ? parsed.email.subject : undefined
    const originalSender =
      typeof parsed.email.originalSender === 'string' ? parsed.email.originalSender : undefined
    const draft = typeof parsed.email.draft === 'string' ? parsed.email.draft : undefined

    const memoryCandidatesRaw = Array.isArray(parsed.memoryCandidates)
      ? (parsed.memoryCandidates as unknown[])
      : []

    const allowedKinds = new Set([
      'todo',
      'reminder',
      'delivery',
      'reading',
      'follow-up',
      'finance',
      'event',
      'note',
      'link',
      'other'
    ])

    const memoryCandidates = memoryCandidatesRaw
      .map((raw): any => {
        if (!isRecord(raw)) return null
        const kind = typeof raw.kind === 'string' && allowedKinds.has(raw.kind) ? raw.kind : 'other'
        const title = typeof raw.title === 'string' ? raw.title : null
        if (!title) return null

        const details = typeof raw.details === 'string' ? raw.details : undefined
        const dueAt =
          raw.dueAt === null || raw.dueAt === undefined
            ? raw.dueAt
            : typeof raw.dueAt === 'string'
              ? raw.dueAt
              : undefined
        const source = typeof raw.source === 'string' ? raw.source : undefined
        const confidence = normalizeConfidence(raw.confidence)

        return { kind, title, details, dueAt, source, confidence }
      })
      .filter(Boolean)

    return {
      type: 'capture-analysis',
      screenTitle: parsed.screenTitle,
      email: {
        detected,
        confidence: emailConfidence,
        evidence,
        subject,
        originalSender,
        draft
      },
      memoryCandidates
    }
  }

  throw new Error(`Unexpected result type: ${String(parsed.type)}`)
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  )
}

function toTabLine(tab: BrowserTabInfo): string {
  const index = Number.isFinite(Number(tab.index)) && Number(tab.index) > 0 ? Math.floor(Number(tab.index)) : 0
  const title = typeof tab.title === 'string' && tab.title.trim().length > 0 ? tab.title.trim() : '(untitled)'
  const url = typeof tab.url === 'string' ? tab.url.trim() : ''
  const prefix = index > 0 ? `${index}. ` : '- '
  return url ? `${prefix}${title} — ${url}` : `${prefix}${title}`
}

function buildActiveContextText(activeWindow: ActiveWindowInfo): string {
  const lines: string[] = []
  const appName = typeof activeWindow.appName === 'string' && activeWindow.appName.trim()
    ? activeWindow.appName.trim()
    : 'Unknown'
  const windowTitle = typeof activeWindow.windowTitle === 'string' ? activeWindow.windowTitle.trim() : ''
  const activeUrl = typeof activeWindow.url === 'string' ? activeWindow.url.trim() : ''
  const browserSessions = Array.isArray(activeWindow.browserSessions)
    ? (activeWindow.browserSessions as BrowserSessionInfo[])
    : []
  const browserTabs = Array.isArray(activeWindow.browserTabs) ? activeWindow.browserTabs : []

  lines.push(`Active application: ${appName}`)
  lines.push(`Window title: ${windowTitle || '(no title)'}`)
  if (activeUrl) {
    lines.push(`Active URL: ${activeUrl}`)
  }

  if (browserSessions.length > 0) {
    lines.push('')
    lines.push(`Browser sessions (${browserSessions.length}):`)
    browserSessions.forEach((session, index) => {
      const sessionAppName =
        typeof session.appName === 'string' && session.appName.trim().length > 0 ? session.appName.trim() : 'Browser'
      const sessionTabs = Array.isArray(session.tabs) ? session.tabs : []
      const sessionWindowCount = Number(session.windowCount)
      const windows = Number.isFinite(sessionWindowCount) && sessionWindowCount >= 0 ? Math.floor(sessionWindowCount) : 0
      const sessionActiveUrl = typeof session.activeUrl === 'string' ? session.activeUrl.trim() : ''
      const headerParts = [`Session ${index + 1} (${sessionAppName})`, `${sessionTabs.length} tabs`]
      if (windows > 0) headerParts.push(`${windows} windows`)
      lines.push(headerParts.join(' · '))
      if (sessionActiveUrl) {
        lines.push(`Active URL: ${sessionActiveUrl}`)
      }
      for (const tab of sessionTabs) {
        lines.push(toTabLine(tab))
      }
      lines.push('')
    })
    if (lines[lines.length - 1] === '') {
      lines.pop()
    }
  } else if (browserTabs.length > 0) {
    lines.push('')
    lines.push(`Browser tabs (${browserTabs.length}):`)
    for (const tab of browserTabs) {
      lines.push(toTabLine(tab))
    }
  }

  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a macOS screen understanding assistant.

You will receive:
- One or more desktop screenshots
- Active window info (app name, window title, and sometimes URL)

Your job:
1) Identify whether the user is currently viewing an email (email client/webmail).
2) If and only if it is clearly an email: draft a professional reply.
3) Extract a short list of actionable "memory candidates" from what is visible on screen (todos, reminders, deliveries, papers to read, etc.).

Be conservative:
- Set email.detected=false unless you see clear email UI cues AND recognizable email details (sender/subject/email address).
- Do NOT invent facts that are not visible.

IMPORTANT: Respond ONLY with valid JSON in exactly this format:

{
  "type": "capture-analysis",
  "screenTitle": "<short descriptive title of what's on screen>",
  "email": {
    "detected": true,
    "confidence": 0.0,
    "evidence": ["<short evidence strings>"],
    "subject": "Re: <original subject>",
    "originalSender": "<sender name or email>",
    "draft": "<reply draft, <= 150 words>"
  },
  "memoryCandidates": [
    {
      "kind": "todo|reminder|delivery|reading|follow-up|finance|event|note|link|other",
      "title": "<short title>",
      "details": "<optional details>",
      "dueAt": "2026-02-10T20:00:00Z",
      "source": "<optional snippet/evidence from screen>",
      "confidence": 0.0
    }
  ]
}

Rules:
- If email.detected is false, omit subject/originalSender/draft or set them to empty strings.
- confidence fields must be 0..1.
- memoryCandidates must be 0-6 items and must be actionable.
- dueAt must be an ISO 8601 string if provided, otherwise null.
`

function buildCaptureSystemPrompt(settings: { capturePromptTemplate?: string; outputLanguageOverride?: string }): string {
  const basePrompt =
    typeof settings.capturePromptTemplate === 'string' && settings.capturePromptTemplate.trim().length > 0
      ? settings.capturePromptTemplate.trim()
      : SYSTEM_PROMPT
  const languageOverride =
    typeof settings.outputLanguageOverride === 'string' ? settings.outputLanguageOverride.trim() : ''

  if (!languageOverride) return basePrompt
  return `${basePrompt}\n\nAdditional output rule: Use ${languageOverride} for all generated text fields unless source text must remain verbatim.`
}

export async function callClaude(
  screenshots: ScreenCapture[],
  activeWindow: ActiveWindowInfo
): Promise<DetectionResult> {
  const settings = getSettings()
  const apiKey = settings.apiKey
  const baseUrl = settings.apiBaseUrl
  const model = settings.apiModel
  const timeoutMs = settings.apiTimeoutMs

  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error('API key not set. Open Detector settings and configure API key.')
  }

  console.log('[API] Calling', baseUrl, 'model:', model, 'with', screenshots.length, 'screenshot(s)')
  console.log('[API] Active window:', activeWindow.appName, '-', activeWindow.windowTitle)

  // Build user message content (OpenAI vision format)
  const userContent: Array<Record<string, unknown>> = []

  for (const capture of screenshots) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${capture.base64}`,
        detail: 'auto'
      }
    })
  }

  userContent.push({
    type: 'text',
    text: `${buildActiveContextText(activeWindow)}\n\nPlease analyze the screenshot(s) and respond with the appropriate JSON format.`
  })

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
  }, timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: buildCaptureSystemPrompt(settings) },
          { role: 'user', content: userContent }
        ]
      }),
      signal: abortController.signal
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`API request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[API] Error:', response.status, errorBody)
    throw new Error(`API error: ${response.status} - ${errorBody}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  const text = data.choices?.[0]?.message?.content
  if (!text) {
    throw new Error('No text response from API')
  }

  console.log('[API] Raw response:', text.substring(0, 200))

  const result = parseDetectionResult(text)

  console.log('[API] Result type:', result.type)
  return result
}
