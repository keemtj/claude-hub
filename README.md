# claude-hub

keemtj가 만든 Claude Code 자산 모음(허브)이다. 폴더 하나가 독립 플러그인이고, 필요한 것만 골라 설치한다.

## 설치

```sh
/plugin marketplace add keemtj/claude-hub
/plugin install cat-gif-mod@claude-hub
```

이 저장소를 내려받아 개발할 때는 폴더를 마켓플레이스로 추가한다. 설치본이 폴더를 직접 읽으므로 고친 뒤 `/reload-plugins`만 하면 된다.

```sh
claude plugin marketplace add <이 폴더>
```

## mod

| 이름이자 명령 | 하는 일 |
|---|---|
| `workflow-mod` | 워크플로 진행 상황을 단계별로 옆 패널에 보여 주고, Clawd와 우주 장면을 띄운다 |
| `meditate-mod` | 프롬프트 위에서 우주를 떠다니는 Clawd를 켜고 끈다 |
| `accounts-mod` | 세션이 쓰는 서비스와 연결된 계정, 활성 여부를 옆 패널에 보여 준다 |
| `ports-mod` | 세션이 띄운 프로세스가 열어 둔 포트를 옆 패널에 보여 준다 |
| `inventory-mod` | 플러그인, 스킬, MCP 서버를 한 패널에서 보고 켜고 끈다 |
| `cat-gif-mod` | 옆 패널에 고양이 GIF를 보여 주고, 새로고침하면 바꾼다(GIPHY 키는 선택) |

슬래시 명령은 플러그인 이름과 같다. 자동완성이 부분 일치라서 `/mod`만 쳐도 모두 뜬다.

## 구조와 이름 규칙

```
.claude-plugin/marketplace.json   플러그인 목록
mods/      -mod     함수 훅 모듈(화면, 동작)
hooks/     -hook    클래식 훅(셸 명령)
skills/    -skill   스킬
mcp/       -mcp     MCP 연결(서버 코드는 별도 저장소)
agents/    -agent   서브에이전트
plugins/   -plugin  여러 종류 묶음
docs/               운영 문서
```

자산을 더할 때 따르는 규칙은 [docs/conventions.md](docs/conventions.md)에 있다.
