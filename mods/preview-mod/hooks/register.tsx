import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PreviewEntry, PreviewView } from '../types'
import { averageFrame, halfBlockCells } from './cells'
import { decodeBmp, fitBudget, fitPicture, fitsPaste, imageNumbers, pastedTexts, previewLines } from './parse'

const PANE = 'preview-mod'
const TITLE = 'Preview'
// A picture is shrunk to this many pixels on its longer side: the pane
// draws it 32 columns wide, which this fills.
const MAX_PIXELS = 320
// One pane takes at most 2 MiB of picture data in all (the engine refuses
// the whole drawing past that), shared out among the pictures shown; the
// rest of a margin is left for good measure.
const PANE_PICTURE_BYTES = 2 * 1024 * 1024 - 64 * 1024
// Claude Code writes the source of a placeholder as the placeholder
// appears; look this many times, this far apart, before saying there is none.
const LOOKS = 10
const LOOK_MS = 200
// How many lines of a pasted text the pane shows.
const TEXT_LINES = 4
const INITIAL: PreviewView = { items: [], mode: 'image' }
// Change the tag when PreviewView changes: it declines what an earlier
// version stored, which outlives a reload.
const view = atom({ plugin: 'preview-mod', key: 'view' } as const, INITIAL, { shape: 'preview-3' })

// The sources themselves, by placeholder. Module state, so each session
// keeps its own, and a reload forgets them.
type Picture = { rgba: string; width: number; height: number }
const pictures = new Map<number, Picture>()
const texts = new Map<number, string>()
let folder: string | undefined
// The placeholders in the draft at the last look, as "image-1", "text-2".
let seen: string[] = []

const keyOf = (item: { kind: PreviewEntry['kind']; n: number }) => `${item.kind}-${item.n}`

async function run($: EngineInterface, argv: string[]) {
  try {
    return await $.process.run(argv, { timeoutMs: 10000 })
  } catch {
    return undefined
  }
}

// A folder of this session's own for the converted pictures.
async function sessionFolder($: EngineInterface): Promise<string | undefined> {
  if (folder) return folder
  const made = await run($, ['mktemp', '-d', '-t', 'preview-mod'])
  const path = made?.exitCode === 0 ? made.stdout.trim() : ''
  folder = path || undefined
  return folder
}

// Look for a source a few times: Claude Code writes it as the placeholder
// appears, sometimes a moment after the edit that brought it.
async function lookFor($: EngineInterface, find: () => Promise<string | undefined>) {
  for (let look = 0; look < LOOKS; look += 1) {
    const found = await find()
    if (found) return found
    await $.clock.sleep(LOOK_MS)
  }
  return undefined
}

// Claude Code keeps every picture pasted or dropped into the prompt as
// <its temp folder>/claude-<uid>/<project>/<session id>/images/<N>.<ext>,
// N being the placeholder's. The project part follows the working folder,
// so any of them is looked in, the newest file winning.
const FIND_IMAGE = 'ls -t "${CLAUDE_CODE_TMPDIR:-/tmp}/claude-$(id -u)"/*/"$1"/images/"$2".* 2>/dev/null | head -1'

// A pasted text reaches the mod only as its placeholder, and Claude Code
// writes it to its paste cache only when the prompt is sent; right after
// the paste it is still on the clipboard.
const READ_CLIPBOARD = 'pbpaste 2>/dev/null || wl-paste --no-newline 2>/dev/null || xclip -selection clipboard -o 2>/dev/null'

// A picture as raw pixels: the mod cannot decode a JPEG or PNG itself, so
// sips shrinks it into an uncompressed BMP, which it can.
async function captureImage($: EngineInterface, n: number): Promise<Partial<PreviewEntry>> {
  const session = await $.session.id()
  const file = await lookFor($, async () => (await run($, ['sh', '-c', FIND_IMAGE, 'sh', session, String(n)]))?.stdout.trim())
  const dir = file ? await sessionFolder($) : undefined
  if (!file || !dir) return { status: 'none' }
  const small = `${dir}/${n}.bmp`
  const shrunk = await run($, ['sips', '-s', 'format', 'bmp', '-Z', String(MAX_PIXELS), file, '--out', small])
  if (shrunk?.exitCode !== 0) return { status: 'none' }
  try {
    const { base64 } = await $.fs.read(small, { as: 'bytes' })
    const decoded = decodeBmp(Uint8Array.fromBase64(base64))
    if (!decoded) return { status: 'none' }
    pictures.set(n, { rgba: decoded.rgba.toBase64(), width: decoded.width, height: decoded.height })
    return { status: 'ready', width: decoded.width, height: decoded.height }
  } catch {
    return { status: 'none' }
  }
}

