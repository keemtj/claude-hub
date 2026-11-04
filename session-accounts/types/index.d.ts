export type ServiceId = string

// active: the account selected and used now; inactive: signed in, but not the
// one selected.
export type AccountState = 'active' | 'inactive'

export type AccountLine = {
  value: string
  state: AccountState
  // One fact per line, in this order: how it signs in (and plan), the
  // organization, where the login lives
  details?: string[]
}

export type ServiceRow = {
  id: ServiceId
  name: string
  // The group it is drawn under: "AI 에이전트", "코드 저장소", ...
  category: string
  // Why it is listed: "명령 3회", "MCP 5회", "설정 파일"
  reasons: string[]
  // Who it is signed in as now, when that can be asked
  account?: string
  // A second line: the project or remote it points at
  detail?: string
  // Set when the account check ran and could not tell
  note?: string
  // Every account signed in for the service, the active one first
  accounts?: AccountLine[]
}

export type AccountsView = {
  rows: ServiceRow[]
  checkedAt?: number
  isChecking: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-accounts': {
      view: Shaped<AccountsView>
    }
  }
}
