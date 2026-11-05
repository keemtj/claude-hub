export type AgentStatus = 'starting' | 'running' | 'done' | 'failed'

export type WorkflowAgent = {
  index: number
  agentId?: string
  label: string
  phase?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
}

export type RunStatus = 'running' | 'completed' | 'failed'

export type WorkflowRun = {
  toolUseId: string
  runId?: string
  name: string
  phases: string[]
  status: RunStatus
  startedAt: number
  endedAt?: number
  agents: WorkflowAgent[]
}

declare module 'claude-code' {
  interface PluginState {
    'workflow-mod': {
      runs: Shaped<WorkflowRun[]>
      frame: number
    }
  }
}
