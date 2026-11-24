import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'todo-mod',
  component: 'Pane',
  requestId: 'todo-mod',
  props: {
    title: '할 일',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const TOOL = 'mcp__todo-mod__todo'

// 엔진 대신 답하는 훅들. store는 테스트 사이에서 공유하지 않도록 매번 새로 만든다.
const engine = (
  on: any,
  opts: { root: string | (() => string); store?: Map<string, unknown>; opened?: string[] },
) => {
  const rootOf = () => (typeof opts.root === 'function' ? opts.root() : opts.root)
  const store = opts.store ?? new Map<string, unknown>()
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'todo-mod' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', (_: unknown, e: { title: string }) => {
    opts.opened?.push(e.title)
    return { value: { isPlaced: true } }
  })
  on('ui.toast', () => ({ value: {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: rootOf() }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${rootOf()}\n`, stderr: '' } }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  return { store, clock }
}

test('모델이 할 일을 추가·완료하고, 미완료 항목이 새 프롬프트에 함께 실린다', async ($, on) => {
  engine(on, { root: '/repo/a' })
  let seen: readonly string[] | undefined
  on('prompt.submit', (_, e) => {
    seen = e.context
    return { text: e.text }
  })

  await $.session.start({ cwd: '/repo/a', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, op: 'add', text: '그리드 컬럼 추가', status: 'doing' })
  await $.tool.call({ tool: TOOL, op: 'add', text: '버튼 커서 수정' })
  await $.tool.call({ tool: TOOL, op: 'done', id: 2 })

  await $.prompt.submit({ text: '다른 질문 하나' })
  expect(seen?.[0]).toContain('▶ #1 그리드 컬럼 추가')
  expect(seen?.[0]).not.toContain('버튼 커서 수정')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /그리드/ }))?.text).toContain('그리드 컬럼 추가')
  expect((await ui.find({ type: 'Text', text: /진행 중/ }))?.text).toContain('1')
  await ui.unmount()
})

test('작업 도중 들어온 요청은 진행 중이던 요청과 함께 목록에 오른다', async ($, on) => {
  engine(on, { root: '/repo/a' })
  let seen: readonly string[] | undefined
  on('prompt.submit', (_, e) => {
    seen = e.context
    return { text: e.text }
  })
  const composer = { kind: 'composer' } as const

  await $.session.start({ cwd: '/repo/a', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: '그리드 컬럼 추가해줘\n상세 내용', origin: composer })
  expect(seen).toBeUndefined()

  await $.prompt.submit({ text: '버튼 커서도 고쳐줘', origin: composer, turnId: 't1' })
  expect(seen?.[0]).toContain('▶ #1 그리드 컬럼 추가해줘')
  expect(seen?.[0]).toContain('☐ #2 버튼 커서도 고쳐줘')

  await $.prompt.submit({ text: '버튼 커서도 고쳐줘', origin: composer, turnId: 't1' })
  expect(seen?.[0]).not.toContain('#3')
})

test('목록은 저장소 루트별로 저장되고, 새 세션에서 다시 불러온다', async ($, on) => {
  const { store } = engine(on, { root: '/repo/a' })
  await $.session.start({ cwd: '/repo/a', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, op: 'add', text: '어제 남은 일' })

  expect(store.get('todos:/repo/a')).toEqual([{ id: 1, text: '어제 남은 일', status: 'pending' }])
  expect(store.has('todos:/repo/b')).toBe(false)
})

test('이전 세션이 저장한 목록을 세션 시작 때 불러온다', async ($, on) => {
  const store = new Map<string, unknown>([['todos:/repo/a', [{ id: 7, text: '이어서 할 일', status: 'doing' }]]])
  engine(on, { root: '/repo/a', store })
  await $.session.start({ cwd: '/repo/a', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /이어서/ }))?.text).toContain('7. 이어서 할 일')
  await ui.unmount()
})

test('목록이 비면 고양이가 잔다', async ($, on) => {
  engine(on, { root: '/repo/a' })
  await $.session.start({ cwd: '/repo/a', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /_\// }))?.text).toBe(' /\\_/\\')
  expect((await ui.find({ type: 'Text', text: /할 일이 없다냥/ }))?.text).toContain('( -.- )')
  await ui.unmount()
})

test('작업 위치가 바뀌면 프롬프트 없이 바로 그 저장소의 목록으로 바뀐다', async ($, on) => {
  let root = '/repo/a'
  const store = new Map<string, unknown>([['todos:/repo/b', [{ id: 1, text: 'b 저장소 일', status: 'pending' }]]])
  const opened: string[] = []
  const { clock } = engine(on, { root: () => root, store, opened })

  await $.session.start({ cwd: '/repo/a', surface: 'terminal', isInteractive: true })
  root = '/repo/b'
  await clock.advance(2000)

  expect(opened.at(-1)).toBe('할 일 · b')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /b 저장소/ }))?.text).toContain('1. b 저장소 일')
  await ui.unmount()
})

test('패널 맨 위에 지금 저장소의 폴더 이름을 보여 준다', async ($, on) => {
  engine(on, { root: '/Users/me/work/claude-hub' })
  await $.session.start({ cwd: '/Users/me/work/claude-hub', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^claude-hub$/ }))?.text).toBe('claude-hub')
  await ui.unmount()
})
