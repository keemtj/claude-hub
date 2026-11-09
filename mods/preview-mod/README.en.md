# preview-mod

[한국어](README.md) | **English**

Shows the pictures (`[Image #N]`) and long texts (`[Pasted text #N +M lines]`) pasted or dropped into the prompt in a side pane. The pane opens when something is pasted; an item leaves the list when it is deleted from the prompt or the prompt is sent. Each session keeps its own.

- Pictures: drawn from the `images/<N>` file Claude Code writes to the session's temp folder as the picture is pasted, so both pasting and dropping from Finder work. Always 32 columns wide, as tall as the picture's shape needs.
- Texts: read from the clipboard right after the paste (Claude Code saves a paste only when the prompt is sent), and shown only when the line count fits the placeholder. Up to 4 lines, then "… K more lines".
- Terminals that draw no pictures: half-block thumbnails, once the engine says so.
- One pane holds at most 2 MiB of picture data, so with many pictures only their resolution is shared out (their size on screen stays).
- Needs: `sips` on macOS (picture conversion) and a clipboard command (`pbpaste`; `wl-paste` or `xclip` on Linux).

```sh
claude plugin install preview-mod@claude-hub
```

Open it with `/preview-mod`, close it with `/preview-mod close`.
