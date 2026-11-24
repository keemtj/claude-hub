# todo-mod

[한국어](README.md) | **English**

Keeps one to-do list per repository (git root) and shows it in a side pane. The list stays with the repository across sessions. It exists so Claude does not lose unfinished work when one long-running session gets compacted or a new request cuts into a task.

- **Catches requests that cut in:** when you send a message while Claude is working, the running task (▶) and the new request (☐) are added to the list.
- **Reminds on every prompt:** while items are open, each prompt carries the list and a note not to drop them. It reminds; it does not force.
- **Claude manages it:** Claude adds items and marks them in progress or done with the `todo` tool. Claude decides when an item is done.
- **Per repository:** the key is the path `git rev-parse --show-toplevel` returns from the session's project root, stored in `$.store`; outside git, the project root itself. Each Orca worktree gets its own list.
- **Moving:** when `/cd` or a worktree move changes the project root, the pane switches to that repository's list within two seconds. A shell `cd` (`!cd`, Claude's Bash) is not followed.
- **Pane:** the repository name on top, boxes for in progress, waiting and done below, and a cat whose face follows the state.

```sh
claude plugin install todo-mod@claude-hub
```

## Usage

| Command | What it does |
|---|---|
| `/todo-mod` | Open the pane and print the list |
| `/todo-mod <text>` | Add an item (waiting ☐) |
| `/todo-mod start <n>` | Mark in progress (▶) |
| `/todo-mod done <n>` | Mark done (✔) |
| `/todo-mod rm <n>` | Remove |
| `/todo-mod clear` | Remove every done item |

In the pane, press an item's mark (☐ ▶ ✔) to cycle its state, `×` to remove it, and `[완료 정리]` in the done box to clear done items.

An item you add with `/todo-mod` is only a note. To have Claude do it, ask in words, such as "do #3".

## Known limits

- Every message sent mid-turn is added, whether it is new work, a correction to the running task, or small talk.
- An item's name is the prompt's first line (up to 60 characters), so a greeting on the first line becomes the name.

## Tests

```sh
claude plugin test mods/todo-mod
```

## Credit

Built, with permission, on a session-todo mod (a per-session to-do pane) an acquaintance shared, adding per-repository storage, following project-root moves, a done box and the repository name line.
