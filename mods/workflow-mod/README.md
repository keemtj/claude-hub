# workflow-mod

**English** | [한국어](README.ko.md)

While a workflow runs, a side pane shows its name, a color per phase, each agent's state (◌ waiting, ● running, ✔ done, ✘ failed) and a moving character. Between runs (no workflow, or finished) it shows Clawd drifting among the stars. Open it with `/workflow-mod`; it also opens on its own when the Workflow tool runs (terminal 144 columns or wider).

Install it from the hub (`keemtj/claude-hub`). If you add a local clone of the hub as a marketplace, the installed plugin reads this folder directly.

```sh
# Install (once)
claude plugin marketplace add keemtj/claude-hub
claude plugin install workflow-mod@claude-hub
# After editing the source, in a running session
/reload-plugins
# Close only the pane: the [ 닫기 ] (close) button in the pane, /workflow-mod close, or ctrl+x x
# (In Orca, the terminal window's x closes the Claude Code session too)
# Disable / enable / remove
claude plugin disable workflow-mod@claude-hub
claude plugin enable workflow-mod@claude-hub
claude plugin uninstall workflow-mod@claude-hub
```

Check: `claude plugin validate .`
