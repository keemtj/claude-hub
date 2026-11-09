import { expect, test } from 'claude-code/testing'

import { halfBlockCells } from '../hooks/cells'
import { decodeBmp, fitPicture, imageNumbers, newNumbers } from '../hooks/parse'

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

test('a picture keeps its shape within the width and rows given', async () => {
  expect(fitPicture(640, 480, 100, 40)).toEqual({ columns: 48, rows: 18 })
  expect(fitPicture(640, 480, 30, 40)).toEqual({ columns: 28, rows: 11 })
  // A tall screenshot is held to the rows there are.
  expect(fitPicture(400, 1600, 100, 20)).toEqual({ columns: 10, rows: 20 })
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
