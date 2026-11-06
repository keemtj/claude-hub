# 허브 규칙

**한국어** | [English](conventions.en.md)

이 저장소에 자산을 더할 때 따르는 규칙이다.

## 구조

허브는 모노레포이고, 폴더 하나가 독립 플러그인(패키지)이다. 루트의 `.claude-plugin/marketplace.json`이 전체 목록이며, 블로그 `/hub` 페이지도 이 목록과 각 플러그인의 `README.md`, `media/`를 읽어 만든다.

```
.claude-plugin/marketplace.json
mods/      함수 훅 모듈
hooks/     클래식 훅
skills/    스킬
mcp/       MCP 연결
agents/    서브에이전트
plugins/   여러 종류 묶음
docs/
```

## 이름

플러그인 이름 끝에 종류를 붙인다. Claude Code의 슬래시 명령 자동완성이 부분 일치라서, 예를 들어 `/mod`만 쳐도 모든 mod가 뜬다.

| 접미사 | 내용 |
|---|---|
| `-mod` | 함수 훅 모듈(`hooks/hooks.json`의 `modules`): 패널, 띠, 명령 등 화면과 동작을 바꾼다. 슬래시 명령은 플러그인 이름과 같게 한다 |
| `-hook` | 클래식 훅(`hooks/hooks.json`의 `hooks`): 이벤트마다 셸 명령을 실행한다 |
| `-skill` | 스킬 |
| `-mcp` | MCP 서버 연결(`.mcp.json`) |
| `-agent` | 서브에이전트 정의 |
| `-plugin` | 여러 종류가 섞인 묶음 |

`marketplace.json`의 각 항목에는 `category`(mod, hook, skill, mcp, agent, plugin)를 적는다.

## 플러그인 하나에 갖출 것

- `.claude-plugin/plugin.json`: 이름, 버전, 한 줄 설명, 작성자
- `README.md`(한국어)와 `README.en.md`(영어): 무엇을 하는지, 설치, 명령, 설정, 외부 서비스를 쓰면 그 약관
- `media/`: 미리보기 이미지나 GIF(블로그 `/hub` 카드)
- 테스트가 가능한 동작은 `tests/`
- 바꿀 때마다 `version`을 올린다. 설치 ID나 저장 상태 키가 바뀌는 변경(이름 변경 등)은 minor를 올린다

## 비밀 값

- 키나 토큰은 저장소에 넣지 않는다. 사용자에게 받아야 하면 `userConfig`의 `sensitive` 항목으로 선언한다(키체인에 저장된다).
- 화면에 보여 주는 값에 비밀이 섞일 수 있으면(오류 메시지에 든 URL, 프로세스 인자, 원격 주소) 보여 주기 전에 지우고, 합성 값으로 재현하는 테스트를 둔다.
- `-hook`은 설치한 사람의 권한으로 셸 명령을 실행하므로, README에 무엇을 언제 실행하는지 적는다.

## 설치

```sh
/plugin marketplace add keemtj/claude-hub
/plugin install <이름>@claude-hub
```

마켓플레이스 전체를 한 번에 설치하는 명령은 없다. 여러 개를 함께 쓰려면 `settings.json`의 `extraKnownMarketplaces`와 `enabledPlugins`에 적거나, 플러그인마다 `install`을 실행한다.

## MCP 서버

MCP 서버는 따로 실행되는 프로그램이라 의존성, 빌드, 버전, 배포가 따로 필요하다. 서버 코드는 별도 저장소에서 관리해 npm 패키지나 원격 URL로 배포하고, 허브에는 연결 정보만 담은 얇은 `-mcp` 플러그인(`.mcp.json`에 `npx -y <패키지>`나 URL)을 둔다. 빌드가 필요 없는 아주 작은 서버만 허브 안에 함께 둘 수 있다.
