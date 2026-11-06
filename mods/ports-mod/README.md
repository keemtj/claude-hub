# ports-mod

**한국어** | [English](README.en.md)

`/ports-mod`로 옆 패널을 열면 이 세션이 띄운 프로세스가 열어 둔 TCP 포트(LISTEN)를 보여 준다. 로컬 주소면 `열기` 링크를 붙인다.

- 이 세션의 프로세스: 환경 변수 `CLAUDE_CODE_SESSION_ID`가 이 세션 ID인 프로세스(이 세션의 명령이 띄운 개발 서버 등, 백그라운드 포함)와 이 세션 Claude 프로세스의 자식(MCP 서버 등)
- 조회: `lsof -iTCP -sTCP:LISTEN`, `ps -E`(환경 변수), `ps -axo pid,ppid`(계보), `lsof -d cwd`(작업 폴더)
- 패널이 열려 있는 동안 5초마다, 그리고 Bash 명령이 끝날 때마다 다시 조회한다. 닫혀 있으면 아무 명령도 실행하지 않는다.
- 프로세스 실행 인자에서 비밀로 보이는 값(`--token`, `--password`, `api_key=` 같은 이름의 값, 주소의 사용자 정보)은 `***`로 가린다.
- `▸ 다른 프로세스의 포트 보기`로 이 세션과 상관없는 포트도 흐리게 볼 수 있다. `/ports-mod close`로 닫는다.

```sh
claude plugin install ports-mod@claude-hub
```
