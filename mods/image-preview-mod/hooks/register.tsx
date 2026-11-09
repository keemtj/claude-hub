import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ImageEntry, PreviewView } from '../types'
import { halfBlockCells } from './cells'
import { decodeBmp, fitPicture, imageNumbers, newNumbers } from './parse'

const PANE = 'image-preview-mod'
const TITLE = 'Images'
// The picture is shrunk to this many pixels on its longer side: an Image's
// raw pixels may be 2 MiB (480 x 480 x 4 is under 1), and the pane shows it
// small anyway.
const MAX_PIXELS = 480
// Claude Code writes the picture's file as the placeholder appears; look
// this many times, this far apart, before saying there is none.
const LOOKS = 10
const LOOK_MS = 200
const INITIAL: PreviewView = { images: [], mode: 'image' }
// Change the tag when PreviewView changes: it declines what an earlier
// version stored, which outlives a reload.
const view = atom({ plugin: 'image-preview-mod', key: 'view' } as const, INITIAL, { shape: 'preview-2' })

// The pictures as raw RGBA (base64), by placeholder number. Module state, so
// each session keeps its own, and a reload forgets them.
type Picture = { rgba: string; width: number; height: number }
const pictures = new Map<number, Picture>()
let folder: string | undefined
// The numbers in the draft at the last look.
let seen: number[] = []

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
  const made = await run($, ['mktemp', '-d', '-t', 'image-preview-mod'])
  const path = made?.exitCode === 0 ? made.stdout.trim() : ''
  folder = path || undefined
  return folder
}

// Claude Code keeps every picture pasted or dropped into the prompt as
// <its temp folder>/claude-<uid>/<project>/<session id>/images/<N>.<ext>,
// N being the placeholder's. The project part follows the working folder,
// so any of them is looked in, the newest file winning.
const FIND_IMAGE = 'ls -t "${CLAUDE_CODE_TMPDIR:-/tmp}/claude-$(id -u)"/*/"$1"/images/"$2".* 2>/dev/null | head -1'

async function imageFile($: EngineInterface, n: number): Promise<string | undefined> {
  const session = await $.session.id()
  for (let look = 0; look < LOOKS; look += 1) {
    const found = (await run($, ['sh', '-c', FIND_IMAGE, 'sh', session, String(n)]))?.stdout.trim()
    if (found) return found
    await $.clock.sleep(LOOK_MS)
  }
  return undefined
}

// The picture as raw pixels: the mod cannot decode a JPEG or PNG itself, so
// sips shrinks it into an uncompressed BMP, which it can.
async function capture($: EngineInterface, n: number) {
  const file = await imageFile($, n)
  const dir = file ? await sessionFolder($) : undefined
  let entry: ImageEntry = { n, status: 'none' }
  if (file && dir) {
    const small = `${dir}/${n}.bmp`
    const shrunk = await run($, ['sips', '-s', 'format', 'bmp', '-Z', String(MAX_PIXELS), file, '--out', small])
    if (shrunk?.exitCode === 0) {
      try {
        const { base64 } = await $.fs.read(small, { as: 'bytes' })
        const decoded = decodeBmp(Uint8Array.fromBase64(base64))
        if (decoded) {
          pictures.set(n, { rgba: decoded.rgba.toBase64(), width: decoded.width, height: decoded.height })
          entry = { n, status: 'ready', width: decoded.width, height: decoded.height }
        }
      } catch {}
    }
  }
  await update($, view, (v): PreviewView => ({
    ...v,
    images: v.images.map(image => (image.n === n ? entry : image)),
  }))
  if (entry.status === 'ready') await $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
}

// Keep the pane in step with the draft: new placeholders are captured, gone
// ones leave.
async function sync($: EngineInterface, text: string) {
  const now = imageNumbers(text)
  const fresh = newNumbers(seen, now)
  seen = now
  for (const n of [...pictures.keys()]) if (!now.includes(n)) pictures.delete(n)
  await update($, view, (v): PreviewView => ({
    ...v,
    images: [
      ...v.images.filter(image => now.includes(image.n)),
      ...fresh.map((n): ImageEntry => ({ n, status: 'loading' })),
    ],
  }))
  for (const n of fresh) void capture($, n)
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

function encodeCells(cells: Uint32Array): string {
  return new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength).toBase64()
}

export const register: Register = on => {
  pictures.clear()
  folder = undefined
  seen = []

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'image-preview-mod',
      description: '프롬프트에 붙인 이미지를 옆 패널에 미리 보여 준다',
      argumentHint: '[close]',
    })
    return next(e)
  })

  on('command.run', { command: 'image-preview-mod' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: '이미지 미리보기 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
    return {
      text: opened.isPlaced ? '이미지 미리보기 패널을 열었습니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  // A paste, a drop or a key: the box after the edit is what next(e) resolves to.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    void sync($, box.text)
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
    const count = Math.max(1, current.images.length)
    const rowsEach = Math.max(4, Math.floor((e.props.scroll.bodyRows - 4) / count) - 2)

    const body =
      current.images.length === 0 ? (
        <Text dimColor>{'\n'}프롬프트에 이미지를 붙이거나 끌어다 놓으면 여기에 보입니다.</Text>
      ) : (
        current.images.map(image => {
          const picture = pictures.get(image.n)
          const key = `image-${image.n}`
          let shown = null
          if (image.status === 'loading') shown = <Text dimColor>가져오는 중…</Text>
          else if (image.status === 'none' || !picture)
            shown = <Text dimColor>미리보기 없음: Claude Code가 저장한 이미지 파일을 찾지 못했습니다.</Text>
          else {
            const { columns, rows } = fitPicture(picture.width, picture.height, e.props.bodyColumns, rowsEach)
            if (current.mode === 'image' && 'Image' in elements) {
              const { Image } = elements
              void checkPictures($, e.requestId, key, picture)
              shown = (
                <Image
                  key={key}
                  source={{ rgba: picture.rgba, width: picture.width, height: picture.height }}
                  columns={columns}
                  rows={rows}
                  alt={`[Image #${image.n}]`}
                />
              )
            } else if ('Raster' in elements) {
              const { Raster } = elements
              const rgba = Uint8Array.fromBase64(picture.rgba)
              shown = (
                <Raster
                  key={key}
                  columns={columns}
                  rows={rows}
                  cells={encodeCells(halfBlockCells(rgba, picture.width, picture.height, columns, rows))}
                />
              )
            } else shown = <Text dimColor>이 화면은 그림을 그리지 못합니다.</Text>
          }
          return (
            <Box key={`entry-${image.n}`} flexDirection="column" marginTop={1}>
              <Text bold color="cyan">[Image #{image.n}]</Text>
              {shown}
            </Box>
          )
        })
      )

    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color="claude">붙인 이미지</Text>
          <Box flexGrow={1} />
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        {body}
      </Box>
    )
  })
}
