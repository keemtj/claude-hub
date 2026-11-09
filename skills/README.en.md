# skills

[한국어](README.md) | **English**

Skills, packaged as plugins, that teach Claude a procedure. Claude picks one up from its description when a task calls for it; you can also run it as `/<plugin>:<skill>`. Named `<name>-skill`.

## Layout

```
skills/<name>-skill/
  .claude-plugin/plugin.json
  skills/<skill name>/SKILL.md
  skills/<skill name>/references/   material read when needed (optional)
  skills/<skill name>/scripts/      scripts the skill runs (optional)
  README.md
```

`SKILL.md` front matter example:

```markdown
---
name: <skill name>
description: What it does and which requests it is for. Claude picks the skill by this sentence.
---
```

Skills used together go under one plugin's `skills/`.

## Must

- No keys, tokens or personal information in a skill's body. Ask the user or take a setting instead.

## Check

```sh
claude plugin validate skills/<name>-skill
```
