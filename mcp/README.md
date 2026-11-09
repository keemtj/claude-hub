# mcp

**한국어** | [English](README.en.md)

MCP 서버를 통해 Claude를 도구나 서비스와 연결하는 플러그인을 둔다. 이름은 `<이름>-mcp`.

서버 코드는 따로 실행되는 프로그램이라 의존성, 빌드, 버전, 배포가 따로 필요하다. 그래서 서버 코드는 별도 저장소에서 관리해 npm 패키지나 원격 URL로 배포하고, 이 폴더에는 **연결 정보만 담은 얇은 플러그인**을 둔다. 빌드가 필요 없는 아주 작은 서버만 플러그인 안에 함께 둘 수 있다.

## 구조

```
mcp/<이름>-mcp/
  .claude-plugin/plugin.json
  .mcp.json
  README.md
```

`.mcp.json` 예시:

```json
{
  "mcpServers": {
    "<이름>": { "command": "npx", "args": ["-y", "<패키지>"] }
  }
}
```

원격 서버라면 `"type": "http"`와 `"url"`을 쓴다.

## 꼭 지킬 것

- 서버가 무엇에 접근하고 어디로 데이터를 보내는지 README에 적는다.
- 토큰과 주소는 `plugin.json`의 `userConfig`(`sensitive`)로 받는다.

## 확인

```sh
claude plugin validate mcp/<이름>-mcp
```
