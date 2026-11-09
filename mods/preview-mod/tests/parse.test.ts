import { expect, test } from 'claude-code/testing'

import { halfBlockCells } from '../hooks/cells'
import { decodeBmp, fitBudget, fitPicture, fitsPaste, imageNumbers, newNumbers, pastedTexts, previewLines } from '../hooks/parse'

test('finds every [Image #N] in the prompt, in order, once each', async () => {
  expect(imageNumbers('look [Image #1] and [Image #3] then [Image #1]')).toEqual([1, 3])
  expect(imageNumbers('no pictures here')).toEqual([])
  expect(imageNumbers('[Image #12]')).toEqual([12])
})

test('ignores look-alikes that are not the engine placeholder', async () => {
  expect(imageNumbers('[Image#1] [image #2] [Image #x] Image #4')).toEqual([])
})

test('tells which numbers are new since the last look', async () => {
  expect(newNumbers([1], [1, 2])).toEqual([2])
  expect(newNumbers([1, 2], [2])).toEqual([])
  expect(newNumbers([], [1, 2])).toEqual([1, 2])
})

test('every picture is drawn 32 columns wide, as tall as its shape needs', async () => {
  // A cell is about twice as tall as wide: 640 x 480 at 32 columns is 12 rows.
  expect(fitPicture(640, 480, 100)).toEqual({ columns: 32, rows: 12 })
  // A tall screenshot keeps the width and grows down; the pane scrolls.
  expect(fitPicture(400, 1600, 100)).toEqual({ columns: 32, rows: 64 })
  // Only a pane narrower than that shrinks it.
  expect(fitPicture(640, 480, 22)).toEqual({ columns: 20, rows: 8 })
})

// A BMP with the given rows of [r, g, b] pixels: 24-bit rows padded to four
// bytes, top-down when `topDown` (negative height), else bottom-up.
function bmp(rows: number[][][], bpp: 24 | 32, topDown: boolean): Uint8Array {
  const width = rows[0]!.length
  const height = rows.length
  const stride = Math.ceil((width * bpp) / 32) * 4
  const data = new Uint8Array(54 + stride * height)
  const view = new DataView(data.buffer)
  data[0] = 0x42
  data[1] = 0x4d
  view.setUint32(2, data.length, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, topDown ? -height : height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, bpp, true)
  rows.forEach((row, y) => {
    const fileRow = topDown ? y : height - 1 - y
    row.forEach(([r, g, b], x) => {
      const at = 54 + fileRow * stride + x * (bpp / 8)
      data[at] = b!
      data[at + 1] = g!
      data[at + 2] = r!
      if (bpp === 32) data[at + 3] = 255
    })
  })
  return data
}

const RED = [255, 0, 0]
const GREEN = [0, 255, 0]
const BLUE = [0, 0, 255]
const WHITE = [255, 255, 255]
const EXPECTED = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]

test('decodes a 24-bit BMP, top-down or bottom-up, into RGBA', async () => {
  for (const topDown of [true, false]) {
    const image = decodeBmp(bmp([[RED, GREEN], [BLUE, WHITE]], 24, topDown))
    expect(image?.width).toBe(2)
    expect(image?.height).toBe(2)
    expect([...image!.rgba]).toEqual(EXPECTED)
  }
})

test('decodes a 32-bit BMP and skips the row padding of odd widths', async () => {
  expect([...decodeBmp(bmp([[RED, GREEN], [BLUE, WHITE]], 32, true))!.rgba]).toEqual(EXPECTED)
  const odd = decodeBmp(bmp([[RED, GREEN, BLUE]], 24, true))!
  expect([...odd.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
})

test('refuses what is not an uncompressed BMP', async () => {
  expect(decodeBmp(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined()
})

test('a terminal without pictures gets half-block cells averaging the pixels', async () => {
  // 2 wide, 2 tall: red and blue on top, white and black below, into one cell.
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255])
  expect([...halfBlockCells(rgba, 2, 2, 1, 1)]).toEqual([0x2580, 0x800080, 0x808080])
})

test('finds every [Pasted text #N] with its line count when it has one', async () => {
  expect(pastedTexts('a [Pasted text #1 +12 lines] b [Pasted text #2] [Pasted text #1 +12 lines]')).toEqual([
    { n: 1, lines: 12 },
    { n: 2, lines: undefined },
  ])
  expect(pastedTexts('[Image #1] [Pasted text#3]')).toEqual([])
})

test('a clipboard text stands for the placeholder only when its line count fits', async () => {
  const eleven = Array.from({ length: 11 }, (_, i) => `line ${i}`).join('\n')
  // Claude Code may count the last line or not: +10 or +11 both fit 11 lines.
  expect(fitsPaste(eleven, 10)).toBe(true)
  expect(fitsPaste(eleven, 11)).toBe(true)
  expect(fitsPaste(eleven, 30)).toBe(false)
  // A short paste is folded without a count: any text that is not empty fits.
  expect(fitsPaste('one long line', undefined)).toBe(true)
  expect(fitsPaste('', undefined)).toBe(false)
})
test('a long text shows its first lines and how many more there are', async () => {
  const text = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
  expect(previewLines(text, 3)).toEqual({ shown: ['line 1', 'line 2', 'line 3'], more: 17 })
  expect(previewLines('one\ntwo', 3)).toEqual({ shown: ['one', 'two'], more: 0 })
})

test('a picture over its share of the pane budget shrinks, keeping its shape', async () => {
  // 320 x 240 x 4 bytes fits a 400 KB share as it is.
  expect(fitBudget(320, 240, 400_000)).toEqual({ width: 320, height: 240 })
  // Over a 100 KB share it shrinks to fit, the same shape.
  const small = fitBudget(320, 240, 100_000)
  expect(small.width * small.height * 4).toBeLessThanOrEqual(100_000)
  expect(Math.abs(small.width / small.height - 320 / 240)).toBeLessThan(0.05)
  // Never below one pixel.
  expect(fitBudget(320, 240, 1)).toEqual({ width: 1, height: 1 })
})
