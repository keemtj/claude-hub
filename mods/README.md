# mods

**한국어** | [English](README.en.md)

Claude Code 자체의 화면이나 동작을 바꾸는 함수 훅 모듈(mod)을 둔다. 대화 옆 패널, 프롬프트 위 띠, 상태 줄, 슬래시 명령, 도구 호출 가로채기 같은 것이다. 이름은 `<이름>-mod`이고, 슬래시 명령도 플러그인 이름과 같게 한다.

## 구조

```
mods/<이름>-mod/
  .claude-plugin/plugin.json     이름, 버전, 설명, 작성자, (상태를 쓰면) "types"
  hooks/hooks.json               { "modules": ["./register.tsx"] }
  hooks/register.tsx             export const register: Register = (on, options) => { ... }
  types/index.d.ts               $.state에 두는 값의 타입 계약(쓰는 경우)
  tests/*.test.ts(x)             claude plugin test로 도는 테스트
  README.md
```

## 확인

```sh
claude plugin validate mods/<이름>-mod
claude plugin test mods/<이름>-mod
```

mod를 처음 만든다면 Claude Code에 "mod 만들어 줘"라고 하면 mod 작성 안내(plugin-authoring 스킬)를 따라 함께 만든다.
