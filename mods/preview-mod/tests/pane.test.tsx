import type { CommandRunInput, On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'preview-mod',
  component: 'Pane',
  requestId: 'preview-mod',
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
  // What the clipboard holds when the placeholder appears.
  clipboard?: string
  // The BMP sips leaves, when not the small default.
  bmp?: string
}

const host = (files: [number, string, number?][] = [], blitDeny?: string): Host => ({
  opened: 0,
  files: new Map(files.map(([n, path, after]) => [n, { path, after }])),
  looks: new Map(),
  sips: [],
  blitDeny,
})

function engine(on: On, h: Host) {
  on('command.register', () => ({ value: { command: 'preview-mod' } }))
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
    if (cmd === 'mktemp') return out(0, '/tmp/preview-mod.x\n')
    if (cmd === 'sh' && e.argv[2]?.includes('/images/')) {
      const sid = e.argv[4]
      const n = Number(e.argv[5])
      const looks = (h.looks.get(n) ?? 0) + 1
      h.looks.set(n, looks)
      const file = h.files.get(n)
      const ready = sid === 'SID' && file && looks >= (file.after ?? 1)
      return out(0, ready ? `${file.path}\n` : '')
    }
    if (cmd === 'sh' && e.argv[2]?.includes('pbpaste')) return out(0, h.clipboard ?? '')
    if (cmd === 'sips') h.sips.push([...e.argv])
    return out(0)
  })
  on('fs.read', () => ({ value: { base64: h.bmp ?? BMP } }))
  // Like Claude Code, the editor folds a paste of several lines into a
  // placeholder.
  on('prompt.edit', (_, e) => {
    const lines = e.inputText.split('\n').length - 1
    const n = (e.text.match(/\[Pasted text #/g)?.length ?? 0) + 1
    const input = lines >= 2 ? `[Pasted text #${n} +${lines} lines]` : e.inputText
    const text = e.text.slice(0, e.start) + input + e.text.slice(e.end)
    return { text, cursor: e.start + input.length }
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

test('/preview-mod opens the pane by hand', async ($, on) => {
  const h = host()
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'preview-mod', args: '' } as CommandRunInput)
  expect(ran.text).toContain('열었습니다')
  expect(h.opened).toBe(1)
})

const PASTE = 'first line\nsecond line\nthird line\nfourth line'

test('pasted text is shown from what the paste carried', async ($, on) => {
  const h = host()
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('look: ', PASTE))
  const ui = await pane($, ui => ui.find({ type: 'Text', text: /first line/ }))
  expect((await ui.find({ type: 'Text', text: /\[Pasted text #1 \+3 lines\]/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /first line/ }))?.text).toBeTruthy()
  expect(h.opened).toBe(1)
  await ui.unmount()
})

test('a paste the editor folded before the mod saw it is read from the clipboard', async ($, on) => {
  const h = host()
  h.clipboard = 'copied one\ncopied two\ncopied three\ncopied four'
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).change({ text: '[Pasted text #1 +3 lines]', cursor: 25, origin: { kind: 'engine' } })
  const ui = await pane($, ui => ui.find({ type: 'Text', text: /copied one/ }))
  expect((await ui.find({ type: 'Text', text: /copied one/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a clipboard text that does not fit the placeholder is not shown for it', async ($, on) => {
  const h = host()
  h.clipboard = 'something else entirely'
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).change({ text: '[Pasted text #1 +30 lines]', cursor: 26, origin: { kind: 'engine' } })
  const ui = await pane($, ui => ui.find({ type: 'Text', text: /미리보기 없음/ }))
  expect((await ui.find({ type: 'Text', text: /미리보기 없음/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /something else/ })).toBeFalsy()
  await ui.unmount()
})
test('a pasted text taken out of the prompt leaves the pane', async ($, on) => {
  engine(on, host())
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await prompt($).edit(paste('', PASTE))
  let ui = await pane($, ui => ui.find({ type: 'Text', text: /first line/ }))
  await ui.unmount()
  await prompt($).change({ text: '', cursor: 0, origin: { kind: 'clear' } })
  ui = await pane($, async ui => !(await ui.find({ type: 'Text', text: /first line/ })))
  expect(await ui.find({ type: 'Text', text: /first line/ })).toBeFalsy()
  await ui.unmount()
})

// A width x height 24-bit BMP of noise, as a big screenshot shrunk by sips.
function bigBmp(width: number, height: number): string {
  const stride = Math.ceil((width * 3) / 4) * 4
  const data = new Uint8Array(54 + stride * height)
  const view = new DataView(data.buffer)
  data[0] = 0x42
  data[1] = 0x4d
  view.setUint32(2, data.length, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, -height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  for (let i = 54; i < data.length; i += 1) data[i] = (i * 37) & 255
  return data.toBase64()
}

test('many big pictures all draw: one pane holds at most 2 MiB of picture data', async ($, on) => {
  const count = 6
  const h = host(Array.from({ length: count }, (_, i): [number, string] => [i + 1, `/tmp/claude-501/-proj/SID/images/${i + 1}.png`]))
  h.bmp = bigBmp(480, 500)
  engine(on, h)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const text = Array.from({ length: count }, (_, i) => `[Image #${i + 1}]`).join(' ')
  await prompt($).change({ text, cursor: text.length, origin: { kind: 'engine' } })
  const ui = await pane($, async ui => (await ui.find({ type: 'Image', key: `image-${count}` })) && (await ui.find({ type: 'Image', key: 'image-1' })))
  for (let n = 1; n <= count; n += 1) expect(await ui.find({ type: 'Image', key: `image-${n}` })).toBeTruthy()
  await ui.unmount()
})
