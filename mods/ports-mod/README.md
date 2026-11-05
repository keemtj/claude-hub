# ports-mod

**English** | [한국어](README.ko.md)

`/ports-mod` opens a side pane listing the TCP ports (LISTEN) held by processes this session started. Local addresses get an `열기` (open) link.

- This session's processes: those whose `CLAUDE_CODE_SESSION_ID` environment variable is this session's id (dev servers its commands started, background ones included), and children of this session's Claude process (MCP servers and the like).
- How it looks: `lsof -iTCP -sTCP:LISTEN`, `ps -E` (environment), `ps -axo pid,ppid` (ancestry), `lsof -d cwd` (working folder).
- It looks again every 5 seconds while the pane is open, and after each Bash command. With the pane closed it runs nothing.
- Values in process arguments that look secret (values named like `--token`, `--password`, `api_key=`, and user info in addresses) are shown as `***`.
- `▸ 다른 프로세스의 포트 보기` (show other processes' ports) also lists, dimmed, ports unrelated to this session. Close it with `/ports-mod close`.

```sh
claude plugin install ports-mod@claude-hub
```
