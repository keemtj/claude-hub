# inventory-mod

**English** | [한국어](README.ko.md)

`/inventory-mod` opens a side pane with three tabs showing what is installed globally, and turns things on or off.

| Tab | Shows | What a toggle affects |
|---|---|---|
| Plugins | Plugins and mods from `claude plugin list`, and this session's mod folder (`~/.claude/dev-mods/<session>`) | All sessions (`claude plugin enable/disable`; this session after `/reload-plugins`). The inventory itself and the session's mod folder are locked |
| Skills | Personal skills in `~/.claude/skills`, and the skill count per plugin | This session only (Skill tool calls are refused, and `/name` says it is off). Skills linked from an external install are locked |
| MCP | Servers from `claude mcp list` and their connection state | This session only (calls to `mcp__<server>__*` tools are refused) |

```sh
claude plugin install inventory-mod@claude-hub
```
