# mcp

[한국어](README.md) | **English**

Plugins that connect Claude to tools and services through an MCP server. Named `<name>-mcp`.

A server is a separate program with its own dependencies, build, version and release. Keep its code in its own repository and release it as an npm package or a remote URL; this folder holds only a **thin plugin with the connection**. Only a very small server that needs no build may live inside the plugin.

## Layout

```
mcp/<name>-mcp/
  .claude-plugin/plugin.json
  .mcp.json
  README.md
```

`.mcp.json` example:

```json
{
  "mcpServers": {
    "<name>": { "command": "npx", "args": ["-y", "<package>"] }
  }
}
```

For a remote server, use `"type": "http"` and a `"url"`.

## Must

- The README says what the server reaches and where it sends data.
- Tokens and addresses come in through `userConfig` (`sensitive`) in `plugin.json`.

## Check

```sh
claude plugin validate mcp/<name>-mcp
```
