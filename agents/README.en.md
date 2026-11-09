# agents

[한국어](README.md) | **English**

Subagents, packaged as plugins, each with its own role and set of tools. Claude hands them work that fits, or you ask for one. Named `<name>-agent`.

## Layout

```
agents/<name>-agent/
  .claude-plugin/plugin.json
  agents/<agent name>.md
  README.md
```

`agents/<agent name>.md` example:

```markdown
---
name: <agent name>
description: What to hand it. Claude delegates by this sentence.
tools: Read, Grep, Glob
---

Instructions for the agent
```

## Must

- Give only the tools it needs (`tools`). When it gets tools that edit files or run commands, the README says why.

## Check

```sh
claude plugin validate agents/<name>-agent
```
