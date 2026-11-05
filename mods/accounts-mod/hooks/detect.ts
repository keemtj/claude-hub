// Which services a session used, read from its tool calls. Pure functions, so
// the rules can be checked outside the engine.

export type Usage = { commands: number; mcp: number; artifacts: number }
export type Detected = Map<string, Usage>

type CommandRule = { id: string; pattern: RegExp }

// A Bash command counts for a service when it runs that service's CLI.
export const COMMAND_RULES: CommandRule[] = [
  { id: 'git', pattern: /(^|[;&|(\s])git\s+(commit|push|pull|fetch|clone|tag|merge|rebase)\b/ },
  { id: 'github', pattern: /(^|[;&|(\s])gh\s+\w/ },
  { id: 'vercel', pattern: /(^|[;&|(\s])(npx\s+)?vercel(\s|$)/ },
  { id: 'aws', pattern: /(^|[;&|(\s])aws\s+\w/ },
  { id: 'expo', pattern: /(^|[;&|(\s])(npx\s+)?(eas|expo)\s+\w/ },
  { id: 'supabase', pattern: /(^|[;&|(\s])(npx\s+)?supabase\s+\w/ },
  { id: 'firebase', pattern: /(^|[;&|(\s])(npx\s+)?firebase\s+\w/ },
  { id: 'gcloud', pattern: /(^|[;&|(\s])gcloud\s+\w/ },
  { id: 'npm', pattern: /(^|[;&|(\s])npm\s+(publish|login|whoami)\b/ },
  { id: 'codex', pattern: /(^|[;&|(\s])codex(\s|$)/ },
]

// MCP servers that only run on this machine sign in to nothing.
const LOCAL_MCP = new Set(['playwright', 'rea', 'blender', 'plugin-authoring'])

export function serviceForTool(name: string): string | undefined {
  if (name === 'Artifact' || name === 'ArtifactData' || name === 'ArtifactComments') return 'claude'
  const mcp = name.match(/^mcp__(.+?)__/)?.[1]
  if (!mcp || LOCAL_MCP.has(mcp)) return undefined
  return `mcp:${mcp}`
}

export function servicesForCommand(command: string): string[] {
  return COMMAND_RULES.filter(rule => rule.pattern.test(command)).map(rule => rule.id)
}

function bump(found: Detected, id: string, kind: keyof Usage) {
  const usage = found.get(id) ?? { commands: 0, mcp: 0, artifacts: 0 }
  usage[kind] += 1
  found.set(id, usage)
}

export function record(found: Detected, tool: string, command?: string) {
  if (tool === 'Bash' && command) {
    for (const id of servicesForCommand(command)) bump(found, id, 'commands')
    return
  }
  const id = serviceForTool(tool)
  if (id) bump(found, id, id === 'claude' ? 'artifacts' : 'mcp')
}

// Lines grep pulled out of a transcript: a tool_use's name and, for Bash, the
// start of its command (JSON-escaped).
export function scanTranscript(lines: string): Detected {
  const found: Detected = new Map()
  for (const line of lines.split('\n')) {
    const match = line.match(/"type":"tool_use","id":"[^"]+","name":"([^"]+)"(?:,"input":\{"command":"(.*))?$/)
    if (!match?.[1]) continue
    const command = match[2]?.replace(/\\n/g, '\n').replace(/\\"/g, '"')
    record(found, match[1], command)
  }
  return found
}

const MCP_NAMES: Record<string, string> = {
  'figma-desktop': 'Figma (데스크톱)',
}

export function displayName(id: string): string {
  const fixed: Record<string, string> = {
    git: 'git',
    github: 'GitHub',
    vercel: 'Vercel',
    aws: 'AWS',
    expo: 'Expo',
    supabase: 'Supabase',
    firebase: 'Firebase',
    gcloud: 'Google Cloud',
    npm: 'npm',
    codex: 'Codex',
    claude: 'Claude',
  }
  if (fixed[id]) return fixed[id]
  const server = id.replace(/^mcp:/, '')
  if (MCP_NAMES[server]) return MCP_NAMES[server]
  const connector = server.match(/^claude_ai_(.+)$/)?.[1]
  if (connector) return `${connector.replace(/_/g, ' ')} (claude.ai)`
  const plugin = server.match(/^plugin_[^_]+_(.+)$/)?.[1]
  return plugin ?? server
}

export function usageText(usage: Usage): string[] {
  const out: string[] = []
  if (usage.commands) out.push(`명령 ${usage.commands}회`)
  if (usage.mcp) out.push(`MCP ${usage.mcp}회`)
  if (usage.artifacts) out.push(`아티팩트 ${usage.artifacts}회`)
  return out
}

// The kind of service, so the pane can group them. A server this table does not
// know falls under "기타 연결".
export const CATEGORIES = [
  'AI 에이전트',
  '코드 저장소',
  '배포·호스팅',
  '클라우드',
  '백엔드 SaaS',
  '패키지 레지스트리',
  '협업·디자인 SaaS',
  '기타 연결',
] as const
export type Category = (typeof CATEGORIES)[number]

const CATEGORY_OF: Record<string, Category> = {
  claude: 'AI 에이전트',
  codex: 'AI 에이전트',
  git: '코드 저장소',
  github: '코드 저장소',
  vercel: '배포·호스팅',
  expo: '배포·호스팅',
  aws: '클라우드',
  gcloud: '클라우드',
  supabase: '백엔드 SaaS',
  firebase: '백엔드 SaaS',
  npm: '패키지 레지스트리',
}

const COLLABORATION = /slack|notion|linear|figma|jira|confluence|atlassian|asana|monday|miro|canva|google_drive|gmail|microsoft_365|box|hubspot|intercom|mobbin|claude_docs/i

export function categoryOf(id: string): Category {
  const fixed = CATEGORY_OF[id]
  if (fixed) return fixed
  if (id.startsWith('mcp:') && COLLABORATION.test(id)) return '협업·디자인 SaaS'
  if (/github/i.test(id)) return '코드 저장소'
  if (/vercel/i.test(id)) return '배포·호스팅'
  return '기타 연결'
}

// Order: what the session leaned on most, then by name.
export function sortRows<T extends { id: string; weight: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
}

// A remote URL can carry a token in its user part, query or fragment: keep
// only the host and path. An scp-style remote (git@host:path) has no query of
// its own, so anything from ? or # on is dropped.
export function cleanRemote(url: string): string {
  let clean: string
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      clean = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
    } catch {
      clean = url.replace(/\/\/[^@/]+@/, '//').replace(/[?#].*$/, '')
    }
  } else {
    clean = url.replace(/[?#].*$/, '')
  }
  return clean.replace(/\.git$/, '')
}
