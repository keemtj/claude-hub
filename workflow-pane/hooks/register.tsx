import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentStatus, WorkflowAgent, WorkflowRun } from '../types'

const PANE = 'workflow-pane'
const TITLE = 'Workflow'
// Change the tag when a run's fields change: it declines what an earlier
// version stored, which outlives a reload.
const runs = atom({ plugin: 'workflow-pane', key: 'runs' } as const, [], {
  shape: 'runs-1',
})
const frame = atom({ plugin: 'workflow-pane', key: 'frame' } as const, 0)

const PHASE_COLORS = ['magenta', 'cyan', 'yellow', 'green', 'blue', 'red']
const STATUS_LOOK: Record<AgentStatus, { mark: string; color: string }> = {
  starting: { mark: '◌', color: 'gray' },
  running: { mark: '●', color: 'yellow' },
  done: { mark: '✔', color: 'green' },
  failed: { mark: '✘', color: 'red' },
}

// A small orange critter: walks while agents run, cheers when all are done.
const WALK = [
  [' ▗▄▄▄▖ ', ' ▐▘▘▝▌ ', ' ▝▖ ▗▘ '],
  [' ▗▄▄▄▖ ', ' ▐▘▘▝▌ ', ' ▗▘ ▝▖ '],
]
const CHEER = ['▝▗▄▄▄▖▘', ' ▐▀▀▀▌ ', ' ▝▘ ▝▘ ']
const IDLE = [' ▗▄▄▄▖ ', ' ▐▬ ▬▌ ', ' ▝▘ ▝▘ ']

const isActive = (agent: WorkflowAgent) =>
  agent.status === 'starting' || agent.status === 'running'

