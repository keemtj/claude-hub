import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PortRow, PortsView } from '../types'
import {
  findClaudeAncestor,
  isDescendant,
  parseArgs,
  parseCwds,
  parseListeners,
  parseParents,
  pidsWithSession,
  portOf,
  shortArgs,
} from './parse'

const PANE = 'session-ports'
const TITLE = 'Ports'
const REFRESH_MS = 5000
// Change the tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload.
const view = atom(
  { plugin: 'session-ports', key: 'view' } as const,
  { session: [], others: [], isShowingAll: false, isChecking: false },
  { shape: 'ports-1' },
)

let isRefreshing = false
let stopTimer: (() => void) | undefined

async function run($: EngineInterface, argv: string[]): Promise<string> {
  try {
    const { stdout } = await $.process.run(argv, { timeoutMs: 10000 })
    return stdout
  } catch {
    return ''
  }
}

async function refresh($: EngineInterface) {
  if (isRefreshing) return
  isRefreshing = true
  try {
    await update($, view, current => ({ ...current, isChecking: true }))
    const listeners = parseListeners(await run($, ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']))
    const pids = [...listeners.keys()]
    if (pids.length === 0) {
      await update($, view, current => ({ ...current, session: [], others: [], isChecking: false }))
      return
    }
    const list = pids.join(',')

    // This session: processes its commands started carry its id in their
    // environment; MCP servers and other children sit under its process.
    const sessionId = await $.session.id()
    const withId = pidsWithSession(await run($, ['ps', '-E', '-o', 'pid=,command=', '-p', list]), sessionId)
    const parents = parseParents(await run($, ['ps', '-axo', 'pid=,ppid=,comm=']))
    const me = Number((await run($, ['sh', '-c', 'echo $PPID'])).trim())
    const root = me ? findClaudeAncestor(me, parents) : undefined

    const args = parseArgs(await run($, ['ps', '-o', 'pid=,args=', '-p', list]))
    const cwds = parseCwds(await run($, ['lsof', '-a', '-d', 'cwd', '-F', 'pn', '-p', list]))
    const cwd = await $.session.cwd()
    const home = cwd.match(/^\/(?:Users|home)\/[^/]+/)?.[0]

    const session: PortRow[] = []
    const others: PortRow[] = []
    for (const listener of listeners.values()) {
      const ports = [...new Set(listener.addresses.map(portOf).filter((p): p is number => p !== undefined))].sort(
        (a, b) => a - b,
      )
      const isMine = withId.has(listener.pid)
      const isChild = !isMine && root !== undefined && listener.pid !== root && isDescendant(listener.pid, root, parents)
      const where = cwds.get(listener.pid)
      const row: PortRow = {
        pid: listener.pid,
        addresses: listener.addresses,
        ports,
        name: listener.name,
        args: shortArgs(args.get(listener.pid) ?? listener.name, home),
        cwd: where && home ? where.replace(home, '~') : where,
        origin: isMine ? 'command' : isChild ? 'child' : undefined,
      }
      if (isMine || isChild) session.push(row)
      else others.push(row)
    }
    const byPort = (a: PortRow, b: PortRow) => (a.ports[0] ?? 0) - (b.ports[0] ?? 0)
    await update($, view, current => ({
      ...current,
      session: session.sort(byPort),
      others: others.sort(byPort),
      isChecking: false,
    }))
  } catch {
    await update($, view, current => ({ ...current, isChecking: false }))
  } finally {
    isRefreshing = false
  }
}

async function isPaneShown($: EngineInterface) {
  const panes = await $.ui.panes().catch(() => [])
  return panes.some(pane => pane.id === PANE && pane.isPlaced)
}

// Look again every few seconds while the pane is on screen, and stop when it
// is not, so a closed pane runs no commands.
async function syncTimer($: EngineInterface) {
  const isShown = await isPaneShown($)
  if (isShown && !stopTimer) {
    const timer = $.clock.every(REFRESH_MS, () => {
      void isPaneShown($).then(shown => (shown ? refresh($) : syncTimer($)))
    })
    stopTimer = () => timer.cancel()
  } else if (!isShown && stopTimer) {
    stopTimer()
    stopTimer = undefined
  }
}

// What a browser can open: a wildcard or loopback address becomes localhost.
function urlFor(row: PortRow, port: number): string | undefined {
  const address = row.addresses.find(a => a.endsWith(`:${port}`)) ?? ''
  const host = address.slice(0, address.lastIndexOf(':'))
  if (host === '*' || host === '127.0.0.1' || host === '[::1]' || host === 'localhost') return `http://localhost:${port}`
  return undefined
}

export const register: Register = on => {
  isRefreshing = false
  stopTimer = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ports',
      description: '이 세션이 띄운 프로세스가 열어 둔 포트를 옆 패널에 보여 준다',
      argumentHint: '[close]',
    })
    return next(e)
  })

  on('command.run', { command: 'ports' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      await syncTimer($)
      return { text: '포트 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: "transparent" })
    await refresh($)
    await syncTimer($)
    return {
      text: opened.isPlaced ? '포트 패널을 열었습니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    void $.clock.after(0, () => void syncTimer($))
    return closed
  })

  // A command that starts or stops a server shows up at once.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (await isPaneShown($)) void refresh($)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const current: PortsView = await read($, view)
    const toggleAll = () => void update($, view, v => ({ ...v, isShowingAll: !v.isShowingAll }))

    const rowOf = (row: PortRow, isDim: boolean) => (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          {row.ports.map((port, i) => {
            const url = urlFor(row, port)
            return (
              <Text>
                {i > 0 ? ' ' : ''}
                <Text bold color={isDim ? 'gray' : 'cyan'}>:{port}</Text>
                {url && !isDim ? <Text> </Text> : null}
                {url && !isDim ? <Link href={url} label="열기" /> : null}
              </Text>
            )
          })}
          <Text dimColor>  {row.name} · pid {row.pid}</Text>
          {row.origin === 'child' ? <Text dimColor> · 세션 자식</Text> : null}
        </Text>
        <Text dimColor>{'  '}{row.args}</Text>
        {row.cwd ? <Text dimColor>{'  '}{row.cwd}</Text> : null}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold color="claude">이 세션의 포트</Text>
          <Box flexGrow={1} />
          <Button key="refresh" onPress={() => void refresh($)}>새로고침</Button>
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Text backgroundColor="cyan" color="black"> 세션 {current.session.length} </Text>
          <Text backgroundColor="gray" color="black"> 그 밖 {current.others.length} </Text>
          {current.isChecking && <Text backgroundColor="yellow" color="black"> 확인 중… </Text>}
        </Box>
        {current.session.length === 0 && (
          <Text dimColor>{'\n'}이 세션이 열어 둔 포트가 없습니다.</Text>
        )}
        {current.session.map(row => rowOf(row, false))}
        <Box marginTop={1}>
          <Button key="all" plain onPress={toggleAll}>
            {current.isShowingAll ? '▾ 다른 프로세스의 포트 숨기기' : `▸ 다른 프로세스의 포트 ${current.others.length}개 보기`}
          </Button>
        </Box>
        {current.isShowingAll && current.others.map(row => rowOf(row, true))}
      </Box>
    )
  })
}
