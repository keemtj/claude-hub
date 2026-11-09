// One placeholder in the draft, `[Image #N]` or `[Pasted text #N +M lines]`,
// and what the pane knows of it.
export type PreviewEntry = {
  kind: 'image' | 'text'
  n: number
  // `loading` while its source is looked for, `ready` once found, `none`
  // when nothing turned up.
  status: 'loading' | 'ready' | 'none'
  // An image's size in pixels.
  width?: number
  height?: number
  // A pasted text's line count as the placeholder gives it.
  lines?: number
}

export type PreviewView = {
  items: PreviewEntry[]
  // `raster` once the engine said this terminal draws no pictures.
  mode: 'image' | 'raster'
}

declare module 'claude-code' {
  interface PluginState {
    'preview-mod': {
      view: Shaped<PreviewView>
    }
  }
}
