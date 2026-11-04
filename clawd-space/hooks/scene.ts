// The space scene as Raster cells: dotted stars, a crescent moon and a ringed
// planet in braille, an astronaut Clawd in half-block pixels over them.
// Pure functions only, so the scene can be drawn and checked outside the engine.

export const DEFAULT = 0x01000000

const STAR = 0x4a4a4a
const STAR_BRIGHT = 0x8a8a8a
const MOON = 0x5c5c5c
const PLANET = 0x555555
const SPARKLE = 0xf2d38a

// Clawd in a bubble helmet. One letter per pixel; a cell holds two rows.
const SPRITE = [
  '.....wwwwwww.....',
  '...wwgggggggww...',
  '..wggggggggghhw..',
  '.wgggggggggggghw.',
  '.wgggggggggggggw.',
  'wgggooooooooogggw',
  'wgggokkoookkogggw',
  'wgggokkoookkogggw',
  '.wwwooooooooowww.',
  'ooooooooooooooooo',
  '....ooooooooo....',
  '....o.o...o.o....',
  '....o.o...o.o....',
]
const SPRITE_COLORS: Record<string, number> = {
  w: 0xd8d8d8,
  h: 0xffffff,
  o: 0xd97757,
  k: 0x141414,
}
// Inside the helmet: hides the stars behind it but paints nothing.
const GLASS = -1
export const SPRITE_W = 17
export const SPRITE_H = SPRITE.length

// Braille dot bits for (x, y) in a cell's 2 x 4 grid.
const DOT_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

type Dot = { color: number } | undefined

// What sits at sub-pixel (x, y) of a dots-wide field, `tick` driving the drift.
function dotAt(x: number, y: number, w: number, h: number, tick: number): Dot {
  const isGrid = x % 2 === 0 && y % 2 === 0

  // Ringed planet, low on the right, partly below the edge.
  const pr = h * 0.4
  const px = w * 0.8
  const py = h * 0.98
  const dx = x - px
  const dy = y - py
  const inPlanet = dx * dx + dy * dy < pr * pr
  const ring = (dx / (pr * 1.9)) ** 2 + (dy / (pr * 0.38)) ** 2
  const onRing = ring > 0.82 && ring < 1.12
  const isRingInFront = onRing && (dy > 0 || !inPlanet)
  if (isRingInFront) return isGrid ? { color: PLANET } : undefined
  if (inPlanet) return isGrid ? { color: PLANET } : undefined

  // Crescent moon on the left, opening to the right.
  const mr = h * 0.32
  const mx = w * 0.12
  const my = h * 0.42
  const inMoon = (x - mx) ** 2 + (y - my) ** 2 < mr * mr
  const inShadow = (x - mx - mr * 0.42) ** 2 + (y - my) ** 2 < (mr * 0.9) ** 2
  if (inMoon && !inShadow) return isGrid ? { color: MOON } : undefined

  // Background stars drift left, one dot every few ticks.
  const sx = x + Math.floor(tick / 6)
  const r = hash(sx, y)
  if (r < 0.007) {
    const twinkle = hash(sx, y + 7919) < 0.15 && Math.floor(tick / 5 + r * 100) % 3 === 0
    return { color: twinkle ? STAR_BRIGHT : STAR }
  }
  return undefined
}

export type Frame = { cells: Uint32Array; columns: number; rows: number }

export function drawScene(columns: number, rows: number, tick: number): Frame {
  const cells = new Uint32Array(columns * rows * 3)
  const dotsW = columns * 2
  const dotsH = rows * 4

  // Clawd drifts slowly across the left half and bobs up and down.
  const pixelsH = rows * 2
  const spriteX = Math.round(columns * 0.36 + Math.sin(tick / 40) * columns * 0.08)
  const spriteY = Math.round(pixelsH / 2 - SPRITE_H / 2 + Math.sin(tick / 9) * 1.5)
  const pixel = (x: number, y: number): number | undefined => {
    const row = SPRITE[y - spriteY]
    const ch = row?.[x - spriteX]
    if (ch === 'g') return GLASS
    return ch ? SPRITE_COLORS[ch] : undefined
  }
  const sparkleX = spriteX - 2
  const sparkleRow = Math.floor((spriteY + SPRITE_H + 1) / 2)
  const isSparkleOn = Math.floor(tick / 4) % 3 !== 0

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const at = (row * columns + col) * 3
      const rawTop = pixel(col, row * 2)
      const rawBottom = pixel(col, row * 2 + 1)
      if (rawTop === GLASS && (rawBottom === GLASS || rawBottom === undefined)) {
        cells.set([0x20, DEFAULT, DEFAULT], at)
        continue
      }
      if (rawBottom === GLASS && rawTop === undefined) {
        cells.set([0x20, DEFAULT, DEFAULT], at)
        continue
      }
      const top = rawTop === GLASS ? undefined : rawTop
      const bottom = rawBottom === GLASS ? undefined : rawBottom
      if (top !== undefined || bottom !== undefined) {
        if (top !== undefined && bottom !== undefined) {
          cells.set(top === bottom ? [0x2588, top, DEFAULT] : [0x2580, top, bottom], at)
        } else if (top !== undefined) {
          cells.set([0x2580, top, DEFAULT], at)
        } else {
          cells.set([0x2584, bottom ?? DEFAULT, DEFAULT], at)
        }
        continue
      }
      if (isSparkleOn && row === sparkleRow && col === sparkleX) {
        cells.set([0x00d7, SPARKLE, DEFAULT], at)
        continue
      }
      let bits = 0
      let color = STAR
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const dot = dotAt(col * 2 + dx, row * 4 + dy, dotsW, dotsH, tick)
          if (dot) {
            bits |= DOT_BITS[dy]?.[dx] ?? 0
            color = Math.max(color, dot.color)
          }
        }
      }
      cells.set(bits ? [0x2800 + bits, color, DEFAULT] : [0x20, DEFAULT, DEFAULT], at)
    }
  }
  return { cells, columns, rows }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard padded base64 of the cells' little-endian bytes.
export function encodeCells(cells: Uint32Array): string {
  const bytes = new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += b === undefined ? '=' : B64[(n >> 6) & 63]
    out += c === undefined ? '=' : B64[n & 63]
  }
  return out
}
