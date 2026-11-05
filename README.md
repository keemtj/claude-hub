# claude-hub

**English** | [한국어](README.ko.md)

A personal collection of Claude Code assets by keemtj. Each folder is a standalone plugin; install only the ones you want.

## Install

```sh
/plugin marketplace add keemtj/claude-hub
/plugin install cat-gif-mod@claude-hub
```

To develop on a local clone, add the folder itself as a marketplace. Installed plugins read the folder directly, so after editing just run `/reload-plugins`.

```sh
claude plugin marketplace add <path-to-this-folder>
```

## Mods

| Name and command | What it does |
|---|---|
| `workflow-mod` | Shows a workflow's progress phase by phase in a side pane, with Clawd floating in space between runs |
| `meditate-mod` | Toggles Clawd drifting through space above the prompt |
| `accounts-mod` | Shows the services the session uses and the accounts signed in to them, active or not, in a side pane |
| `ports-mod` | Shows the ports opened by processes the session started, in a side pane |
| `inventory-mod` | Lists plugins, skills and MCP servers in one pane and turns them on or off |
| `cat-gif-mod` | Shows a cat GIF in a side pane and swaps it on refresh (GIPHY key optional) |

Each slash command matches its plugin name. Command completion matches anywhere in the name, so typing `/mod` lists them all.

## Layout and naming

```
.claude-plugin/marketplace.json   plugin list
mods/      -mod     function hook modules (UI, behavior)
hooks/     -hook    classic hooks (shell commands)
skills/    -skill   skills
mcp/       -mcp     MCP connections (server code lives in its own repo)
agents/    -agent   subagents
plugins/   -plugin  bundles of several kinds
docs/               maintainer docs
```

The rules for adding assets are in [docs/conventions.md](docs/conventions.md).

## License

[MIT](LICENSE). Some mods fetch content from third-party services at run time; see each mod's README for the terms that apply.
