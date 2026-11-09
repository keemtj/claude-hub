# mods

[한국어](README.md) | **English**

Function hook modules (mods) that change Claude Code's own interface or behavior: a pane beside the chat, a band above the prompt, the status line, slash commands, intercepting tool calls. Named `<name>-mod`; the slash command matches the plugin name.

## Layout

```
mods/<name>-mod/
  .claude-plugin/plugin.json     name, version, description, author, "types" if it keeps state
  hooks/hooks.json               { "modules": ["./register.tsx"] }
  hooks/register.tsx             export const register: Register = (on, options) => { ... }
  types/index.d.ts               the type contract of what it keeps in $.state, if any
  tests/*.test.ts(x)             tests run by claude plugin test
  README.md
```

## Check

```sh
claude plugin validate mods/<name>-mod
claude plugin test mods/<name>-mod
```

New to mods? Ask Claude Code to "make a mod" and it walks you through with its mod-authoring guide (the plugin-authoring skill).
