# agents

**한국어** | [English](README.en.md)

역할과 쓸 수 있는 도구가 정해진 서브에이전트를 플러그인으로 묶어 둔다. Claude가 맞는 일을 맡기거나, 사용자가 직접 요청한다. 이름은 `<이름>-agent`.

## 구조

```
agents/<이름>-agent/
  .claude-plugin/plugin.json
  agents/<에이전트 이름>.md
  README.md
```

`agents/<에이전트 이름>.md` 예시:

```markdown
---
name: <에이전트 이름>
description: 어떤 일을 맡기면 되는지. Claude가 이 문장을 보고 일을 맡긴다.
tools: Read, Grep, Glob
---

에이전트에게 주는 지시
```

## 꼭 지킬 것

- 꼭 필요한 도구만 준다(`tools`). 파일을 고치거나 명령을 실행하는 도구를 줄 때는 README에 이유를 적는다.

## 확인

```sh
claude plugin validate agents/<이름>-agent
```
