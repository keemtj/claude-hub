export type Tab = 'plugins' | 'skills' | 'mcp'

export type PluginItem = {
  id: string
  version?: string
  isEnabled: boolean
  // user, project, synced, session, or "dev-mod" for this session's mods folder
  scope: string
  path?: string
}

export type SkillItem = {
  name: string
  // mine: a folder in ~/.claude/skills; linked: installed elsewhere (read-only)
  kind: 'mine' | 'linked'
  target?: string
}

export type PluginSkills = { plugin: string; count: number }

export type McpItem = {
  name: string
  target: string
  // connected, auth, failed, unset: from `claude mcp list`
  status: string
}

export type Inventory = {
  plugins: PluginItem[]
  skills: SkillItem[]
  pluginSkills: PluginSkills[]
  mcp: McpItem[]
  isLoading: boolean
  isMcpLoading: boolean
  message?: string
}

declare module 'claude-code' {
  interface PluginState {
    'inventory-mod': {
      tab: Tab
      inventory: Shaped<Inventory>
      blockedSkills: Shaped<string[]>
      blockedMcp: Shaped<string[]>
    }
  }
}
