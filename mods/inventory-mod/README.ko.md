# inventory-mod

[English](README.md) | **한국어**

`/inventory-mod`로 옆 패널을 열면 탭 세 개로 전역에 설치된 것을 보여 주고 켜고 끈다.

| 탭 | 보여 주는 것 | 토글 범위 |
|---|---|---|
| 플러그인 | `claude plugin list`의 플러그인·mod, 이 세션의 mod 폴더(`~/.claude/dev-mods/<세션>`) | 모든 세션 (`claude plugin enable/disable`, 이 세션은 `/reload-plugins` 후 반영). 인벤토리 자신과 세션 mod 폴더는 잠김 |
| 스킬 | `~/.claude/skills`의 개인 스킬, 플러그인별 스킬 개수 | 이 세션만 (Skill 도구 호출 거절, `/이름` 실행 시 꺼짐 안내). 외부 설치 링크 스킬은 잠김 |
| MCP | `claude mcp list`의 서버와 연결 상태 | 이 세션만 (`mcp__<서버>__*` 도구 호출 거절) |

```sh
claude plugin install inventory-mod@claude-hub
```
