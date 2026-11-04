import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentStatus, RunStatus, WorkflowAgent, WorkflowRun } from '../types'

const PANE = 'workflow-pane'
const TITLE = 'Workflow'
// Change the tag when a run's fields change: it declines what an earlier
// version stored, which outlives a reload.
const runs = atom({ plugin: 'workflow-pane', key: 'runs' } as const, [], {
  shape: 'runs-2',
})
const frame = atom({ plugin: 'workflow-pane', key: 'frame' } as const, 0)

const PHASE_COLORS = ['magenta', 'cyan', 'yellow', 'green', 'blue', 'red']
const STATUS_LOOK: Record<AgentStatus, { mark: string; color: string }> = {
  starting: { mark: '◌', color: 'gray' },
  running: { mark: '●', color: 'yellow' },
  done: { mark: '✔', color: 'green' },
  failed: { mark: '✘', color: 'red' },
}
const STATUS_RANK: Record<AgentStatus, number> = { starting: 0, running: 1, done: 2, failed: 2 }

// Clawd, as on Claude Code's welcome screen: walks while agents run, raises
// its arms when all are done, squints when something failed.
const IDLE = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']
const WALK = [IDLE, [' ▐▛███▜▌ ', '▝▜█████▛▘', '   ▘▘ ▝▝ ']]
const CHEER = ['▗▐▛███▜▌▖', ' ▜█████▛ ', '  ▘▘ ▝▝  ']
const SAD = [' ▐▙███▟▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']

// The resting scene: Clawd drifting among twinkling stars.
const SPACE_W = 21
const SPACE_H = 6
const SPRITE_COL = 6
const STARS: { row: number; col: number; color: string }[] = [
  { row: 0, col: 1, color: 'white' },
  { row: 0, col: 12, color: 'cyan' },
  { row: 1, col: 18, color: 'magenta' },
  { row: 2, col: 0, color: 'cyan' },
  { row: 3, col: 17, color: 'white' },
  { row: 4, col: 3, color: 'magenta' },
  { row: 5, col: 10, color: 'white' },
  { row: 5, col: 19, color: 'cyan' },
]
const TWINKLE = ['·', '✧', '✦', '✧', '·', ' ']

type Cell = { ch: string; color?: string }

// Rows of colored runs: the stars first, the sprite over them.
function spaceScene(sprite: string[], tick: number): { text: string; color?: string }[][] {
  const grid: Cell[][] = Array.from({ length: SPACE_H }, () =>
    Array.from({ length: SPACE_W }, () => ({ ch: ' ' })),
  )
  STARS.forEach((star, i) => {
    const row = grid[star.row]
    if (row) row[star.col] = { ch: TWINKLE[(tick + i * 2) % TWINKLE.length] ?? '·', color: star.color }
  })
  // Drift one row up and down, a step every two ticks.
  const top = 1 + (Math.floor(tick / 2) % 4 < 2 ? 0 : 1)
  sprite.forEach((line, r) => {
    const row = grid[top + r]
    if (!row) return
    ;[...line].forEach((ch, c) => {
      if (ch !== ' ') row[SPRITE_COL + c] = { ch, color: 'claude' }
    })
  })
  return grid.map(row => {
    const runs: { text: string; color?: string }[] = []
    for (const cell of row) {
      const last = runs[runs.length - 1]
      if (last && last.color === cell.color) last.text += cell.ch
      else runs.push({ text: cell.ch, color: cell.color })
    }
    return runs
  })
}

// Run files: read every SYNC_EVERY ticks while something runs.
const TICK_MS = 500
const SYNC_EVERY = 10

const isActive = (agent: WorkflowAgent) =>
  agent.status === 'starting' || agent.status === 'running'