// A pasted text: what the paste itself carried when the mod saw it before
// the editor folded it, else the clipboard, when its line count fits the
// placeholder's so that something copied since is not shown for it.
async function captureText($: EngineInterface, n: number, lines: number | undefined, carried: string | undefined) {
  let text = carried
  if (text === undefined) {
    const clipboard = (await run($, ['sh', '-c', READ_CLIPBOARD]))?.stdout ?? ''
    if (fitsPaste(clipboard, lines)) text = clipboard.replace(/\n$/, '')
  }
  if (text === undefined) return { status: 'none' as const }
  texts.set(n, text)
  return { status: 'ready' as const }
}

async function capture($: EngineInterface, item: PreviewEntry, carried: string | undefined) {
  const found = item.kind === 'image' ? await captureImage($, item.n) : await captureText($, item.n, item.lines, carried)
  await update($, view, (v): PreviewView => ({
    ...v,
    items: v.items.map(entry => (keyOf(entry) === keyOf(item) ? { ...entry, ...found } : entry)),
  }))
  if (found.status === 'ready') await $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
}

// The placeholders in the draft, in the order they appear.
function placeholders(text: string): PreviewEntry[] {
  const at = (needle: string) => text.indexOf(needle)
  const images = imageNumbers(text).map((n): PreviewEntry => ({ kind: 'image', n, status: 'loading' }))
  const pasted = pastedTexts(text).map(({ n, lines }): PreviewEntry => ({ kind: 'text', n, lines, status: 'loading' }))
  const position = (item: PreviewEntry) => at(item.kind === 'image' ? `[Image #${item.n}]` : `[Pasted text #${item.n}`)
  return [...images, ...pasted].sort((a, b) => position(a) - position(b))
}

// Keep the pane in step with the draft: new placeholders are captured, gone
// ones leave. `carried` is the text a paste brought, when the edit that
// brought it was seen before the editor folded it.
async function sync($: EngineInterface, text: string, carried?: string) {
  const now = placeholders(text)
  const keys = now.map(keyOf)
  const fresh = now.filter(item => !seen.includes(keyOf(item)))
  seen = keys
  for (const n of [...pictures.keys()]) if (!keys.includes(`image-${n}`)) pictures.delete(n)
  for (const key of [...shrunk.keys()]) if (!keys.includes(`image-${key.split('@')[0]}`)) shrunk.delete(key)
  for (const n of [...texts.keys()]) if (!keys.includes(`text-${n}`)) texts.delete(n)
  await update($, view, (v): PreviewView => {
    const kept = new Map(v.items.map(item => [keyOf(item), item]))
    return { ...v, items: now.map(item => kept.get(keyOf(item)) ?? item) }
  })
  const freshTexts = fresh.filter(item => item.kind === 'text')
  for (const item of fresh) void capture($, item, item.kind === 'text' && freshTexts.length === 1 ? carried : undefined)
}

// Whether this terminal draws pictures is the engine's to tell: a blit to an
// Image that draws its alt text is refused, and from then on the session
// draws half-block cells.
async function checkPictures($: EngineInterface, requestId: string, key: string, picture: Picture) {
  const result = await $.ui
    .blit({ requestId, key, source: { rgba: picture.rgba, width: picture.width, height: picture.height } })
    .catch(() => undefined)
  if (result?.deny && /alt|placeholder|cannot read/i.test(result.deny)) {
    await update($, view, (v): PreviewView => ({ ...v, mode: 'raster' }))
  }
}

// A picture within its share of the pane's picture data: as it is when it
// fits, else averaged down to the size that does. Shrunk copies are kept by
// size, since the share only changes with the number of pictures.
const shrunk = new Map<string, Picture>()
function withinShare(n: number, picture: Picture, share: number): Picture {
  const size = fitBudget(picture.width, picture.height, share)
  if (size.width === picture.width && size.height === picture.height) return picture
  const key = `${n}@${size.width}x${size.height}`
  let copy = shrunk.get(key)
  if (!copy) {
    const rgba = averageFrame(Uint8Array.fromBase64(picture.rgba), picture.width, picture.height, size.width, size.height)
    copy = { rgba: rgba.toBase64(), width: size.width, height: size.height }
    shrunk.set(key, copy)
  }
  return copy
}

