export type AgentStatus = 'starting' | 'running' | 'done' | 'failed'

export type WorkflowAgent = {
  index: number
  agentId?: string
  label: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
}

export type WorkflowRun = {
  toolUseId: string
  runId?: string
  name: string
  phases: string[]
  startedAt: number
  agents: WorkflowAgent[]
}

declare module 'claude-code' {
  interface PluginState {
    'workflow-pane': {
      runs: Shaped<WorkflowRun[]>
      frame: number
    }
  }
}
