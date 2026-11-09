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

// The picture's cells: always PICTURE_COLUMNS wide (fewer only in a pane
// narrower than that), as tall as its shape needs, a cell being about twice
// as tall as wide. A tall picture grows down and the pane scrolls.
const PICTURE_COLUMNS = 32

export function fitPicture(width: number, height: number, bodyColumns: number) {
  const columns = Math.max(8, Math.min(PICTURE_COLUMNS, bodyColumns - 2))
  const rows = Math.max(2, Math.round((columns * height) / width / 2))
  return { columns, rows: Math.min(255, rows) }
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

// A long paste is folded into the draft as "[Pasted text #N +M lines]", a
// short one with many characters as "[Pasted text #N]".
const PASTED = /\[Pasted text #(\d+)(?: \+(\d+) lines)?\]/g

export function pastedTexts(text: string): { n: number; lines: number | undefined }[] {
  const found = new Map<number, number | undefined>()
  for (const match of text.matchAll(PASTED)) {
    const n = Number(match[1])
    if (!found.has(n)) found.set(n, match[2] === undefined ? undefined : Number(match[2]))
  }
  return [...found].map(([n, lines]) => ({ n, lines }))
}

// Whether a clipboard text can be the paste behind a placeholder: Claude
// Code folds a paste of several lines into "+M lines", counting the last
// line or not, so the text has M or M + 1 lines; a paste folded without a
// count only has to be there.
export function fitsPaste(text: string, lines: number | undefined): boolean {
  if (!text) return false
  if (lines === undefined) return true
  const count = text.replace(/\n$/, '').split('\n').length
  return count === lines || count === lines + 1
}

export function previewLines(text: string, maxLines: number): { shown: string[]; more: number } {
  const all = text.split('\n')
  return { shown: all.slice(0, maxLines), more: Math.max(0, all.length - maxLines) }
}

// The pixel size a picture may send within `budgetBytes` of RGBA (4 bytes a
// pixel), the same shape: one pane takes at most 2 MiB of picture data in
// all, so each picture gets a share of it.
export function fitBudget(width: number, height: number, budgetBytes: number): { width: number; height: number } {
  if (width * height * 4 <= budgetBytes) return { width, height }
  const scale = Math.sqrt(budgetBytes / (width * height * 4))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}
