// Reading the prompt's image placeholders and the picture the pane shows.
// Pure functions, so they can be checked outside the engine.

// The engine writes a pasted or dropped picture into the draft as exactly this.
const PLACEHOLDER = /\[Image #(\d+)\]/g

export function imageNumbers(text: string): number[] {
  const seen = new Set<number>()
  for (const match of text.matchAll(PLACEHOLDER)) seen.add(Number(match[1]))
  return [...seen]
}

export function newNumbers(before: readonly number[], after: readonly number[]): number[] {
  return after.filter(n => !before.includes(n))
}

// The picture's cells: at most `maxColumns` wide, as tall as its shape needs
// (a cell is about twice as tall as wide), within the rows there are.
export function fitPicture(width: number, height: number, bodyColumns: number, maxRows: number, maxColumns = 48) {
  let columns = Math.max(8, Math.min(maxColumns, bodyColumns - 2))
  let rows = Math.max(2, Math.round((columns * height) / width / 2))
  if (rows > maxRows) {
    rows = Math.max(2, maxRows)
    columns = Math.max(8, Math.round((rows * 2 * width) / height))
  }
  return { columns: Math.min(255, columns), rows: Math.min(255, rows) }
}

// An uncompressed 24- or 32-bit BMP (what `sips -s format bmp` writes) as
// RGBA pixels. The mod cannot inflate a JPEG or PNG itself, so `sips` turns
// the picture into BMP and the pane gets raw pixels: an Image takes them,
// and the Raster fallback is drawn from them.
export function decodeBmp(data: Uint8Array): { width: number; height: number; rgba: Uint8Array } | undefined {
  if (data.length < 54 || data[0] !== 0x42 || data[1] !== 0x4d) return undefined
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bpp = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  if (width <= 0 || rawHeight === 0 || (bpp !== 24 && bpp !== 32)) return undefined
  // 0: plain; 3: bit fields, which for 32 bits is BGRA in practice.
  if (compression !== 0 && !(compression === 3 && bpp === 32)) return undefined
  const height = Math.abs(rawHeight)
  const topDown = rawHeight < 0
  const stride = Math.ceil((width * bpp) / 32) * 4
  if (offset + stride * height > data.length) return undefined
  const bytes = bpp / 8
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const row = offset + (topDown ? y : height - 1 - y) * stride
    for (let x = 0; x < width; x += 1) {
      const from = row + x * bytes
      const to = (y * width + x) * 4
      rgba[to] = data[from + 2]!
      rgba[to + 1] = data[from + 1]!
      rgba[to + 2] = data[from]!
      rgba[to + 3] = 255
    }
  }
  return { width, height, rgba }
}