// meta is a pure literal, so its name and phase titles can be read from the text.
function readMeta(script: string): { name?: string; phases: string[] } {
  const meta = script.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? script
  const name = meta.match(/name\s*:\s*['"`]([^'"`]+)['"`]/)?.[1]
  const phaseBlock = meta.match(/phases\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const phases = [...phaseBlock.matchAll(/title\s*:\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1] ?? '').filter(Boolean)
  return { name, phases }
}

function elapsed(from: number, to: number) {
  const s = Math.max(0, Math.round((to - from) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

let stopTicking: (() => void) | undefined

// Animate only while some agent is active, so an idle pane costs nothing.
async function syncTicking($: EngineInterface) {
  const list = await read($, runs)
  const anyActive = list.some(run => run.agents.some(isActive))
  if (anyActive && !stopTicking) {
    const timer = $.clock.every(500, () => {
      void update($, frame, n => (n + 1) % 1000)
    })
    stopTicking = () => timer.cancel()
  } else if (!anyActive && stopTicking) {
    stopTicking()
    stopTicking = undefined
  }
}

function setAgent(
  list: WorkflowRun[],
  match: (agent: WorkflowAgent) => boolean,
  change: Partial<WorkflowAgent>,
) {
  return list.map(run => ({
    ...run,
    agents: run.agents.map(agent => (match(agent) ? { ...agent, ...change } : agent)),
  }))
}

export const register: Register = on => {
  stopTicking = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workflow-pane',
      description: '워크플로 진행 상황 패널을 연다',
    })
    return next(e)
  })

  on('command.run', { command: 'workflow-pane' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? '워크플로 패널을 열었습니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.' }
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const input = e as unknown as { script?: string; name?: string; scriptPath?: string }
    const meta = readMeta(input.script ?? '')
    const run: WorkflowRun = {
      toolUseId: e.tool_use_id ?? `wf-${Date.now()}`,
      name: meta.name ?? input.name ?? input.scriptPath?.split('/').pop() ?? 'workflow',
      phases: meta.phases,
      startedAt: Date.now(),
      agents: [],
    }
    await update($, runs, list => [...list, run].slice(-5))
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    if (!e.workflow) return next(e)
    const { runId, agentIndex } = e.workflow
    const agent: WorkflowAgent = {
      index: agentIndex,
      label: e.description || (e.prompt.split('\n')[0] ?? '').slice(0, 60),
      status: 'starting',
      startedAt: Date.now(),
    }
    await update($, runs, list => {
      let at = list.findIndex(run => run.runId === runId)
      if (at < 0) at = list.findIndex(run => run.toolUseId === e.tool_use_id && !run.runId)
      if (at < 0) at = list.length - 1
      if (at < 0) {
        return [{ toolUseId: e.tool_use_id, runId, name: 'workflow', phases: [], startedAt: Date.now(), agents: [agent] }]
      }
      return list.map((run, i) =>
        i === at
          ? { ...run, runId, agents: [...run.agents.filter(a => a.index !== agentIndex), agent] }
          : run,
      )
    })
    await syncTicking($)

    const started = await next(e)
    await update($, runs, list =>
      setAgent(
        list,
        a => a.index === agentIndex && a.startedAt === agent.startedAt,
        started.deny
          ? { status: 'failed', endedAt: Date.now() }
          : { status: 'running', agentId: started.agentId },
      ),
    )
    await syncTicking($)
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const agentId = (e as unknown as { agentId?: string }).agentId
    if (agentId) {
      const ok = (e as unknown as { reason?: string }).reason === 'answered'
      await update($, runs, list =>
        setAgent(list, a => a.agentId === agentId && isActive(a), {
          status: ok ? 'done' : 'failed',
          endedAt: Date.now(),
        }),
      )
      await syncTicking($)
    }
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, runs)
    const tick = await read($, frame)
    const now = Date.now()
    const run = list[list.length - 1]

    if (!run) {
      return (
        <Box flexDirection="column">
          {IDLE.map(line => <Text color="claude">{line}</Text>)}
          <Text dimColor>아직 실행한 워크플로가 없습니다.</Text>
        </Box>
      )
    }

    const agents = [...run.agents].sort((a, b) => a.index - b.index)
    const active = agents.filter(isActive).length
    const finished = agents.filter(a => a.status === 'done').length
    const failed = agents.filter(a => a.status === 'failed').length
    const art = active > 0 ? (WALK[tick % WALK.length] ?? IDLE) : agents.length > 0 ? CHEER : IDLE
    const mood =
      active > 0 ? `${active}개 진행 중…` : failed > 0 ? `끝남 (실패 ${failed})` : agents.length > 0 ? '모두 끝!' : '준비 중'
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 10 - (run.phases.length > 0 ? 2 : 0))

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="column">
            {art.map(line => <Text color="claude">{line}</Text>)}
          </Box>
          <Box flexDirection="column">
            <Text bold color="magenta">{run.name}</Text>
            <Text color={active > 0 ? 'yellow' : failed > 0 ? 'red' : 'green'}>{mood}</Text>
            <Text dimColor>
              ✔ {finished} · ✘ {failed} · {elapsed(run.startedAt, now)}
            </Text>
          </Box>
        </Box>
        {run.phases.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
            {run.phases.map((phase, i) => (
              <Text color={PHASE_COLORS[i % PHASE_COLORS.length]}>■ {phase}</Text>
            ))}
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          {agents.length === 0 && <Text dimColor>에이전트를 기다리는 중</Text>}
          {agents.slice(-room).map(agent => {
            const look = STATUS_LOOK[agent.status]
            const spin = agent.status === 'running' && tick % 2 === 1 ? '○' : look.mark
            return (
              <Text>
                <Text color={look.color}>{spin}</Text>
                <Text color={PHASE_COLORS[(agent.index - 1) % PHASE_COLORS.length]}> #{agent.index} </Text>
                <Text dimColor={agent.status === 'done'}>{agent.label}</Text>
                <Text dimColor> {elapsed(agent.startedAt, agent.endedAt ?? now)}</Text>
              </Text>
            )
          })}
        </Box>
      </Box>
    )
  })
}
