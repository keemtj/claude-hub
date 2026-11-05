// A GIF decoder and the two ways the pane draws a frame: RGBA for an Image,
// half-block cells for a Raster. Pure functions only, so they can be checked
// outside the engine.

export type GifFrame = { rgba: Uint8Array; delayMs: number }
export type Gif = { width: number; height: number; frames: GifFrame[] }

// A long GIF is cut here, which bounds the memory one cat takes.
const MAX_FRAMES = 200
// Browsers play a delay under 20 ms at 100 ms; so does the pane.
const MIN_DELAY_MS = 20
const SLOW_DELAY_MS = 100

export const DEFAULT = 0x01000000

// Every frame goes to the terminal as raw pixels, so the pane plays few and
// small ones: at most eight a second, at most 128 pixels wide. The Image
// stretches them over its cells.
const MIN_FRAME_MS = 125
const MAX_IMAGE_WIDTH = 128

// The picture's cells: 32 columns whatever the pane's width (a 100 pixel GIF
// at about its own size), fewer in a narrow pane; as many rows as its shape
// needs, a cell being about twice as tall as wide, within the rows there are.
const PICTURE_COLUMNS = 32

export function fitPicture(width: number, height: number, bodyColumns: number, bodyRows: number) {
  let columns = Math.max(10, Math.min(PICTURE_COLUMNS, bodyColumns - 2))
  let rows = Math.max(3, Math.round((columns * height) / width / 2))
  const room = Math.max(3, bodyRows - 6)
  if (rows > room) {
    rows = room
    columns = Math.max(10, Math.round((rows * 2 * width) / height))
  }
  return { columns, rows }
}

export function frameDelay(delayMs: number): number {
  return Math.max(delayMs, MIN_FRAME_MS)
}

export function imageSize(width: number, height: number) {
  const scaled = Math.min(width, MAX_IMAGE_WIDTH)
  return { width: scaled, height: Math.max(1, Math.round((height * scaled) / width)) }
}

export function decodeGif(data: Uint8Array): Gif {
  const signature = String.fromCharCode(...data.subarray(0, 6))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('not a GIF')

  let pos = 6
  const u8 = () => {
    if (pos >= data.length) throw new Error('GIF ended early')
    return data[pos++]!
  }
  const u16 = () => u8() | (u8() << 8)
  const palette = (size: number) => {
    const end = pos + size * 3
    if (end > data.length) throw new Error('GIF ended early')
    const colors = data.subarray(pos, end)
    pos = end
    return colors
  }
  const subBlocks = () => {
    const parts: Uint8Array[] = []
    let total = 0
    for (let size = u8(); size > 0; size = u8()) {
      parts.push(data.subarray(pos, pos + size))
      total += size
      pos += size
    }
    const out = new Uint8Array(total)
    let at = 0
    for (const part of parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  }

  const width = u16()
  const height = u16()
  const screen = u8()
  pos += 2 // background colour index, pixel aspect ratio
  const globalPalette = screen & 0x80 ? palette(2 << (screen & 7)) : undefined

  const canvas = new Uint8Array(width * height * 4)
  const frames: GifFrame[] = []
  let delayMs = 0
  let transparent = -1
  let disposal = 0

  while (pos < data.length && frames.length < MAX_FRAMES) {
    const block = u8()
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = u8()
      const body = subBlocks()
      if (label === 0xf9 && body.length >= 4) {
        const flags = body[0]!
        disposal = (flags >> 2) & 7
        transparent = flags & 1 ? body[3]! : -1
        delayMs = (body[1]! | (body[2]! << 8)) * 10
      }
      continue
    }
    if (block !== 0x2c) throw new Error(`unknown GIF block ${block}`)

    const left = u16()
    const top = u16()
    const w = u16()
    const h = u16()
    const flags = u8()
    const colors = flags & 0x80 ? palette(2 << (flags & 7)) : globalPalette
    const isInterlaced = (flags & 0x40) !== 0
    const minCodeSize = u8()
    const indices = lzwDecode(minCodeSize, subBlocks(), w * h)

    const saved = disposal === 3 ? canvas.slice() : undefined
    if (colors) {
      const rows = isInterlaced ? interlacedRows(h) : undefined
      for (let i = 0; i < w * h; i += 1) {
        const index = indices[i]!
        if (index === transparent) continue
        const x = left + (i % w)
        const y = top + (rows ? rows[Math.floor(i / w)]! : Math.floor(i / w))
        if (x >= width || y >= height || index * 3 + 2 >= colors.length) continue
        const at = (y * width + x) * 4
        canvas[at] = colors[index * 3]!
        canvas[at + 1] = colors[index * 3 + 1]!
        canvas[at + 2] = colors[index * 3 + 2]!
        canvas[at + 3] = 255
      }
    }
    frames.push({ rgba: canvas.slice(), delayMs: delayMs < MIN_DELAY_MS ? SLOW_DELAY_MS : delayMs })

    // What this frame leaves for the next one.
    if (disposal === 2) {
      for (let y = top; y < Math.min(top + h, height); y += 1) {
        canvas.fill(0, (y * width + left) * 4, (y * width + Math.min(left + w, width)) * 4)
      }
    } else if (saved) {
      canvas.set(saved)
    }
    delayMs = 0
    transparent = -1
    disposal = 0
  }
  if (frames.length === 0) throw new Error('GIF has no frames')
  return { width, height, frames }
}