function encodeCells(cells: Uint32Array): string {
  return new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength).toBase64()
}

export const register: Register = on => {
  pictures.clear()
  shrunk.clear()
  texts.clear()
  folder = undefined
  seen = []

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'preview-mod',
      description: '프롬프트에 붙인 이미지와 글을 옆 패널에 미리 보여 준다',
      argumentHint: '[close]',
    })
    return next(e)
  })

  on('command.run', { command: 'preview-mod' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: '미리보기 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
    return {
      text: opened.isPlaced ? '미리보기 패널을 열었습니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  // A paste, a drop or a key: the box after the edit is what next(e)
  // resolves to. A pasted text the editor folded is still whole in the edit.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const carried = e.inputText && !e.inputText.includes('[Pasted text #') ? e.inputText : undefined
    void sync($, box.text, carried)
    return box
  })

  // A send, a clear, a recalled history entry, the engine's own writes.
  on('prompt.change', async ($, e, next) => {
    const result = await next(e)
    void sync($, e.text)
    return result
  })

  // With one pane open the engine draws no title row, so the body's first row
  // sits at the very top, under Orca's window buttons: start one row down,
  // and one column in from the engine's divider.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const current: PreviewView = await read($, view)
    const shown = current.items.filter(item => item.kind === 'image' && pictures.has(item.n)).length
    const share = Math.floor(PANE_PICTURE_BYTES / Math.max(1, shown))

    const show = (item: PreviewEntry) => {
      const key = keyOf(item)
      if (item.status === 'loading') return <Text dimColor>가져오는 중…</Text>
      if (item.kind === 'text') {
        const text = texts.get(item.n)
        if (item.status === 'none' || text === undefined)
          return <Text dimColor>미리보기 없음: 붙여 넣은 글을 찾지 못했습니다.</Text>
        const { shown, more } = previewLines(text, TEXT_LINES)
        return (
          <Box flexDirection="column">
            {shown.map((line, i) => (
              <Text key={`${key}-line-${i}`} dimColor wrap="truncate-end">{line || ' '}</Text>
            ))}
            {more > 0 ? <Text dimColor italic>… {more}줄 더</Text> : null}
          </Box>
        )
      }
      const full = pictures.get(item.n)
      const picture = full && withinShare(item.n, full, share)
      if (item.status === 'none' || !picture)
        return <Text dimColor>미리보기 없음: Claude Code가 저장한 이미지 파일을 찾지 못했습니다.</Text>
      const { columns, rows } = fitPicture(picture.width, picture.height, e.props.bodyColumns)
      if (current.mode === 'image' && 'Image' in elements) {
        const { Image } = elements
        void checkPictures($, e.requestId, key, picture)
        return (
          <Image
            key={key}
            source={{ rgba: picture.rgba, width: picture.width, height: picture.height }}
            columns={columns}
            rows={rows}
            alt={`[Image #${item.n}]`}
          />
        )
      }
      if ('Raster' in elements) {
        const { Raster } = elements
        const rgba = Uint8Array.fromBase64(picture.rgba)
        return (
          <Raster
            key={key}
            columns={columns}
            rows={rows}
            cells={encodeCells(halfBlockCells(rgba, picture.width, picture.height, columns, rows))}
          />
        )
      }
      return <Text dimColor>이 화면은 그림을 그리지 못합니다.</Text>
    }

    const label = (item: PreviewEntry) =>
      item.kind === 'image'
        ? `[Image #${item.n}]`
        : `[Pasted text #${item.n}${item.lines === undefined ? '' : ` +${item.lines} lines`}]`

    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color="claude">붙인 것</Text>
          <Box flexGrow={1} />
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        {current.items.length === 0 ? (
          <Text dimColor>{'\n'}프롬프트에 이미지나 긴 글을 붙이거나 끌어다 놓으면 여기에 보입니다.</Text>
        ) : (
          current.items.map(item => (
            <Box key={`entry-${keyOf(item)}`} flexDirection="column" marginTop={1}>
              <Text bold color="cyan">{label(item)}</Text>
              {show(item)}
            </Box>
          ))
        )}
      </Box>
    )
  })
}
