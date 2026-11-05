# Hub conventions

**English** | [한국어](conventions.ko.md)

The rules for adding assets to this repository.

## Layout

The hub is a monorepo where each folder is a standalone plugin (package). The root `.claude-plugin/marketplace.json` is the full list; the blog's `/hub` page is built from that list and each plugin's `README.md` and `media/`.

```
.claude-plugin/marketplace.json
mods/      function hook modules
hooks/     classic hooks
skills/    skills
mcp/       MCP connections
agents/    subagents
plugins/   bundles of several kinds
docs/
```

## Names

A plugin's name ends with its kind. Claude Code's slash command completion matches anywhere in the name, so typing `/mod`, for example, lists every mod.

| Suffix | What it holds |
|---|---|
| `-mod` | A function hook module (`modules` in `hooks/hooks.json`) that changes the UI or behavior: panes, bands, commands. Its slash command matches the plugin name |
| `-hook` | Classic hooks (`hooks` in `hooks/hooks.json`) that run shell commands on events |
| `-skill` | Skills |
| `-mcp` | An MCP server connection (`.mcp.json`) |
| `-agent` | Subagent definitions |
| `-plugin` | A bundle of several kinds |

Each entry in `marketplace.json` has a `category` (mod, hook, skill, mcp, agent, plugin).

## What each plugin has

- `.claude-plugin/plugin.json`: name, version, one-line description, author
- `README.md` (English) and `README.ko.md` (Korean): what it does, install, commands, settings, and the terms of any third-party service it uses
- `media/`: preview images or GIFs (the blog's `/hub` cards)
- `tests/` for behavior that can be tested
- Bump `version` with every change. Bump the minor version for changes that alter the install id or stored state keys (a rename, for example)

## Secrets

- Never put keys or tokens in the repository. When a plugin needs one from the user, declare it as a `sensitive` `userConfig` field (it is kept in the keychain).
- If a value shown on screen could carry a secret (a URL inside an error message, process arguments, a remote address), strip it before showing it, and add a test that reproduces the case with synthetic values.
- A `-hook` runs shell commands with the permissions of whoever installs it, so its README says what it runs and when.

## Install

```sh
/plugin marketplace add keemtj/claude-hub
/plugin install <name>@claude-hub
```

There is no command that installs a whole marketplace at once. To use several plugins together, list them under `extraKnownMarketplaces` and `enabledPlugins` in `settings.json`, or run `install` for each.

## MCP servers

An MCP server is a separate program with its own dependencies, build, version and release. Keep its code in its own repository and release it as an npm package or a remote URL; the hub holds only a thin `-mcp` plugin with the connection (`npx -y <package>` or the URL in `.mcp.json`). Only a very small server that needs no build may live inside the hub.
