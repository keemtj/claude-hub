import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CatView } from '../types'
import { decodeGif, fitPicture, frameDelay, halfBlockCells, imageSize, scaleFrame } from './gif'
import type { Gif } from './gif'
import { pickPhrase } from './phrases'

const PANE = 'gif-mod'
const TITLE = 'Cat'
const PICTURE = 'cat'
const TICK_MS = 40
// $.fs.read takes 4 MiB at most; a bigger GIF is skipped for another one.
const MAX_BYTES = 4_000_000
const TRIES = 3
// Any cat: "cat" has tens of thousands of results, so a cat picked from the
// first thousand rarely repeats; further down they get poor.
// The search when the person has not asked for another.
const DEFAULT_TERM = 'cat'
const TERM_KEY = 'term'
const GIPHY_DEPTH = 1000
// Change the tag when CatView changes: it declines what an earlier version
// stored, which outlives a reload.
const INITIAL: CatView = {
  status: 'empty',
  term: DEFAULT_TERM,
  phrase: '',
  isCaptionOnPicture: false,
  isFromGiphy: false,
  mode: 'image',
  generation: 0,
}
const view = atom({ plugin: 'gif-mod', key: 'view' } as const, INITIAL, { shape: 'gif-1' })

// The cat on screen. Module state, so a reload fetches a new one.
type Playing = {
  gif: Gif
  generation: number
  imageWidth: number
  imageHeight: number
  images: (string | undefined)[]
  cells: Map<string, (string | undefined)[]>
}
type Mounted = { requestId: string; columns: number; rows: number; mode: CatView['mode'] }
let playing: Playing | undefined
let mounted: Mounted | undefined
let stopTimer: (() => void) | undefined
let frame = 0
let elapsed = 0
let loadToken = 0
let giphyKey = ''
// How far down the results a pick may land: GIPHY_DEPTH until a search tells
// how many results this key sees (a beta key sees fewer).
let giphyDepth = GIPHY_DEPTH

function imageSource(cat: Playing, index: number) {
  let rgba = cat.images[index]
  if (rgba === undefined) {
    const { gif } = cat
    const pixels = scaleFrame(gif.frames[index]!.rgba, gif.width, gif.height, cat.imageWidth, cat.imageHeight)
    rgba = pixels.toBase64()
    cat.images[index] = rgba
  }
  return { rgba, width: cat.imageWidth, height: cat.imageHeight }
}

function rasterCells(cat: Playing, index: number, columns: number, rows: number) {
  const size = `${columns}x${rows}`
  let frames = cat.cells.get(size)
  if (!frames) {
    frames = []
    cat.cells.set(size, frames)
  }
  let cells = frames[index]
  if (cells === undefined) {
    const { gif } = cat
    const raw = halfBlockCells(gif.frames[index]!.rgba, gif.width, gif.height, columns, rows)
    cells = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).toBase64()
    frames[index] = cells
  }
  return cells
}

function stopAnimation() {
  stopTimer?.()
  stopTimer = undefined
}

function startAnimation($: EngineInterface) {
  if (stopTimer) return
  const timer = $.clock.every(TICK_MS, () => {
    const cat = playing
    const site = mounted
    if (!cat || !site) return
    elapsed += TICK_MS
    const before = frame
    while (elapsed >= frameDelay(cat.gif.frames[frame]?.delayMs ?? 100)) {
      elapsed -= frameDelay(cat.gif.frames[frame]?.delayMs ?? 100)
      frame = (frame + 1) % cat.gif.frames.length
    }
    if (frame === before) return
    const swap =
      site.mode === 'image'
        ? $.ui.blit({ requestId: site.requestId, key: PICTURE, source: imageSource(cat, frame) })
        : $.ui.blit({
            requestId: site.requestId,
            key: PICTURE,
            cells: rasterCells(cat, frame, site.columns, site.rows),
            columns: site.columns,
            rows: site.rows,
          })
    void swap
      .then(result => {
        if (!result.deny) return
        stopAnimation()
        // The terminal drew the alt instead of the picture: draw it in cells.
        if (site.mode === 'image' && /alt|placeholder|cannot read/i.test(result.deny)) {
          void update($, view, (v): CatView => ({ ...v, mode: 'raster' }))
        }
      })
      .catch(() => stopAnimation())
  })
  stopTimer = () => timer.cancel()
}

type Pick = { url: string; caption: string; isCaptionOnPicture: boolean }

