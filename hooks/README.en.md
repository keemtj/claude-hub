# hooks

[한국어](README.md) | **English**

Classic hooks, packaged as plugins, that run a shell command on a Claude Code event: adding rules when a prompt is sent, blocking risky commands, notifying when work is done. Named `<name>-hook`.

## Layout

```
hooks/<name>-hook/
  .claude-plugin/plugin.json
  hooks/hooks.json
  scripts/<script>.sh
  README.md
```

`hooks/hooks.json` example:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/rule.sh\"" }] }
    ]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` becomes the installed plugin's folder, so the script ships inside the plugin. Quote it so a path with spaces does not break (`claude plugin validate` warns when it is unquoted).

## Must

- A hook runs shell commands with the permissions of whoever installs it. The README says **what runs on which event**, so people can read the script before installing.
- No keys or tokens in the scripts.

## Check

```sh
claude plugin validate hooks/<name>-hook
```
