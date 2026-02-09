import { ActiveWindowInfo, DetectionResult, ScreenCapture } from '@shared/types'
import { getSettings } from './settings'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseDetectionResult(text: string): DetectionResult {
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
    throw new Error('Model response was not valid JSON')
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

const SYSTEM_PROMPT = `You are a screen understanding assistant. You analyze screenshots of a user's desktop to provide helpful actions.

Your job:
1. Look at the screenshots and active window info
2. Determine if the user is viewing an email (any email client or webmail like Gmail, Outlook, etc.)
3. If it's an email: generate a professional reply draft
4. If it's not an email: provide a concise summary of what's on screen

IMPORTANT: Respond ONLY with valid JSON in one of these two formats:

For email reply:
{
  "type": "email-reply",
  "subject": "Re: <original subject>",
  "draft": "<your reply draft>",
  "originalSender": "<sender name or email>"
}

For page summary:
{
  "type": "page-summary",
  "title": "<descriptive title of what's on screen>",
  "summary": "<2-3 sentence summary>",
  "keyPoints": ["point 1", "point 2", "point 3"]
}

Guidelines for email replies:
- Be professional and concise
- Match the tone of the original email
- Address the key points raised
- Keep it under 150 words

Guidelines for page summaries:
- Focus on the most visible/important content
- Include 3-5 key points
- Be concise and informative`

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
    text: `Active application: ${activeWindow.appName}\nWindow title: ${activeWindow.windowTitle}\n\nPlease analyze the screenshot(s) and respond with the appropriate JSON format.`
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
          { role: 'system', content: SYSTEM_PROMPT },
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