// A cat: from a GIPHY search when the person gave a key, else from cataas
// with a developer line of ours.
async function pickCat($: EngineInterface, term: string, previous: string, mode: CatView['mode']): Promise<Pick> {
  if (giphyKey) {
    const query = new URLSearchParams({
      api_key: giphyKey,
      q: term,
      // GIPHY reads a Korean term better when told it is Korean.
      lang: /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(term) ? 'ko' : 'en',
      limit: '1',
      offset: String(Math.floor(Math.random() * giphyDepth)),
      rating: 'g',
    })
    // The key is in the URL, and a rejected request may carry the URL in its
    // message: whatever went wrong on the way, say only that.
    const response = await $.http.fetch(`https://api.giphy.com/v1/gifs/search?${query}`).catch(() => {
      throw new Error('GIPHY 연결 실패')
    })
    // The key is in the URL, so an error names the status alone.
    if (!response.ok) throw new Error(`GIPHY ${response.status}`)
    type Rendition = { url?: string }
    const answer = JSON.parse(response.text) as {
      data?: { title?: string; images?: Record<string, Rendition | undefined> }[]
      pagination?: { total_count?: number }
    }
    const total = answer.pagination?.total_count
    if (typeof total === 'number' && total > 0) giphyDepth = Math.min(GIPHY_DEPTH, total)
    const found = answer.data?.[0]
    // 100 pixels wide: the picture keeps 32 columns, about its own size, so
    // the bigger one would only cost Orca more to decode.
    const rendition = found?.images?.fixed_width_small ?? found?.images?.fixed_width
    if (!rendition?.url) throw new Error('GIPHY 검색 결과가 없습니다')
    const caption = (found?.title ?? '').replace(/\s*GIF\b.*$/i, '').trim()
    return { url: rendition.url, caption: caption || term, isCaptionOnPicture: false }
  }
  const phrase = pickPhrase(previous)
  // In cells the words would be a smudge, so that cat comes plain and the
  // line is written under it.
  return mode === 'image'
    ? {
        url: `https://cataas.com/cat/gif/says/${encodeURIComponent(phrase)}?fontSize=22&fontColor=white`,
        caption: phrase,
        isCaptionOnPicture: true,
      }
    : { url: 'https://cataas.com/cat/gif', caption: phrase, isCaptionOnPicture: false }
}

async function fetchGif($: EngineInterface, url: string): Promise<Gif> {
  const path = (await $.process.run(['mktemp', '-t', 'gif-mod'])).stdout.trim()
  try {
    const got = await $.process.run(
      ['curl', '-sfL', '-m', '30', '--max-filesize', String(MAX_BYTES), '-o', path, url],
      { timeoutMs: 40000 },
    )
    if (got.exitCode !== 0) throw new Error(got.exitCode === 63 ? '파일이 너무 큽니다' : `받기 실패 (curl ${got.exitCode})`)
    const { base64 } = await $.fs.read(path, { as: 'bytes' })
    return decodeGif(Uint8Array.fromBase64(base64))
  } finally {
    await $.process.run(['rm', '-f', path]).catch(() => undefined)
  }
}

// Orca's terminal decodes every picture on the one process that draws all
// its tabs, so a cataas GIF (big, many frames) slows the whole app: there
// that cat is cells. A GIPHY GIF, small and short, plays as a picture.
async function isOrca($: EngineInterface): Promise<boolean> {
  try {
    const { stdout } = await $.process.run(['sh', '-c', 'printf %s "$TERM_PROGRAM"'])
    return stdout.trim() === 'Orca'
  } catch {
    return false
  }
}

// Where the cat is a picture and where cells, asked again at every cat so a
// key added later, or a session moved into Orca, takes effect on a refresh.
async function modeFor($: EngineInterface, stored: CatView['mode']): Promise<CatView['mode']> {
  if (await isOrca($)) return giphyKey ? 'image' : 'raster'
  return stored
}

// A new search: an empty one goes back to cats. It is kept across sessions,
// and the result count learnt for the last term no longer holds.
async function setTerm($: EngineInterface, raw: string) {
  const term = raw.trim() || DEFAULT_TERM
  giphyDepth = GIPHY_DEPTH
  await update($, view, (v): CatView => ({ ...v, term }))
  await $.store.set(TERM_KEY, term).catch(() => undefined)
}

