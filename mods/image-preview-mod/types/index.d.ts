// One `[Image #N]` in the draft and what the pane knows of it.
export type ImageEntry = {
  n: number
  // `loading` while the picture's file is looked for, `ready` with a
  // picture, `none` when no file turned up.
  status: 'loading' | 'ready' | 'none'
  width?: number
  height?: number
}

export type PreviewView = {
  images: ImageEntry[]
  // `raster` once the engine said this terminal draws no pictures.
  mode: 'image' | 'raster'
}

declare module 'claude-code' {
  interface PluginState {
    'image-preview-mod': {
      view: Shaped<PreviewView>
    }
  }
}
