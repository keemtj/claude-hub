import { expect, test } from 'claude-code/testing'

import { decodeGif, fitPicture, frameDelay, halfBlockCells, imageSize, scaleFrame } from '../hooks/gif'

// The 10x10 sample from "What's in a GIF": white, red, blue, black palette.
const SAMPLE = [
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x0a, 0x00, 0x91, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
  0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x0a, 0x00, 0x0a, 0x00, 0x00, 0x02, 0x16, 0x8c, 0x2d, 0x99, 0x87, 0x2a, 0x1c, 0xdc, 0x33, 0xa0, 0x02, 0x75, 0xec,
  0x95, 0xfa, 0xa8, 0xde, 0x60, 0x8c, 0x04, 0x91, 0x4c, 0x01, 0x00, 0x3b,
]
const GRID = [
  '1111122222',
  '1111122222',
  '1111122222',
  '1110000222',
  '1110000222',
  '2220000111',
  '2220000111',
  '2222211111',
  '2222211111',
  '2222211111',
]
const RGB = [0xffffff, 0xff0000, 0x0000ff]

test('decodes the sample GIF pixel for pixel', async () => {
  const gif = decodeGif(new Uint8Array(SAMPLE))
  expect(gif.width).toBe(10)
  expect(gif.height).toBe(10)
  expect(gif.frames.length).toBe(1)
  const rgba = gif.frames[0]!.rgba
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const at = (y * 10 + x) * 4
      const color = (rgba[at]! << 16) | (rgba[at + 1]! << 8) | rgba[at + 2]!
      expect(color).toBe(RGB[Number(GRID[y]![x])])
      expect(rgba[at + 3]).toBe(255)
    }
  }
})

test('a zero delay plays at a tenth of a second, as browsers do', async () => {
  const gif = decodeGif(new Uint8Array(SAMPLE))
  expect(gif.frames[0]!.delayMs).toBe(100)
})

test('rejects bytes that are not a GIF', async () => {
  expect(() => decodeGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow()
})

test('scales by nearest pixel', async () => {
  const gif = decodeGif(new Uint8Array(SAMPLE))
  const small = scaleFrame(gif.frames[0]!.rgba, 10, 10, 2, 2)
  // Top left red, top right blue, bottom left blue, bottom right red.
  expect([...small.slice(0, 3)]).toEqual([0xff, 0, 0])
  expect([...small.slice(4, 7)]).toEqual([0, 0, 0xff])
  expect([...small.slice(8, 11)]).toEqual([0, 0, 0xff])
  expect([...small.slice(12, 15)]).toEqual([0xff, 0, 0])
})

test('draws two pixel rows per cell with an upper half block', async () => {
  // 1 wide, 2 tall: red over blue.
  const rgba = new Uint8Array([0xff, 0, 0, 255, 0, 0, 0xff, 255])
  const cells = halfBlockCells(rgba, 1, 2, 1, 1)
  expect([...cells]).toEqual([0x2580, 0xff0000, 0x0000ff])
})

test('plays at most eight frames a second', async () => {
  expect(frameDelay(30)).toBe(125)
  expect(frameDelay(125)).toBe(125)
  expect(frameDelay(200)).toBe(200)
})

test('sends a frame at most 128 pixels wide, keeping its shape', async () => {
  expect(imageSize(400, 225)).toEqual({ width: 128, height: 72 })
  expect(imageSize(100, 80)).toEqual({ width: 100, height: 80 })
})

test('cells average the pixels they cover', async () => {
  // 2 wide, 2 tall: red and blue on top, white and black below, into one
  // column of one cell: the top half is their purple, the bottom half grey.
  const rgba = new Uint8Array([
    0xff, 0, 0, 255, 0, 0, 0xff, 255,
    0xff, 0xff, 0xff, 255, 0, 0, 0, 255,
  ])
  const cells = halfBlockCells(rgba, 2, 2, 1, 1)
  expect([...cells]).toEqual([0x2580, 0x800080, 0x808080])
})

test('the picture keeps 32 columns however wide the pane grows', async () => {
  // 100 x 75: 32 columns, and half as many rows as the shape asks, a cell
  // being about twice as tall as wide.
  expect(fitPicture(100, 75, 120, 60)).toEqual({ columns: 32, rows: 12 })
  expect(fitPicture(100, 75, 200, 60)).toEqual({ columns: 32, rows: 12 })
})

test('a narrow pane shrinks the picture to fit', async () => {
  expect(fitPicture(100, 75, 22, 60)).toEqual({ columns: 20, rows: 8 })
})
