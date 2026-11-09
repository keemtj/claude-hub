import type { CommandRunInput, On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'image-preview-mod',
  component: 'Pane',
  requestId: 'image-preview-mod',
  props: {
    title: 'Images',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// A 2x2 24-bit BMP, as `sips -s format bmp` would leave it.
const BMP = 'Qk1GAAAAAAAAADYAAAAoAAAAAgAAAP7///8BABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AP8AAAD/AAD///8AAA=='

// Where Claude Code keeps picture N of this session, and after how many
// looks it is there (it is written as the placeholder appears).
type Host = {
  opened: number
  files: Map<number, { path: string; after?: number }>
  looks: Map<number, number>
  sips: string[][]
  blitDeny?: string
}

const host = (files: [number, string, number?][] = [], blitDeny?: string): Host => ({
  opened: 0,
  files: new Map(files.map(([n, path, after]) => [n, { path, after }])),
  looks: new Map(),
  sips: [],
  blitDeny,
})

function engine(on: On, h: Host) {
  on('command.register', () => ({ value: { command: 'image-preview-mod' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'SID' }))
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.open', () => {
    h.opened += 1
    return { value: { isPlaced: true } }
  })
  on('ui.blit', () => ({ value: h.blitDeny ? { deny: h.blitDeny } : {} }))
  on('process.run', (_, e) => {
    const out = (exitCode: number, stdout = '') => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    const [cmd] = e.argv
    if (cmd === 'mktemp') return out(0, '/tmp/image-preview-mod.x\n')
    if (cmd === 'sh' && e.argv[2]?.includes('/images/')) {
      const sid = e.argv[4]
      const n = Number(e.argv[5])
      const looks = (h.looks.get(n) ?? 0) + 1
      h.looks.set(n, looks)
      const file = h.files.get(n)
      const ready = sid === 'SID' && file && looks >= (file.after ?? 1)
      return out(0, ready ? `${file.path}\n` : '')
    }
    if (cmd === 'sips') h.sips.push([...e.argv])
    return out(0)
  })
  on('fs.read', () => ({ value: { base64: BMP } }))
  on('prompt.edit', (_, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    return { text, cursor: e.start + e.inputText.length }
  })
  on('prompt.change', (_, e) => ({ text: e.text }))
}

const paste = (text: string, inputText: string) => ({
  origin: { kind: 'composer' as const },
  text,
  cursor: text.length,
  start: text.length,
  end: text.length,
  inputText,
})

type PromptEvents = {
  edit: (e: ReturnType<typeof paste>) => Promise<unknown>
  change: (e: { text: string; cursor: number; origin: { kind: 'clear' | 'engine' } }) => Promise<unknown>
}
// The test engine raises every event as $.<noun>.<verb>; its types leave
// these two out.
const prompt = ($: Parameters<TestBody>[0]) => $.prompt as unknown as PromptEvents

declare const setTimeout: (run: () => void, ms: number) => unknown

async function settle(find: () => Promise<unknown>) {
  for (let i = 0; i < 60; i += 1) {
    if (await find()) return
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
}

// Mount the pane again until `find` sees what it waits for.
async function pane($: Parameters<TestBody>[0], find: (ui: Awaited<ReturnType<typeof mount>>) => Promise<unknown>) {
  let ui = await mount($)
  await settle(async () => {
    await ui.unmount()
    ui = await mount($)
    return find(ui)
  })
  return ui
}
const mount = ($: Parameters<TestBody>[0]) => $.ui.mount({ ...PANE, surface: 'terminal' })

const PATH = '/tmp/claude-501/-proj/SID/images/1.jpg'

test('a pasted or dropped picture is drawn from the file Claude Code keeps for it', async ($, on) => {
  const h = host([[1, PATH]])
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('see ', '[Image #1]'))
  const ui = await pane($, ui => ui.find({ type: 'Image' }))
  const image = (await ui.find({ type: 'Image', key: 'image-1' })) as { props?: { source?: Record<string, unknown> } } | undefined
  expect(image?.props?.source?.width).toBe(2)
  expect(typeof image?.props?.source?.rgba).toBe('string')
  expect(h.sips.some(argv => argv.includes(PATH))).toBe(true)
  expect(h.opened).toBe(1)
  await ui.unmount()
})

test('a file written a moment after the placeholder is waited for', async ($, on) => {
  const h = host([[1, PATH, 3]])
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).change({ text: '[Image #1]', cursor: 10, origin: { kind: 'engine' } })
  const ui = await pane($, ui => ui.find({ type: 'Image' }))
  expect(await ui.find({ type: 'Image', key: 'image-1' })).toBeTruthy()
  expect(h.looks.get(1)).toBe(3)
  await ui.unmount()
})

test('a picture whose file never appears says so', async ($, on) => {
  engine(on, host())
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('', '[Image #1]'))
  const ui = await pane($, ui => ui.find({ type: 'Text', text: /미리보기 없음/ }))
  expect((await ui.find({ type: 'Text', text: /미리보기 없음/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Image' })).toBeFalsy()
  await ui.unmount()
})

test('a terminal that draws no pictures gets half-block cells instead', async ($, on) => {
  engine(on, host([[1, PATH]], 'the Image draws its alt there: no placeholder images'))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('', '[Image #1]'))
  const ui = await pane($, ui => ui.find({ type: 'Raster' }))
  expect(await ui.find({ type: 'Raster', key: 'image-1' })).toBeTruthy()
  expect(await ui.find({ type: 'Image' })).toBeFalsy()
  await ui.unmount()
})

test('a picture taken out of the prompt leaves the pane', async ($, on) => {
  engine(on, host([[1, PATH]]))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('', '[Image #1]'))
  let ui = await pane($, ui => ui.find({ type: 'Image' }))
  await ui.unmount()
  await prompt($).edit({ origin: { kind: 'composer' }, text: '[Image #1]', cursor: 10, start: 0, end: 10, inputText: '' })
  ui = await pane($, async ui => !(await ui.find({ type: 'Image' })))
  expect(await ui.find({ type: 'Image' })).toBeFalsy()
  await ui.unmount()
})

test('sending the prompt empties the pane', async ($, on) => {
  engine(on, host([[1, PATH]]))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('', '[Image #1]'))
  await prompt($).change({ text: '', cursor: 0, origin: { kind: 'clear' } })
  const ui = await pane($, ui => ui.find({ type: 'Text', text: /붙이면/ }))
  expect(await ui.find({ type: 'Image' })).toBeFalsy()
  await ui.unmount()
})

test('/image-preview-mod opens the pane by hand', async ($, on) => {
  const h = host()
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'image-preview-mod', args: '' } as CommandRunInput)
  expect(ran.text).toContain('열었습니다')
  expect(h.opened).toBe(1)
})
