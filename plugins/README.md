# plugins

**한국어** | [English](README.en.md)

여러 종류가 섞인 묶음을 둔다. 예: 스킬 몇 개와 그 스킬이 쓰는 훅, 명령, 에이전트를 함께 배포하는 경우. 이름은 `<이름>-plugin`. 한 종류만 있으면 그 종류의 폴더(`mods/`, `hooks/`, `skills/`, `mcp/`, `agents/`)에 둔다.

## 구조

```
plugins/<이름>-plugin/
  .claude-plugin/plugin.json
  skills/        스킬(선택)
  agents/        서브에이전트(선택)
  commands/      슬래시 명령(선택)
  hooks/         훅 또는 mod(선택)
  .mcp.json      MCP 연결(선택)
  README.md      무엇이 들어 있고 각각 언제 쓰는지
```

## 확인

```sh
claude plugin validate plugins/<이름>-plugin
```
