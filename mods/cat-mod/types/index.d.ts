export type CatView = {
  status: 'empty' | 'loading' | 'ready' | 'error'
  // The developer line on the cat now on screen.
  phrase: string
  // True when cataas drew the line into the GIF; else it is written under it.
  isCaptionOnPicture: boolean
  // GIPHY's terms ask for its name beside what comes from it.
  isFromGiphy: boolean
  // `raster` once the terminal turned out to draw no pictures.
  mode: 'image' | 'raster'
  error?: string
  // Counts the cats fetched, so a new one redraws the pane.
  generation: number
}

declare module 'claude-code' {
  interface PluginState {
    'cat-mod': {
      view: Shaped<CatView>
    }
  }
}
