import { AppSettings, ChatMessage } from '@shared/types'
import { getSettings } from './settings'

const SYSTEM_CHAT_PROMPT = `You are a helpful desktop assistant.

You will receive a "screen context" text which describes what the user was looking at.
Use that context to answer the user's follow-up questions and help them take next steps.

Be concise, practical, and specific.`

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  )
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function mergeSettings(override?: Partial<AppSettings>): AppSettings {
  if (!override) return getSettings()

  const current = getSettings()
  return {
    apiBaseUrl: typeof override.apiBaseUrl === 'string' ? override.apiBaseUrl : current.apiBaseUrl,
    apiKey: typeof override.apiKey === 'string' ? override.apiKey : current.apiKey,
    apiModel: typeof override.apiModel === 'string' ? override.apiModel : current.apiModel,
    apiTimeoutMs: typeof override.apiTimeoutMs === 'number' ? override.apiTimeoutMs : current.apiTimeoutMs
  }
}

async function postChatCompletions(
  settings: AppSettings,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number
): Promise<string> {
  const baseUrl = normalizeBaseUrl(settings.apiBaseUrl)
  const url = `${baseUrl}/chat/completions`

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), settings.apiTimeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.apiModel,
        max_tokens: maxTokens,
        messages
      }),
      signal: abortController.signal
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`API error: ${response.status} - ${errorBody}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const text = data.choices?.[0]?.message?.content
    if (!text) {
      throw new Error('No text response from API')
    }

    return text.trim()
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`API request timed out after ${settings.apiTimeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function apiTest(override?: Partial<AppSettings>): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const settings = mergeSettings(override)
  if (!settings.apiKey) {
    return { ok: false, message: 'API key is empty', latencyMs: 0 }
  }

  const start = Date.now()
  try {
    await postChatCompletions(
      settings,
      [
        { role: 'system', content: 'Return ONLY the single word OK.' },
        { role: 'user', content: 'OK' }
      ],
      8
    )
    return { ok: true, message: 'API test succeeded', latencyMs: Date.now() - start }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message, latencyMs: Date.now() - start }
  }
}

export async function sendChat(
  contextText: string,
  messages: ChatMessage[],
  override?: Partial<AppSettings>
): Promise<string> {
  const settings = mergeSettings(override)

  if (!settings.apiKey) {
    throw new Error('API key not set')
  }

  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_CHAT_PROMPT },
    { role: 'system', content: `Screen context:\n${contextText}` }
  ]

  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: msg.content })
  }

  return postChatCompletions(settings, apiMessages, 800)
}

