# hooks

**한국어** | [English](README.en.md)

Claude Code 이벤트마다 셸 명령을 실행하는 클래식 훅을 플러그인으로 묶어 둔다. 예: 프롬프트를 보낼 때 규칙 덧붙이기, 위험한 명령 막기, 작업이 끝나면 알림 보내기. 이름은 `<이름>-hook`.

## 구조

```
hooks/<이름>-hook/
  .claude-plugin/plugin.json
  hooks/hooks.json
  scripts/<스크립트>.sh
  README.md
```

`hooks/hooks.json` 예시:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/rule.sh\"" }] }
    ]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}`는 설치된 플러그인 폴더로 바뀌므로 스크립트를 플러그인 안에 함께 둔다. 경로에 공백이 있어도 깨지지 않도록 따옴표로 감싼다(`claude plugin validate`가 감싸지 않으면 경고한다).

## 꼭 지킬 것

- 훅은 설치한 사람의 권한으로 셸 명령을 실행한다. README에 **어떤 이벤트에 무엇을 실행하는지** 적는다. 받는 사람이 설치 전에 스크립트를 읽을 수 있게 하기 위해서다.
- 키나 토큰을 스크립트에 넣지 않는다.

## 확인

```sh
claude plugin validate hooks/<이름>-hook
```
