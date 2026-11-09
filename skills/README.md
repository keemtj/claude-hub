# skills

**한국어** | [English](README.en.md)

Claude에게 작업 절차를 알려 주는 스킬을 플러그인으로 묶어 둔다. 필요한 작업이 오면 Claude가 설명(description)을 보고 불러 쓰고, `/<플러그인>:<스킬>`로 직접 부를 수도 있다. 이름은 `<이름>-skill`.

## 구조

```
skills/<이름>-skill/
  .claude-plugin/plugin.json
  skills/<스킬 이름>/SKILL.md
  skills/<스킬 이름>/references/   필요할 때 읽는 자료(선택)
  skills/<스킬 이름>/scripts/      스킬이 실행하는 스크립트(선택)
  README.md
```

`SKILL.md` 머리말 예시:

```markdown
---
name: <스킬 이름>
description: 무엇을 하고, 어떤 요청에서 써야 하는지. Claude가 이 문장을 보고 스킬을 고른다.
---
```

함께 쓰는 스킬 여러 개는 한 플러그인의 `skills/` 아래에 같이 둔다.

## 꼭 지킬 것

- 키, 토큰, 개인 정보를 스킬 본문에 넣지 않는다. 필요하면 사용자에게 묻거나 설정으로 받는다.

## 확인

```sh
claude plugin validate skills/<이름>-skill
```