// meta is a pure literal, so its name and phase titles can be read from the text.
function readMeta(script: string): { name?: string; phases: string[] } {
  const meta = script.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? script
  const name = meta.match(/name\s*:\s*['"`]([^'"`]+)['"`]/)?.[1]
  const phaseBlock = meta.match(/phases\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const phases = [...phaseBlock.matchAll(/title\s*:\s*['"`]([^'"`]+)['"`]/g)]
    .map(m => m[1] ?? '')
    .filter(Boolean)
  return { name, phases }
}

function elapsed(from: number, to: number) {
  const s = Math.max(0, Math.round((to - from) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

function phaseColor(run: WorkflowRun, phase: string | undefined) {
  const at = phase ? run.phases.indexOf(phase) : -1
  return at < 0 ? 'gray' : (PHASE_COLORS[at % PHASE_COLORS.length] ?? 'gray')
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

// ---- Run files ------------------------------------------------------------
// Not a documented format: the workflow engine leaves these under the session
// folder (~/.claude/projects/<cwd slug>/<session id>/). Every read is allowed to
// fail; the live events keep the pane going without them.

let sessionDir: string | undefined

async function findSessionDir($: EngineInterface): Promise<string | undefined> {
  if (sessionDir) return sessionDir
  try {
    const id = await $.session.id()
    const cwd = await $.session.cwd()
    const home = cwd.match(/^\/(?:Users|home)\/[^/]+/)?.[0]
    if (!home) return undefined
    const projects = `${home}/.claude/projects`
    const guess = `${projects}/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${id}`
    if (await $.fs.exists(guess)) return (sessionDir = guess)
    for (const entry of await $.fs.list(projects)) {
      const dir = `${projects}/${entry.name}/${id}`
      if (entry.kind === 'dir' && (await $.fs.exists(dir))) return (sessionDir = dir)
    }
  } catch {}
  return undefined
}

type JournalLine = { type?: string; agentId?: string; label?: string; phase?: string }
type ProgressRow = {
  type?: string
  index?: number
  label?: string
  phaseTitle?: string
  agentId?: string
  state?: string
  startedAt?: number
  endedAt?: number
}
type RunFile = {
  status?: string
  startTime?: number
  durationMs?: number
  workflowName?: string
  phases?: { title?: string }[]
  workflowProgress?: ProgressRow[]
}

async function readText($: EngineInterface, path: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

async function readRun($: EngineInterface, dir: string, runId: string, mtimeMs: number) {
  const run: WorkflowRun = {
    toolUseId: runId,
    runId,
    name: 'workflow',
    phases: [],
    status: 'running',
    startedAt: mtimeMs,
    agents: [],
  }

  const scripts = await $.fs.list(`${dir}/workflows/scripts`).catch(() => [])
  const script = scripts.find(entry => entry.name.endsWith(`-${runId}.js`))
  if (script) {
    if (script.mtimeMs) run.startedAt = script.mtimeMs
    const meta = readMeta((await readText($, `${dir}/workflows/scripts/${script.name}`)) ?? '')
    run.name = meta.name ?? script.name.replace(`-${runId}.js`, '')
    run.phases = meta.phases
  }

  // An agent's meta file is written as it starts: its time is the start time.
  const files = await $.fs.list(`${dir}/subagents/workflows/${runId}`).catch(() => [])
  const startOf = (agentId: string) =>
    files.find(entry => entry.name === `agent-${agentId}.meta.json`)?.mtimeMs || run.startedAt

  const journal = (await readText($, `${dir}/subagents/workflows/${runId}/journal.jsonl`)) ?? ''
  for (const line of journal.split('\n')) {
    let row: JournalLine
    try {
      row = JSON.parse(line) as JournalLine
    } catch {
      continue
    }
    if (row.type === 'started' && row.agentId) {
      run.agents.push({
        index: run.agents.length + 1,
        agentId: row.agentId,
        label: row.label ?? row.agentId,
        phase: row.phase,
        status: 'running',
        startedAt: startOf(row.agentId),
      })
    } else if (row.type === 'result' && row.agentId) {
      const agent = run.agents.find(a => a.agentId === row.agentId)
      if (agent) agent.status = 'done'
    }
  }

  // The finished run's summary is the most complete record when it exists.
  const summary = await readText($, `${dir}/workflows/${runId}.json`)
  if (summary) {
    try {
      const file = JSON.parse(summary) as RunFile
      run.name = file.workflowName ?? run.name
      if (file.phases?.length) run.phases = file.phases.map(p => p.title ?? '').filter(Boolean)
      run.status = file.status === 'completed' ? 'completed' : 'failed'
      if (file.startTime) run.startedAt = file.startTime
      if (file.startTime && file.durationMs) run.endedAt = file.startTime + file.durationMs
      const rows = (file.workflowProgress ?? []).filter(row => row.type === 'workflow_agent')
      if (rows.length > 0) {
        run.agents = rows.map((row, i) => ({
          index: row.index ?? i + 1,
          agentId: row.agentId,
          label: row.label ?? `agent ${i + 1}`,
          phase: row.phaseTitle,
          status: row.state === 'done' ? 'done' : row.state === 'running' ? 'running' : 'failed',
          startedAt: row.startedAt ?? run.startedAt,
          endedAt: row.endedAt,
        }))
      }
    } catch {}
  } else if (run.agents.length > 0 && !run.agents.some(isActive)) {
    // Every agent so far has a result but the run has not written its summary:
    // the script is between agents, so the run still counts as running.
    run.status = 'running'
  }
  return run
}

// Fold what the files say into what the live events recorded, keeping the
// further-along status and the times the events measured.
function mergeRun(live: WorkflowRun | undefined, file: WorkflowRun): WorkflowRun {
  if (!live) return file
  const agents = file.agents.map(fileAgent => {
    const liveAgent = live.agents.find(a => a.agentId && a.agentId === fileAgent.agentId)
    if (!liveAgent) return fileAgent
    const status =
      STATUS_RANK[liveAgent.status] > STATUS_RANK[fileAgent.status] ? liveAgent.status : fileAgent.status
    return {
      ...fileAgent,
      status,
      startedAt: liveAgent.startedAt,
      endedAt: liveAgent.endedAt ?? fileAgent.endedAt,
    }
  })
  const extra = live.agents.filter(a => !a.agentId || !file.agents.some(f => f.agentId === a.agentId))
  return {
    ...file,
    toolUseId: live.toolUseId,
    startedAt: Math.min(live.startedAt, file.startedAt),
    phases: file.phases.length > 0 ? file.phases : live.phases,
    name: file.name !== 'workflow' ? file.name : live.name,
    agents: [...agents, ...extra.map((a, i) => ({ ...a, index: agents.length + i + 1 }))],
  }
}

async function syncFromFiles($: EngineInterface) {
  const dir = await findSessionDir($)
  if (!dir) return
  const entries = await $.fs.list(`${dir}/subagents/workflows`).catch(() => [])
  const recent = entries
    .filter(entry => entry.kind === 'dir' && entry.name.startsWith('wf_'))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .slice(-3)
  if (recent.length === 0) return
  const fromFiles = await Promise.all(recent.map(entry => readRun($, dir, entry.name, entry.mtimeMs)))
  await update($, runs, list => {
    let next = [...list]
    for (const file of fromFiles) {
      const at = next.findIndex(run => run.runId === file.runId)
      if (at >= 0) next[at] = mergeRun(next[at], file)
      else next.push(file)
    }
    next = next.sort((a, b) => a.startedAt - b.startedAt)
    return next.slice(-5)
  })
  await syncTicking($)
}

// ---- Animation -------------------------------------------------------------

let stopTicking: (() => void) | undefined

// Animate while a run is going or the pane is on screen (the space scene), and
// stop otherwise so a closed, idle pane costs nothing.
async function syncTicking($: EngineInterface) {
  const list = await read($, runs)
  const anyActive = list.some(run => run.status === 'running' || run.agents.some(isActive))
  const panes = await $.ui.panes().catch(() => [])
  const isShown = panes.some(pane => pane.id === PANE && pane.isPlaced)
  const shouldTick = anyActive || isShown
  if (shouldTick && !stopTicking) {
    let ticks = 0
    const timer = $.clock.every(TICK_MS, () => {
      void update($, frame, n => (n + 1) % 1000)
      ticks += 1
      if (ticks % SYNC_EVERY === 0) void syncWhileRunning($).catch(() => {})
    })
    stopTicking = () => timer.cancel()
  } else if (!shouldTick && stopTicking) {
    stopTicking()
    stopTicking = undefined
  }
}

async function syncWhileRunning($: EngineInterface) {
  const list = await read($, runs)
  if (list.some(run => run.status === 'running' || run.agents.some(isActive))) await syncFromFiles($)
  else await syncTicking($)
}

export const register: Register = on => {
  stopTicking = undefined
  sessionDir = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workflow-pane',
      description: '워크플로 진행 상황 패널을 연다 (close: 닫기)',
      argumentHint: '[close]',
    })
    const started = await next(e)
    // Fill in runs that began before this mod loaded.
    void syncFromFiles($).catch(() => {})
    return started
  })

  on('command.run', { command: 'workflow-pane' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      await syncTicking($)
      return { text: '워크플로 패널을 닫았습니다.' }
    }
    await syncFromFiles($).catch(() => {})
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    await syncTicking($)
    return {
      text: opened.isPlaced
        ? '워크플로 패널을 열었습니다.'
        : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const input = e as unknown as { script?: string; name?: string; scriptPath?: string }
    const meta = readMeta(input.script ?? '')
    const run: WorkflowRun = {
      toolUseId: e.tool_use_id ?? `wf-${Date.now()}`,
      name: meta.name ?? input.name ?? input.scriptPath?.split('/').pop() ?? 'workflow',
      phases: meta.phases,
      status: 'running',
      startedAt: Date.now(),
      agents: [],
    }
    await update($, runs, list => [...list, run].slice(-5))
    void $.ui.open({ id: PANE, title: TITLE })
    await syncTicking($)
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
      if (at < 0) {
        const fresh: WorkflowRun = {
          toolUseId: e.tool_use_id,
          runId,
          name: 'workflow',
          phases: [],
          status: 'running',
          startedAt: Date.now(),
          agents: [agent],
        }
        return [...list, fresh].slice(-5)
      }
      return list.map((run, i) =>
        i === at
          ? { ...run, runId, status: 'running' as RunStatus, agents: [...run.agents.filter(a => a.index !== agentIndex), agent] }
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
    // The journal names the agent's phase, which the event does not carry.
    void syncFromFiles($).catch(() => {})
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) {
      const ok = e.reason === 'answer'
      await update($, runs, list =>
        setAgent(list, a => a.agentId === e.agentId && isActive(a), {
          status: ok ? 'done' : 'failed',
          endedAt: Date.now(),
        }),
      )
      await syncTicking($)
    }
    return done
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    void $.clock.after(0, () => void syncTicking($))
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const close = () => void $.ui.close({ id: PANE })
    const list = await read($, runs)
    const tick = await read($, frame)
    const now = Date.now()
    const run = list[list.length - 1]

    if (!run) {
      return (
        <Box flexDirection="column">
          {spaceScene(IDLE, tick).map(row => (
            <Text>{row.map(part => <Text color={part.color}>{part.text}</Text>)}</Text>
          ))}
          <Text dimColor>아직 실행한 워크플로가 없습니다.</Text>
          <Button key="close" role="dismiss" onPress={close}>닫기</Button>
        </Box>
      )
    }

    const agents = [...run.agents].sort((a, b) => a.index - b.index)
    const active = agents.filter(isActive).length
    const finished = agents.filter(a => a.status === 'done').length
    const failed = agents.filter(a => a.status === 'failed').length
    const going = run.status === 'running'
    const art = going
      ? (WALK[tick % WALK.length] ?? IDLE)
      : run.status === 'failed' || failed > 0
        ? SAD
        : CHEER
    const mood = going
      ? active > 0
        ? `${active}개 진행 중…`
        : '다음 에이전트 준비 중…'
      : run.status === 'failed'
        ? '멈춤'
        : failed > 0
          ? `끝남 (실패 ${failed})`
          : '모두 끝!'

    // Group agents under the phase they belong to, in the script's order.
    const groups: { phase?: string; agents: WorkflowAgent[] }[] = []
    for (const phase of run.phases) {
      const inPhase = agents.filter(a => a.phase === phase)
      if (inPhase.length > 0) groups.push({ phase, agents: inPhase })
    }
    const unplaced = agents.filter(a => !a.phase || !run.phases.includes(a.phase))
    if (unplaced.length > 0) groups.push({ agents: unplaced })

    const room = Math.max(3, (e.viewport?.rows ?? 24) - 8 - groups.length)
    let shown = 0
    const fits = (n: number) => {
      shown += n
      return shown <= room
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="column">
            {going
              ? art.map(line => <Text color="claude">{line}</Text>)
              : spaceScene(art, tick).map(row => (
                  <Text>{row.map(part => <Text color={part.color}>{part.text}</Text>)}</Text>
                ))}
          </Box>
          <Box flexDirection="column">
            <Text bold color="magenta">{run.name}</Text>
            <Text color={going ? 'yellow' : failed > 0 || run.status === 'failed' ? 'red' : 'green'}>{mood}</Text>
            <Text dimColor>
              ✔ {finished} · ✘ {failed} · {elapsed(run.startedAt, run.endedAt ?? now)}
            </Text>
          </Box>
          <Box flexGrow={1} />
          <Button key="close" role="dismiss" onPress={close}>닫기</Button>
        </Box>
        {run.phases.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
            {run.phases.map(phase => {
              const inPhase = agents.filter(a => a.phase === phase)
              const allDone = inPhase.length > 0 && inPhase.every(a => !isActive(a))
              const now = inPhase.some(isActive)
              return (
                <Text color={phaseColor(run, phase)} bold={now} dimColor={!now && !allDone}>
                  {allDone ? '■' : now ? '▶' : '□'} {phase}
                </Text>
              )
            })}
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          {agents.length === 0 && <Text dimColor>에이전트를 기다리는 중</Text>}
          {groups.map(group =>
            fits(group.agents.length + 1) ? (
              <Box flexDirection="column">
                <Text color={phaseColor(run, group.phase)} bold>
                  {group.phase ?? '기타'}
                </Text>
                {group.agents.map(agent => {
                  const look = STATUS_LOOK[agent.status]
                  const spin = agent.status === 'running' && tick % 2 === 1 ? '○' : look.mark
                  return (
                    <Text>
                      <Text color={look.color}> {spin} </Text>
                      <Text dimColor={agent.status === 'done'}>{agent.label}</Text>
                      {agent.status !== 'done' || agent.endedAt ? (
                        <Text dimColor> {elapsed(agent.startedAt, agent.endedAt ?? now)}</Text>
                      ) : null}
                    </Text>
                  )
                })}
              </Box>
            ) : null,
          )}
          {shown > room && <Text dimColor>… 화면이 좁아 일부 단계를 숨겼습니다</Text>}
        </Box>
      </Box>
    )
  })
}
