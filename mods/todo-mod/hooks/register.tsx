// todo-mod: 저장소(git 루트)별 할 일 패널.
// 지인이 공유한 session-todo를 바탕으로, 목록을 세션이 아니라 저장소 단위로 $.store에 남기게 바꿨다.
import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { Todo, TodoStatus } from '../types'

const PANE = 'todo-mod'
const TOOL = 'mcp__todo-mod__todo'
const ROOT_POLL_MS = 2000

const todos = atom({ plugin: 'todo-mod', key: 'todos' } as const, [], { shape: 'todos-1' })
const current = atom({ plugin: 'todo-mod', key: 'current' } as const, '', { shape: 'current-1' })
// 지금 목록이 속한 저장소의 루트(절대 경로). 비어 있으면 아직 불러오지 않은 것이다.
const repo = atom({ plugin: 'todo-mod', key: 'repo' } as const, '', { shape: 'repo-1' })

const storeKey = (root: string) => `todos:${root}`
const baseName = (path: string) => path.split('/').filter(Boolean).pop() ?? path
const titleOf = (root: string) => (root ? `할 일 · ${baseName(root)}` : '할 일')

const TITLE_MAX = 60
const toTitle = (text: string) => {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX)}…` : line
}
const hasText = (list: readonly Todo[], text: string) =>
  list.some(todo => todo.status !== 'done' && todo.text === text)

const catMood = (doing: number, pending: number, done: number) => {
  if (doing > 0) return { face: '( o.o )', line: '집중하는 중이냥', color: 'claude' }
  if (pending > 0) return { face: '( ･ω･ )', line: `할 일 ${pending}개 남았다냥`, color: 'suggestion' }
  if (done > 0) return { face: '( ^ω^ )', line: '다 끝냈다냥!', color: 'success' }
  return { face: '( -.- )', line: 'zZ 할 일이 없다냥', color: 'inactive' }
}

const MARK: Record<TodoStatus, string> = { pending: '☐', doing: '▶', done: '✔' }
const NEXT_STATUS: Record<TodoStatus, TodoStatus> = { pending: 'doing', doing: 'done', done: 'pending' }

const nextId = (list: readonly Todo[]) => list.reduce((max, todo) => Math.max(max, todo.id), 0) + 1
const addTodo = (list: readonly Todo[], text: string, status: TodoStatus = 'pending') => [
  ...list,
  { id: nextId(list), text, status },
]
const setStatus = (list: readonly Todo[], id: number, status: TodoStatus) =>
  list.map(todo => (todo.id === id ? { ...todo, status } : todo))
const removeTodo = (list: readonly Todo[], id: number) => list.filter(todo => todo.id !== id)

const format = (list: readonly Todo[]) =>
  list.length === 0 ? '(비어 있음)' : list.map(todo => `${MARK[todo.status]} #${todo.id} ${todo.text}`).join('\n')

const TOOL_DESCRIPTION = [
  '이 저장소의 할 일 목록(사용자 옆 패널에 보이고, 세션이 바뀌어도 남는다)을 관리한다.',
  'op: add(text 필요, status 선택: pending|doing), start(id: 진행 중으로), done(id), remove(id), list.',
  '여러 단계 작업을 시작할 때 단계를 add 한다. 작업 도중 사용자가 다른 요청을 하면,',
  '진행 중이던 작업이 목록에 없으면 먼저 add 하고 새 요청도 add 한 뒤 처리한다.',
  '한 항목을 끝내면 즉시 done 하고, 남은 항목으로 돌아간다.',
].join(' ')

// 세션의 프로젝트 루트에서 git 최상위 폴더를 찾는다. git 저장소가 아니면 프로젝트 루트를 그대로 쓴다.
const findRepo = async ($: Engine) => {
  const root = await $.session.root()
  try {
    const { exitCode, stdout } = await $.process.run(['git', 'rev-parse', '--show-toplevel'], {
      cwd: root,
      timeoutMs: 5000,
    })
    const top = stdout.trim()
    if (exitCode === 0 && top) return top
  } catch {
    // git이 없거나 실행할 수 없으면 프로젝트 루트로 대신한다.
  }
  return root
}

