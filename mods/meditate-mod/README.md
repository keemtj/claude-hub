# meditate-mod

**English** | [한국어](README.ko.md)

`/meditate-mod` turns on a band right above the prompt (as tall as the engine allows) where an astronaut Clawd drifts among dotted stars, a crescent moon and a ringed planet. `/meditate-mod off` turns it off. It draws with the terminal `Raster` element and repaints only the changed cells ten times a second (no tokens used).

- Clawd is Claude Code's logo glyph (`▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝`) taken apart quarter-cell by quarter-cell, wearing a glass helmet.
- If you fold the band with `[-]`, the engine remembers it for the session and a mod cannot unfold it. The folded band stays as one `▸ plugin panel hidden` line above the prompt; click that line to unfold it (the `ctrl+x ctrl+a` shortcut works only while the band has something to draw). To stop it, use `/meditate-mod off` rather than folding.

```sh
claude plugin install meditate-mod@claude-hub
```

Test: `claude plugin test .`