async function loadCat($: EngineInterface) {
  const token = ++loadToken
  const stored = await read($, view)
  const mode = await modeFor($, stored.mode)
  const current = { ...stored, mode }
  await update($, view, (v): CatView => ({ ...v, status: 'loading', error: undefined }))
  let lastError = ''
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    try {
      const cat = await pickCat($, current.term, current.phrase, current.mode)
      const gif = await fetchGif($, cat.url)
      if (token !== loadToken) return
      const size = imageSize(gif.width, gif.height)
      const generation = current.generation + 1
      playing = {
        gif,
        generation,
        imageWidth: size.width,
        imageHeight: size.height,
        images: [],
        cells: new Map(),
      }
      frame = 0
      elapsed = 0
      await update($, view, (v): CatView => ({
        ...v,
        status: 'ready',
        mode,
        phrase: cat.caption,
        isCaptionOnPicture: cat.isCaptionOnPicture,
        isFromGiphy: Boolean(giphyKey),
        generation,
        error: undefined,
      }))
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  if (token !== loadToken) return
  await update($, view, (v): CatView => ({ ...v, status: 'error', error: lastError }))
}

export const register: Register = (on, options) => {
  const key = (options as { giphyApiKey?: unknown } | undefined)?.giphyApiKey
  giphyKey = typeof key === 'string' ? key.trim() : ''
  giphyDepth = GIPHY_DEPTH
  stopAnimation()
  playing = undefined
  mounted = undefined
  loadToken = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gif-mod',
      description: '옆 패널에 GIF를 보여 준다 (검색어를 붙이면 그것으로 찾는다)',
      argumentHint: '[검색어|close]',
    })
    // The last search of an earlier session.
    const stored = await $.store.get(TERM_KEY).catch(() => undefined)
    if (typeof stored === 'string' && stored.trim()) {
      const term = stored.trim()
      await update($, view, (v): CatView => ({ ...v, term }))
    }
    return next(e)
  })

  on('command.run', { command: 'gif-mod' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'GIF 패널을 닫았습니다.' }
    }
    // Anything else after the command is a search.
    if (args) await setTerm($, args)
    const opened = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
    const current = await read($, view)
    const mode = await modeFor($, current.mode)
    if (args || mode !== current.mode || !playing) void loadCat($)
    return {
      text: opened.isPlaced ? 'GIF 패널을 열었습니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    stopAnimation()
    mounted = undefined
    return closed
  })

  // With one pane open the engine draws no title row, so the body's first row
  // sits at the very top, under Orca's window buttons: start one row down,
  // and one column in from the engine's divider.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const current: CatView = await read($, view)
    const cat = playing && playing.generation === current.generation ? playing : undefined

    // A reload forgets the cat but keeps the view: fetch one again.
    if (current.status === 'ready' && !playing) void loadCat($)

    let picture = null
    if (cat) {
      const { columns, rows } = fitPicture(cat.gif.width, cat.gif.height, e.props.bodyColumns, e.props.scroll.bodyRows)
      const mode = current.mode === 'image' && 'Image' in elements ? 'image' : 'raster'
      mounted = { requestId: e.requestId, columns, rows, mode }
      startAnimation($)
      if (mode === 'image' && 'Image' in elements) {
        const { Image } = elements
        picture = (
          <Image
            key={PICTURE}
            source={imageSource(cat, frame)}
            columns={columns}
            rows={rows}
            alt="이 터미널은 그림을 그리지 못해서 칸으로 다시 그립니다…"
          />
        )
      } else if ('Raster' in elements) {
        const { Raster } = elements
        picture = <Raster key={PICTURE} columns={columns} rows={rows} cells={rasterCells(cat, frame, columns, rows)} />
      }
    } else {
      mounted = undefined
      stopAnimation()
    }

    const status =
      current.status === 'loading'
        ? 'GIF를 가져오는 중…'
        : current.status === 'error'
          ? `GIF를 못 가져왔습니다: ${current.error ?? ''}`
          : undefined
    // cataas has cats alone: another search needs GIPHY.
    const note =
      !giphyKey && current.term !== DEFAULT_TERM ? '검색은 GIPHY API 키가 있어야 합니다. 고양이를 보여 줍니다.' : undefined
    const searchField =
      'Input' in elements ? (
        <elements.Input
          key="search"
          placeholder={`검색어 (지금: ${current.term}, 비우면 ${DEFAULT_TERM})`}
          onSubmit={value => void setTerm($, value).then(() => loadCat($))}
        />
      ) : null

    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color="claude">{current.term}.gif</Text>
          <Box flexGrow={1} />
          <Button key="refresh" onPress={() => void loadCat($)}>새로고침</Button>
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        {searchField ? <Box marginTop={1}>{searchField}</Box> : null}
        {note ? <Text color="yellow">{note}</Text> : null}
        {status ? <Text dimColor>{'\n'}{status}</Text> : null}
        {picture ? <Box marginTop={1}>{picture}</Box> : null}
        {cat && !current.isCaptionOnPicture ? <Text dimColor>{'\n'}“{current.phrase}”</Text> : null}
        {cat && current.isFromGiphy ? <Text dimColor>Powered by GIPHY</Text> : null}
      </Box>
    )
  })
}
