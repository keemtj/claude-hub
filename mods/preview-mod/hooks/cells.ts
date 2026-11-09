// Raster cells for a terminal that draws no pictures, from RGBA pixels.
// The same averaging half-block drawing as gif-mod's. Pure functions.

export const DEFAULT = 0x01000000

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
