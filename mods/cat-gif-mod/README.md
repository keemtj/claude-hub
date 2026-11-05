# cat-gif-mod

**English** | [한국어](README.ko.md)

`/cat-gif-mod` opens a side pane with a cat GIF. Press `새로고침` (refresh) for another cat.

- Source: with a GIPHY API key, it searches GIPHY for `cat`, picks one of the top 1,000 at random and writes its title underneath. Without a key, it puts a developer line on a cat from [cataas.com](https://cataas.com) via `/cat/gif/says/<line>` (the lines are in `hooks/phrases.ts`).
- Adding a key: get an API key at [developers.giphy.com](https://developers.giphy.com) (free beta key, 100 calls an hour) and enter it with `/plugin configure cat-gif-mod@claude-hub`. It is a sensitive `userConfig` value, so it is kept in the keychain. Anyone you share the mod with enters their own key when installing.
- Drawing: the mod decodes the GIF itself (`hooks/gif.ts`) and swaps an `Image`'s source each frame. Frames reach the terminal uncompressed, so it sends at most 128 pixels wide and 8 frames a second. From GIPHY it fetches the 100-pixel-wide rendition (`fixed_width_small`), and the picture keeps 32 columns whatever the pane's width (at 320 pixels and 14 frames a second the whole Orca app slowed down). Inside Orca without a GIPHY key (`TERM_PROGRAM=Orca`: GIPHY GIFs are small and short, so they play as pictures even in Orca, but cataas GIFs are big with many frames, and the CPU of Orca's process that decodes every tab's pictures reached 18–97% while one played), or when the terminal cannot draw pictures (its alt text shows instead), it draws with half-block `Raster` cells, fetching a plain cat and writing the line underneath.
- A GIF over 4 MB is skipped for another (up to three tries). Close it with `/cat-gif-mod close`.

```sh
claude plugin install cat-gif-mod@claude-hub
```

## Third-party services

This mod's code is under the repository's MIT license. The GIFs it shows are not part of this repository; they are fetched from third-party services at run time and are subject to those services' terms.

- GIPHY: subject to the [GIPHY API terms](https://developers.giphy.com/docs/api). No API key is stored in this repository; each user gets and enters their own. The pane shows `Powered by GIPHY`, the attribution the terms ask for. The free beta key is limited to 100 calls an hour and meant for personal use.
- cataas.com: a public cat API used without a key.
