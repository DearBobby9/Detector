import { spawn } from 'child_process'
import type { AppSettings } from '@shared/types'

interface CodexCommandResult {
  stdout: string
  stderr: string
}

const FALLBACK_CODEX_PATH = 'codex'
const FALLBACK_CODEX_TIMEOUT_MS = 120000
const MCP_LIST_TIMEOUT_CAP_MS = 15000
const OUTPUT_TAIL_LENGTH = 320

function trimTrailingLineBreaks(value: string): string {
  return value.replace(/\s+$/, '')
}

function tail(value: string): string {
  const trimmed = trimTrailingLineBreaks(value)
  if (trimmed.length <= OUTPUT_TAIL_LENGTH) return trimmed
  return `...${trimmed.slice(-OUTPUT_TAIL_LENGTH)}`
}

function resolveCodexPath(settings: AppSettings): string {
  const raw = settings.codexCliPath.trim()
  return raw.length > 0 ? raw : FALLBACK_CODEX_PATH
}

function resolveTimeoutMs(settings: AppSettings): number {
  if (!Number.isFinite(settings.codexCliTimeoutMs) || settings.codexCliTimeoutMs <= 0) {
    return FALLBACK_CODEX_TIMEOUT_MS
  }
  return Math.max(1000, Math.floor(settings.codexCliTimeoutMs))
}

function runCodexCommand(
  codexPath: string,
  args: string[],
  timeoutMs: number,
  timeoutLabel: string
): Promise<CodexCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/zsh', ['-l', '-c', '"$@"', 'detector-codex-cli', codexPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        child.kill('SIGKILL')
      }, 1000).unref()
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (timedOut) {
        reject(new Error(`Codex CLI ${timeoutLabel} timed out after ${timeoutMs}ms`))
        return
      }

      if (code !== 0) {
        const stderrTail = tail(stderr)
        const stdoutTail = tail(stdout)
        const detail = stderrTail || stdoutTail || 'No command output.'
        reject(new Error(`Codex CLI ${timeoutLabel} failed (exit ${code}): ${detail}`))
        return
      }

      resolve({ stdout, stderr })
    })
  })
}

function maybeParseJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    if (start === -1 || end === -1 || end <= start) return null
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1))
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

async function listEnabledMcpServerNames(codexPath: string, timeoutMs: number): Promise<string[]> {
  try {
    const listTimeoutMs = Math.max(1000, Math.min(timeoutMs, MCP_LIST_TIMEOUT_CAP_MS))
    const { stdout } = await runCodexCommand(codexPath, ['mcp', 'list', '--json'], listTimeoutMs, 'MCP listing')
    const parsed = maybeParseJsonArray(stdout)
    if (!parsed) return []

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const name = (entry as { name?: unknown }).name
        const enabled = (entry as { enabled?: unknown }).enabled
        if (enabled === false) return ''
        return typeof name === 'string' ? name.trim() : ''
      })
      .filter((name): name is string => name.length > 0)
  } catch {
    return []
  }
}

function parseCodexJsonLines(raw: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = []
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      events.push(parsed)
    } catch {
      // Ignore non-JSON or partial lines.
    }
  }
  return events
}

function collectTextFields(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextFields(item, depth + 1))
  }
  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const chunks: string[] = []

  const directKeys = ['text', 'content', 'output_text', 'message']
  for (const key of directKeys) {
    if (key in record) {
      chunks.push(...collectTextFields(record[key], depth + 1))
    }
  }

  if (Array.isArray(record.items)) {
    chunks.push(...collectTextFields(record.items, depth + 1))
  }

  return chunks
}

function extractAgentMessage(raw: string): string {
  const events = parseCodexJsonLines(raw)
  const messageChunks: string[] = []

  for (const event of events) {
    if (event.type !== 'item.completed') continue
    const item = event.item
    if (!item || typeof item !== 'object') continue
    const itemType = (item as { type?: unknown }).type
    if (itemType !== 'agent_message') continue

    const chunks = collectTextFields(item)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)

    if (chunks.length > 0) {
      messageChunks.push(chunks.join('\n'))
    }
  }

  return trimTrailingLineBreaks(messageChunks.join('\n\n'))
}

export async function sendCodexChat(prompt: string, settings: AppSettings): Promise<string> {
  const codexPath = resolveCodexPath(settings)
  const timeoutMs = resolveTimeoutMs(settings)
  const enabledMcpServers = await listEnabledMcpServerNames(codexPath, timeoutMs)
  const model = settings.codexCliModel.trim()
  const mcpServersToDisable = new Set(enabledMcpServers)

  const args = ['exec', '--skip-git-repo-check', '--json']
  if (model.length > 0) {
    args.push('--model', model)
  }
  args.push('--config', 'web_search=disabled')
  for (const serverName of mcpServersToDisable) {
    if (!/^[A-Za-z0-9_-]+$/.test(serverName)) continue
    args.push('--config', `mcp_servers.${serverName}.enabled=false`)
  }
  args.push('--', prompt)

  const { stdout } = await runCodexCommand(codexPath, args, timeoutMs, 'chat')
  const text = extractAgentMessage(stdout)
  if (!text) {
    throw new Error(`Codex CLI returned no assistant message. Output: ${tail(stdout) || '[empty]'}`)
  }

  return text
}
