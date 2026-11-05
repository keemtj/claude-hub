export type PortRow = {
  pid: number
  // Listening addresses: "127.0.0.1:3000", "*:5173", "[::1]:8080"
  addresses: string[]
  ports: number[]
  // The process's own name and its command line, cut short
  name: string
  args: string
  cwd?: string
  // Why it counts as this session's: started by its commands, or a child of it
  origin?: 'command' | 'child'
}

export type PortsView = {
  session: PortRow[]
  others: PortRow[]
  isShowingAll: boolean
  isChecking: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'ports-mod': {
      view: Shaped<PortsView>
    }
  }
}
