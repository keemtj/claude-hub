// Parsing CLI output and naming rules. Pure functions, so they can be checked
// outside the engine.

import type { McpItem, PluginItem } from '../types'

// `claude plugin list --json`
export function parsePlugins(text: string): PluginItem[] {
  try {
    const data = JSON.parse(text) as unknown
    const list = (Array.isArray(data) ? data : ((data as { plugins?: unknown[] }).plugins ?? [])) as Record<
      string,
      unknown
    >[]
    return list
      .map(item => ({
        id: String(item.id ?? item.name ?? ''),
        version: typeof item.version === 'string' ? item.version : undefined,
        isEnabled: item.enabled === true,
        scope: typeof item.scope === 'string' ? item.scope : '',
        path: typeof item.installPath === 'string' ? item.installPath : undefined,
      }))
      .filter(item => item.id)
  } catch {
    return []
  }
}

// `claude mcp list`: "name: target - ✔ Connected" per line.
export function parseMcp(text: string): McpItem[] {
  const out: McpItem[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^(.+?):\s(.*)\s-\s(.+)$/)
    if (!match) continue
    const [, name = '', target = '', rawStatus = ''] = match
    const status = /connected/i.test(rawStatus)
      ? 'connected'
      : /auth/i.test(rawStatus)
        ? 'auth'
        : /not configured/i.test(rawStatus)
          ? 'unset'
          : 'failed'
    out.push({ name: name.trim(), target: target.replace(/\s*\((HTTP|SSE|stdio)\)\s*$/i, '').trim(), status })
  }
  return out
}

// The prefix of a server's tool names: `mcp__<server>__<tool>`, where the
// server's display name keeps letters, digits, `_` and `-` and turns the rest
// into `_` ("claude.ai Slack" → "claude_ai_Slack", "plugin:vercel:vercel" →
// "plugin_vercel_vercel").
export function mcpToolPrefix(server: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__`
}

export function isBlockedTool(tool: string, blockedServers: string[]): string | undefined {
  return blockedServers.find(server => tool.startsWith(mcpToolPrefix(server)))
}

// A plugin's skill is called "<plugin>:<skill>"; a personal one by its name.
export function skillOfCall(input: { skill?: unknown }): string | undefined {
  return typeof input.skill === 'string' ? input.skill.replace(/^\//, '') : undefined
}

export function pluginName(id: string): string {
  return id.split('@')[0] ?? id
}
