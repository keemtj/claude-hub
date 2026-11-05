# workflow-mod

[English](README.md) | **한국어**

워크플로가 돌 때 옆 패널에 이름, 단계 색, 에이전트별 상태(◌ 대기, ● 진행, ✔ 완료, ✘ 실패), 움직이는 캐릭터를 보여 준다. 쉬는 동안(워크플로 없음, 끝남)에는 별 사이에 떠다니는 Clawd 장면을 보여 준다. `/workflow-mod`로 열고, Workflow 도구가 실행되면 자동으로 열린다(폭 144칸 이상).

허브(`keemtj/claude-hub`)에서 설치한다. 허브 폴더를 로컬 마켓플레이스로 추가하면 설치본이 이 폴더를 직접 읽는다.

```sh
# 설치 (한 번)
claude plugin marketplace add keemtj/claude-hub
claude plugin install workflow-mod@claude-hub
# 소스를 고친 뒤 실행 중인 세션에서
/reload-plugins
# 패널만 닫기: 패널 안 [ 닫기 ] 버튼, /workflow-mod close, 또는 ctrl+x x
# (Orca 터미널 창의 x는 Claude Code 세션까지 닫으니 누르지 않는다)
# 끄기 / 다시 켜기 / 지우기
claude plugin disable workflow-mod@claude-hub
claude plugin enable workflow-mod@claude-hub
claude plugin uninstall workflow-mod@claude-hub
```

검증: `claude plugin validate .`
