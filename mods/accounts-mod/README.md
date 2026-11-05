# accounts-mod

**English** | [한국어](README.ko.md)

`/accounts-mod` opens a side pane listing the services this session has actually used, plus those the project's settings point to, each with the account signed in to it now. Tokens and keys are never shown or stored.

- Where services come from: tool calls in the session transcript (git, gh, vercel, aws, eas, supabase, firebase, gcloud, npm and codex commands in Bash, MCP servers, artifacts), and the working folder's `.git`, `.vercel/project.json`, `eas.json`/`app.json`, `.firebaserc`, `supabase/config.toml`.
- How accounts are read: `git config user.email`, `gh auth status`, `vercel whoami`, `aws sts get-caller-identity`, `eas whoami`, `npm whoami`, `gcloud config get-value account`; for Codex, `account/read` of `codex app-server` (email and plan; auth files are not read); `claude auth status` (email, organization, plan).
- Which account is active: inside Orca, **the account Orca has active right now**. It reads Orca's `codex-runtime-home/shared-runtime-auth-provenance.json` (a file that also holds credentials) but takes only its `owner` and `accountId` and never shows or stores the rest. Elsewhere, the session's `CODEX_HOME`, or `~/.codex` without one.
- The transcript is scanned only for tool names and the start of Bash commands. A remote repository address is shown as host and path only (user info, query and fragment are removed).
- It checks when the pane opens and on [ 새로고침 ] (refresh), and again whenever the session uses a new service while the pane is open. Close it with `/accounts-mod close`.

```sh
claude plugin install accounts-mod@claude-hub
```
