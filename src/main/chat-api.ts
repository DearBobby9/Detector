import { AppSettings, ChatMessage } from '@shared/types'
import { getSettings } from './settings'
import { parseDetectionResult } from './claude-api'
import { sendCodexChat } from './chat-codex-cli'

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
    apiTimeoutMs: typeof override.apiTimeoutMs === 'number' ? override.apiTimeoutMs : current.apiTimeoutMs,
    chatProvider: override.chatProvider || current.chatProvider,
    codexCliPath: typeof override.codexCliPath === 'string' ? override.codexCliPath : current.codexCliPath,
    codexCliModel: typeof override.codexCliModel === 'string' ? override.codexCliModel : current.codexCliModel,
    codexCliTimeoutMs:
      typeof override.codexCliTimeoutMs === 'number' ? override.codexCliTimeoutMs : current.codexCliTimeoutMs,
    maxStorageBytes:
      typeof override.maxStorageBytes === 'number' ? override.maxStorageBytes : current.maxStorageBytes,
    themeMode: override.themeMode || current.themeMode,
    launchAtLogin: typeof override.launchAtLogin === 'boolean' ? override.launchAtLogin : current.launchAtLogin,
    showDockIcon: typeof override.showDockIcon === 'boolean' ? override.showDockIcon : current.showDockIcon,
    shareCrashReports:
      typeof override.shareCrashReports === 'boolean' ? override.shareCrashReports : current.shareCrashReports,
    shareAnonymousUsage:
      typeof override.shareAnonymousUsage === 'boolean'
        ? override.shareAnonymousUsage
        : current.shareAnonymousUsage,
    showTimelineIcons:
      typeof override.showTimelineIcons === 'boolean' ? override.showTimelineIcons : current.showTimelineIcons,
    outputLanguageOverride:
      typeof override.outputLanguageOverride === 'string'
        ? override.outputLanguageOverride
        : current.outputLanguageOverride,
    capturePromptTemplate:
      typeof override.capturePromptTemplate === 'string'
        ? override.capturePromptTemplate
        : current.capturePromptTemplate,
    chatPromptTemplate:
      typeof override.chatPromptTemplate === 'string' ? override.chatPromptTemplate : current.chatPromptTemplate
  }
}

function getChatSystemPrompt(settings: AppSettings): string {
  if (typeof settings.chatPromptTemplate === 'string' && settings.chatPromptTemplate.trim().length > 0) {
    return settings.chatPromptTemplate.trim()
  }
  return SYSTEM_CHAT_PROMPT
}

function getOutputLanguageInstruction(settings: AppSettings): string | null {
  const outputLanguage = settings.outputLanguageOverride.trim()
  if (!outputLanguage) return null
  return `Always reply in ${outputLanguage}.`
}

function buildCodexChatPrompt(contextText: string, messages: ChatMessage[], settings: AppSettings): string {
  const systemPrompt = getChatSystemPrompt(settings)
  const languageInstruction = getOutputLanguageInstruction(settings)
  const normalizedContext = contextText.trim().length > 0 ? contextText.trim() : '(none)'

  const transcript = messages
    .map((msg) => {
      const roleLabel = msg.role === 'assistant' ? 'Assistant' : 'User'
      return `${roleLabel}:\n${msg.content}`
    })
    .join('\n\n')

  const sections = [
    'System instruction:',
    systemPrompt,
    languageInstruction,
    'Screen context:',
    normalizedContext,
    'Conversation transcript (oldest to newest):',
    transcript,
    'Reply as Assistant to the latest User message. Keep responses concise, practical, and specific.'
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return sections.join('\n\n')
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

  const start = Date.now()

  if (settings.chatProvider === 'codex-cli') {
    try {
      const ping = await sendCodexChat('Return ONLY this exact text: OK', settings)
      if (ping.trim() !== 'OK') {
        return {
          ok: false,
          message: `Codex CLI ping check failed. Expected "OK", got "${ping.trim().slice(0, 32)}".`,
          latencyMs: Date.now() - start
        }
      }
      return { ok: true, message: 'Codex CLI test succeeded (strict ping)', latencyMs: Date.now() - start }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message, latencyMs: Date.now() - start }
    }
  }

  if (!settings.apiKey) {
    return { ok: false, message: 'API key is empty', latencyMs: 0 }
  }

  try {
    const ping = await postChatCompletions(
      settings,
      [
        { role: 'system', content: 'Return ONLY this exact text: OK' },
        { role: 'user', content: 'OK' }
      ],
      8
    )
    if (ping !== 'OK') {
      return {
        ok: false,
        message: `API test failed strict ping check. Expected "OK", got "${ping.slice(0, 32)}".`,
        latencyMs: Date.now() - start
      }
    }

    const captureSmoke = await postChatCompletions(
      settings,
      [
        {
          role: 'system',
          content:
            'Return ONLY valid JSON for Detector capture-analysis schema. No markdown, no extra text.'
        },
        {
          role: 'user',
          content: `Return exactly one object with this shape:
{
  "type": "capture-analysis",
  "screenTitle": "API smoke test",
  "email": { "detected": false, "confidence": 0, "evidence": [] },
  "memoryCandidates": []
}`
        }
      ],
      220
    )

    const parsed = parseDetectionResult(captureSmoke)
    if (parsed.type !== 'capture-analysis') {
      return {
        ok: false,
        message: `API test failed capture schema check. Expected "capture-analysis", got "${parsed.type}".`,
        latencyMs: Date.now() - start
      }
    }

    return { ok: true, message: 'API test succeeded (strict ping + capture JSON schema)', latencyMs: Date.now() - start }
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
  const systemPrompt = getChatSystemPrompt(settings)
  const languageInstruction = getOutputLanguageInstruction(settings)

  if (settings.chatProvider === 'codex-cli') {
    const prompt = buildCodexChatPrompt(contextText, messages, settings)
    return sendCodexChat(prompt, settings)
  }

  if (!settings.apiKey) {
    throw new Error('API key not set')
  }

  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  apiMessages.push({ role: 'system', content: systemPrompt })
  if (languageInstruction) {
    apiMessages.push({ role: 'system', content: languageInstruction })
  }
  apiMessages.push({ role: 'system', content: `Screen context:\n${contextText}` })

  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: msg.content })
  }

  return postChatCompletions(settings, apiMessages, 800)
}