// Row y of an interlaced image is stored at the position this returns it in.
function interlacedRows(height: number): number[] {
  const rows: number[] = []
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const) {
    for (let y = start; y < height; y += step) rows.push(y)
  }
  return rows
}

function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount)
  const clear = 1 << minCodeSize
  const end = clear + 1
  const prefix = new Int16Array(4096)
  const suffix = new Uint8Array(4096)
  const first = new Uint8Array(4096)
  const stack = new Uint8Array(4097)
  for (let i = 0; i < clear; i += 1) {
    suffix[i] = i
    first[i] = i
  }

  let codeSize = minCodeSize + 1
  let next = end + 1
  let previous = -1
  let written = 0
  let bits = 0
  let datum = 0
  let pos = 0

  while (written < pixelCount) {
    while (bits < codeSize) {
      if (pos >= data.length) return out
      datum |= data[pos++]! << bits
      bits += 8
    }
    const code = datum & ((1 << codeSize) - 1)
    datum >>>= codeSize
    bits -= codeSize

    if (code === clear) {
      codeSize = minCodeSize + 1
      next = end + 1
      previous = -1
      continue
    }
    if (code === end) break
    if (previous === -1) {
      if (code >= clear) break
      out[written++] = code
      previous = code
      continue
    }
    if (code > next) break

    // Unwind the code's string backwards onto the stack.
    let size = 0
    let c = code
    if (code === next) {
      stack[size++] = first[previous]!
      c = previous
    }
    while (c >= clear) {
      stack[size++] = suffix[c]!
      c = prefix[c]!
    }
    stack[size++] = c

    if (next < 4096) {
      prefix[next] = previous
      suffix[next] = c
      first[next] = c
      next += 1
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1
    }
    while (size > 0 && written < pixelCount) out[written++] = stack[--size]!
    previous = code
  }
  return out
}

export function scaleFrame(rgba: Uint8Array, width: number, height: number, toWidth: number, toHeight: number) {
  const out = new Uint8Array(toWidth * toHeight * 4)
  for (let y = 0; y < toHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / toHeight))
    for (let x = 0; x < toWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / toWidth))
      out.set(rgba.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4), (y * toWidth + x) * 4)
    }
  }
  return out
}

// Shrinks by averaging every pixel a target pixel covers, so a cat a few
// dozen cells wide stays smooth instead of picking one pixel in many. A pixel
// is as opaque as the share of opaque pixels under it.
export function averageFrame(rgba: Uint8Array, width: number, height: number, toWidth: number, toHeight: number) {
  const out = new Uint8Array(toWidth * toHeight * 4)
  for (let y = 0; y < toHeight; y += 1) {
    const y0 = Math.min(height - 1, Math.floor((y * height) / toHeight))
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor(((y + 1) * height) / toHeight)))
    for (let x = 0; x < toWidth; x += 1) {
      const x0 = Math.min(width - 1, Math.floor((x * width) / toWidth))
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor(((x + 1) * width) / toWidth)))
      let r = 0
      let g = 0
      let b = 0
      let opaque = 0
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const at = (sy * width + sx) * 4
          if (rgba[at + 3]! < 128) continue
          r += rgba[at]!
          g += rgba[at + 1]!
          b += rgba[at + 2]!
          opaque += 1
        }
      }
      const at = (y * toWidth + x) * 4
      if (opaque === 0) continue
      out[at] = Math.round(r / opaque)
      out[at + 1] = Math.round(g / opaque)
      out[at + 2] = Math.round(b / opaque)
      out[at + 3] = Math.round((opaque * 255) / ((x1 - x0) * (y1 - y0)))
    }
  }
  return out
}

// Raster cells for a terminal that draws no pictures: each cell is two pixel
// rows, the upper as the foreground of ▀ and the lower as its background.
export function halfBlockCells(rgba: Uint8Array, width: number, height: number, columns: number, rows: number) {
  const pixels = averageFrame(rgba, width, height, columns, rows * 2)
  const colorAt = (x: number, y: number) => {
    const at = (y * columns + x) * 4
    if (pixels[at + 3]! < 128) return undefined
    return (pixels[at]! << 16) | (pixels[at + 1]! << 8) | pixels[at + 2]!
  }
  const cells = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const top = colorAt(col, row * 2)
      const bottom = colorAt(col, row * 2 + 1)
      const cell =
        top !== undefined
          ? [0x2580, top, bottom ?? DEFAULT]
          : bottom !== undefined
            ? [0x2584, bottom, DEFAULT]
            : [0x20, DEFAULT, DEFAULT]
      cells.set(cell, (row * columns + col) * 3)
    }
  }
  return cells
}