// 저장소가 바뀌었으면(처음 시작, /cd, worktree 이동) 그 저장소의 목록을 불러온다.
// 바뀌었으면 true를 돌려준다.
const syncRepo = async ($: Engine) => {
  const found = await findRepo($)
  if (found === (await read($, repo))) return false
  const saved = await $.store.get(storeKey(found))
  await update($, repo, () => found)
  await update($, todos, () => (Array.isArray(saved) ? (saved as Todo[]) : []))
  return true
}

// 목록을 바꾸고 저장소별 저장 공간에도 쓴다.
const change = async ($: Engine, fn: (list: readonly Todo[]) => readonly Todo[]) => {
  await update($, todos, list => [...fn(list)])
  const root = await read($, repo)
  if (root) await $.store.set(storeKey(root), await read($, todos))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await syncRepo($)
    await $.command.register({
      name: 'todo-mod',
      description: '할 일 패널 열기 · /todo-mod <내용> 추가 · /todo-mod done|start|rm <번호> · /todo-mod clear',
    })
    await $.tool.register({
      name: 'todo',
      description: TOOL_DESCRIPTION,
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'start', 'done', 'remove', 'list'] },
          text: { type: 'string' },
          id: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'doing'] },
        },
        required: ['op'],
      },
    })
    void $.ui.open({ id: PANE, title: titleOf(await read($, repo)) })
    // /cd, worktree 이동처럼 프로젝트 루트가 바뀌면 프롬프트를 기다리지 않고 바꾼다.
    // /cd는 mod에 CwdChanged를 보내지 않아서(2026-11-20 실측) 2초마다 루트를 확인한다.
    // git은 루트가 바뀌었을 때만 실행한다.
    let lastRoot = await $.session.root()
    $.clock.every(ROOT_POLL_MS, async () => {
      const root = await $.session.root()
      if (root === lastRoot) return
      lastRoot = root
      if (await syncRepo($)) void $.ui.open({ id: PANE, title: titleOf(await read($, repo)) })
    })
    return started
  })

  on('command.run', { command: 'todo-mod' }, async ($, e) => {
    await syncRepo($)
    const args = e.args.trim()
    const [verb = '', rest = ''] = args.split(/\s+(.*)/s)
    const id = Number(rest)
    const opened = await $.ui.open({ id: PANE, title: titleOf(await read($, repo)) })
    const notPlaced = opened.isPlaced ? '' : `\n(패널을 표시하지 못함: ${opened.reason ?? '알 수 없음'})`

    if (args === '') return { text: format(await read($, todos)) + notPlaced }
    if (verb === 'clear') {
      await change($, list => list.filter(todo => todo.status !== 'done'))
    } else if (verb === 'done' || verb === 'start' || verb === 'rm') {
      if (!(await read($, todos)).some(todo => todo.id === id)) return { text: `#${rest} 항목이 없습니다.` }
      await change($, list =>
        verb === 'rm' ? removeTodo(list, id) : setStatus(list, id, verb === 'done' ? 'done' : 'doing'),
      )
    } else {
      await change($, list => addTodo(list, args))
    }
    const list = await read($, todos)
    return {
      text: format(list) + notPlaced,
      context: [`사용자가 저장소 할 일 목록을 수정했다. 현재 목록:\n${format(list)}`],
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    await syncRepo($)
    const input = e as { op?: string; text?: string; id?: number; status?: TodoStatus }
    const list = await read($, todos)
    const hasId = typeof input.id === 'number' && list.some(todo => todo.id === input.id)

    if (input.op === 'add') {
      const text = input.text?.trim()
      if (!text) return { deny: 'add 에는 text 가 필요합니다.' }
      await change($, items => addTodo(items, text, input.status === 'doing' ? 'doing' : 'pending'))
    } else if (input.op === 'start' || input.op === 'done' || input.op === 'remove') {
      if (!hasId) return { deny: `#${input.id} 항목이 없습니다.\n${format(list)}` }
      const id = input.id as number
      await change($, items =>
        input.op === 'remove' ? removeTodo(items, id) : setStatus(items, id, input.op === 'start' ? 'doing' : 'done'),
      )
    } else if (input.op !== 'list') {
      return { deny: `알 수 없는 op: ${input.op}` }
    }
    return { result: format(await read($, todos)) }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || (e.origin && e.origin.kind !== 'composer')) return next(e)
    await syncRepo($)
    const title = toTitle(e.text)

    if (e.turnId === undefined) {
      await update($, current, () => title)
    } else if (title) {
      // 작업 도중 들어온 요청: 진행 중이던 요청과 새 요청을 목록에 올린다.
      const running = await read($, current)
      await change($, list => {
        const withRunning = running && !hasText(list, running) ? addTodo(list, running, 'doing') : list
        return hasText(withRunning, title) ? withRunning : addTodo(withRunning, title)
      })
      void $.ui.toast(`할 일에 추가: ${title}`)
    }
    const open = (await read($, todos)).filter(todo => todo.status !== 'done')
    if (open.length === 0) return next(e)
    const note = [
      '<todo-mod>',
      '이 저장소 할 일 목록의 미완료 항목:',
      format(open),
      '이 요청이 위 항목과 별개의 작업이면 todo 도구로 add 한 뒤 처리하고,',
      '처리가 끝나면 미완료 항목으로 돌아가 이어서 진행한다. 위 항목을 임의로 버리지 않는다.',
      '</todo-mod>',
    ].join('\n')
    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, todos)
    const root = await read($, repo)
    const header = (
      <Box flexDirection="row" paddingX={1} marginTop={1} marginBottom={1}>
        <Text dimColor>저장소 </Text>
        <Text bold>{root ? baseName(root) : '(확인 중)'}</Text>
      </Box>
    )
    const doing = list.filter(todo => todo.status === 'doing')
    const pending = list.filter(todo => todo.status === 'pending')
    const done = list.filter(todo => todo.status === 'done')
    const doneCount = done.length

    const row = (todo: Todo) => (
      <Box flexDirection="row">
        <Button
          key={`toggle-${todo.id}`}
          plain
          label={MARK[todo.status]}
          onPress={() => change($, items => setStatus(items, todo.id, NEXT_STATUS[todo.status]))}
        />
        <Box flexGrow={1} flexShrink={1} paddingX={1}>
          <Text wrap="wrap" bold={todo.status === 'doing'} dimColor={todo.status === 'done'}>
            {todo.id}. {todo.text}
          </Text>
        </Box>
        <Button
          key={`remove-${todo.id}`}
          plain
          dimColor
          label="×"
          onPress={() => change($, items => removeTodo(items, todo.id))}
        />
      </Box>
    )

    const card = (title: string, color: string, items: Todo[]) => (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
        <Text bold color={color}>
          {title}
        </Text>
        {items.map(row)}
      </Box>
    )

    const mood = catMood(doing.length, pending.length, doneCount)
    const cat = (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text color={mood.color}>{' /\\_/\\'}</Text>
        <Text color={mood.color}>
          {mood.face} <Text bold>{mood.line}</Text>
        </Text>
        <Text color={mood.color}>{' > ^ <'}</Text>
      </Box>
    )

    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          {header}
          <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text>할 일이 없습니다.</Text>
            <Text>/todo-mod &lt;내용&gt; 으로 추가하세요.</Text>
          </Box>
          {cat}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        {doing.length > 0 && card(`▶ 진행 중 (${doing.length})`, 'claude', doing)}
        {pending.length > 0 && card(`☐ 대기 (${pending.length})`, 'suggestion', pending)}
        {doneCount > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="success" paddingX={1}>
            <Box flexDirection="row">
              <Box flexGrow={1}>
                <Text bold color="success">
                  ✔ 완료 ({doneCount})
                </Text>
              </Box>
              <Button
                key="clear-done"
                plain
                label="완료 정리"
                onPress={() => change($, items => items.filter(todo => todo.status !== 'done'))}
              />
            </Box>
            {done.map(row)}
          </Box>
        )}
        {cat}
      </Box>
    )
  })
}
