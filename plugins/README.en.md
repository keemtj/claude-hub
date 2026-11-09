# plugins

[한국어](README.md) | **English**

Bundles of several kinds: for example a few skills shipped with the hooks, commands and agents they use. Named `<name>-plugin`. A plugin of one kind goes in that kind's folder (`mods/`, `hooks/`, `skills/`, `mcp/`, `agents/`).

## Layout

```
plugins/<name>-plugin/
  .claude-plugin/plugin.json
  skills/        skills (optional)
  agents/        subagents (optional)
  commands/      slash commands (optional)
  hooks/         hooks or a mod (optional)
  .mcp.json      MCP connections (optional)
  README.md      what is inside and when to use each
```

## Check

```sh
claude plugin validate plugins/<name>-plugin
```
