import type { CommandRunInput, On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { PHRASES, pickPhrase } from '../hooks/phrases'

const PANE = {
  plugin: 'gif-mod',
  component: 'Pane',
  requestId: 'gif-mod',
  props: {
    title: 'Cat',
    isFocused: false,
    bodyColumns: 42,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The 10x10 sample GIF, as `$.fs.read` would hand it over.
const SAMPLE = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x0a, 0x00, 0x91, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
  0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x0a, 0x00, 0x0a, 0x00, 0x00, 0x02, 0x16, 0x8c, 0x2d, 0x99, 0x87, 0x2a, 0x1c, 0xdc, 0x33, 0xa0, 0x02, 0x75, 0xec,
  0x95, 0xfa, 0xa8, 0xde, 0x60, 0x8c, 0x04, 0x91, 0x4c, 0x01, 0x00, 0x3b,
])

declare const setTimeout: (run: () => void, ms: number) => unknown

// The test engine fills in the origin and presentation of a typed command.
const openCat = { command: 'gif-mod', args: '' } as CommandRunInput

function engine(on: On, curlExit: number, urls: string[], terminal = 'ghostty') {
  on('command.register', () => ({ value: { command: 'gif-mod' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'curl') urls.push(e.argv[e.argv.length - 1]!)
    const exitCode = e.argv[0] === 'curl' ? curlExit : 0
    return { value: { exitCode, stdout: e.argv[0] === 'mktemp' ? '/tmp/gif-mod.x\n' : e.argv[0] === 'sh' ? terminal : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', () => ({ value: { base64: SAMPLE.toBase64() } }))
}

async function settle(find: () => Promise<unknown>) {
  for (let i = 0; i < 50; i += 1) {
    if (await find()) return
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
}

test('/gif-mod fetches a captioned cat and draws it', async ($, on) => {
  const urls: string[] = []
  engine(on, 0, urls)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(openCat)
  expect(ran.text).toContain('열었습니다')

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Image' })
  })
  const image = await ui.find({ type: 'Image' })
  expect(image).toBeTruthy()
  expect(urls[0]).toContain('https://cataas.com/cat/gif/says/')
  expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeTruthy()
  await ui.unmount()
})

test('a cat that cannot be fetched says so', async ($, on) => {
  engine(on, 22, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(openCat)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Text', text: /못 데려왔습니다/ })
  })
  expect((await ui.find({ type: 'Text', text: /못 데려왔습니다/ }))?.text).toContain('curl 22')
  await ui.unmount()
})

test('a refresh never repeats the line on screen', async () => {
  for (const previous of PHRASES) {
    for (const r of [0, 0.5, 0.999]) expect(pickPhrase(previous, () => r)).not.toBe(previous)
  }
})

test('in Orca the cat is drawn in cells, plain, with the line under it', async ($, on) => {
  const urls: string[] = []
  engine(on, 0, urls, 'Orca')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(openCat)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Raster' })
  })
  expect(await ui.find({ type: 'Raster' })).toBeTruthy()
  expect(await ui.find({ type: 'Image' })).toBeFalsy()
  expect(urls[0]).toBe('https://cataas.com/cat/gif')
  expect((await ui.find({ type: 'Text', text: /“.+”/ }))?.text).toBeTruthy()
  await ui.unmount()
})

const GIPHY = {
  data: [
    {
      title: 'Cat Typing GIF',
      images: {
        fixed_width: { url: 'https://media.giphy.com/media/abc/200w.gif', width: '200', height: '150' },
        fixed_width_small: { url: 'https://media.giphy.com/media/abc/100w.gif', width: '100', height: '75' },
      },
    },
  ],
  pagination: { total_count: 120, count: 1, offset: 7 },
}

test('with a GIPHY key the cat comes from a GIPHY search, titled, as a picture even in Orca', { options: { giphyApiKey: 'k-123' } }, async ($, on) => {
  const urls: string[] = []
  const searches: string[] = []
  engine(on, 0, urls, 'Orca')
  on('http.fetch', (_, e) => {
    searches.push(e.url)
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(GIPHY) } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(openCat)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Image' })
  })
  expect(await ui.find({ type: 'Raster' })).toBeFalsy()
  expect(searches[0]).toContain('https://api.giphy.com/v1/gifs/search?')
  expect(searches[0]).toContain('api_key=k-123')
  // Any cat: a word with tens of thousands of results, picked from far down.
  const query = new URL(searches[0]!).searchParams
  expect(query.get('q')).toBe('cat')
  expect(Number(query.get('offset'))).toBeLessThan(1000)
  expect(urls[0]).toBe('https://media.giphy.com/media/abc/100w.gif')
  expect((await ui.find({ type: 'Text', text: /Cat Typing/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a GIPHY error never shows the key', { options: { giphyApiKey: 'k-123' } }, async ($, on) => {
  engine(on, 0, [], 'Orca')
  on('http.fetch', () => ({ value: { status: 403, ok: false, headers: {}, text: '{"message":"Invalid API key"}' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(openCat)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Text', text: /못 데려왔습니다/ })
  })
  const error = (await ui.find({ type: 'Text', text: /못 데려왔습니다/ }))?.text ?? ''
  expect(error).toContain('GIPHY 403')
  expect(error).not.toContain('k-123')
  await ui.unmount()
})

test('a refresh in Orca picks the picture once a GIPHY key is there', { options: { giphyApiKey: 'k-123' } }, async ($, on) => {
  engine(on, 0, [], 'Orca')
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(GIPHY) } }))
  // The session's store, holding what the pane kept before the key: cells.
  let stored: unknown = {
    shape: 'cat-2',
    value: { status: 'ready', phrase: 'x', isCaptionOnPicture: false, isFromGiphy: false, mode: 'raster', generation: 1 },
  }
  let version = 1
  on('state.get', () => ({ value: { value: stored, version } }) as never)
  on('state.set', (_, e) => {
    stored = (e as { value: unknown }).value
    version += 1
    return { value: { isSet: true, version } } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'refresh' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Image' })
  })
  expect(await ui.find({ type: 'Image' })).toBeTruthy()
  await ui.unmount()
})

test('an offset past the results learns the real count and tries within it', { options: { giphyApiKey: 'k-123' } }, async ($, on) => {
  const offsets: number[] = []
  engine(on, 0, [], 'Orca')
  on('http.fetch', (_, e) => {
    const offset = Number(new URL(e.url).searchParams.get('offset'))
    offsets.push(offset)
    // The first search lands past the results: GIPHY answers no data, and
    // how many there are.
    const body = offsets.length === 1 ? { data: [], pagination: { total_count: 60, count: 0, offset } } : GIPHY
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(openCat)
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Image' })
  })
  expect(await ui.find({ type: 'Image' })).toBeTruthy()
  expect(offsets.length).toBe(2)
  expect(offsets[1]).toBeLessThan(60)
  await ui.unmount()
})

test('a GIPHY request that fails on the way never shows the key', { options: { giphyApiKey: 'synthetic-test-key' } }, async ($, on) => {
  engine(on, 0, [], 'Orca')
  // The host may reject with the URL, key and all, in its message.
  on('http.fetch', (_, e) => {
    throw new Error(`fetch failed: ${e.url}`)
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(openCat)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(async () => {
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    return ui.find({ type: 'Text', text: /못 데려왔습니다/ })
  })
  const error = (await ui.find({ type: 'Text', text: /못 데려왔습니다/ }))?.text ?? ''
  expect(error).toContain('GIPHY 연결 실패')
  expect(error).not.toContain('synthetic-test-key')
  await ui.unmount()
})
