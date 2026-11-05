# accounts-mod

`/accounts-mod`로 옆 패널을 열면, 이 세션이 실제로 쓴 서비스와 프로젝트 설정이 가리키는 서비스를 찾아 지금 로그인한 계정과 함께 보여 준다. 토큰과 키는 읽지 않는다.

- 찾는 근거: 세션 기록(transcript)의 도구 호출(Bash의 git·gh·vercel·aws·eas·supabase·firebase·gcloud·npm·codex 명령, MCP 서버, 아티팩트), 작업 폴더의 `.git`, `.vercel/project.json`, `eas.json`/`app.json`, `.firebaserc`, `supabase/config.toml`
- 계정 조회: `git config user.email`, `gh auth status`, `vercel whoami`, `aws sts get-caller-identity`, `eas whoami`, `npm whoami`, `gcloud config get-value account`, Codex는 `codex app-server`의 `account/read`(이메일·요금제, 인증 파일은 읽지 않음), `claude auth status`(이메일·조직·요금제)
- 활성 기준 (2026-11-05 결정): Orca에서 실행 중이면 **Orca가 지금 활성으로 둔 계정**(`codex-runtime-home/shared-runtime-auth-provenance.json`의 `owner`·`accountId`만 읽음, 토큰은 표시·기록하지 않음). 그 밖의 환경에서는 그 세션의 `CODEX_HOME`, 없으면 `~/.codex`.
- 패널을 열 때와 [ 새로고침 ] 때 조회하고, 패널이 열려 있는 동안 새 서비스를 쓰면 다시 조회한다. `/accounts-mod close`로 닫는다.

```sh
claude plugin install accounts-mod@claude-hub
```
