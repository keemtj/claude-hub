// Parsing lsof and ps output. Pure functions, so they can be checked outside
// the engine.

export type Listener = { pid: number; name: string; addresses: string[] }

// `lsof -F pcn`: a `p` line starts a process, `c` names it, `n` is an address.
export function parseListeners(text: string): Map<number, Listener> {
  const byPid = new Map<number, Listener>()
  let current: Listener | undefined
  for (const line of text.split('\n')) {
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') {
      const pid = Number(value)
      current = byPid.get(pid) ?? { pid, name: '', addresses: [] }
      byPid.set(pid, current)
    } else if (tag === 'c' && current) {
      current.name = value
    } else if (tag === 'n' && current && !current.addresses.includes(value)) {
      current.addresses.push(value)
    }
  }
  return byPid
}

export function portOf(address: string): number | undefined {
  const port = Number(address.slice(address.lastIndexOf(':') + 1))
  return Number.isInteger(port) && port > 0 ? port : undefined
}

// `ps -axo pid=,ppid=,comm=`: who started whom.
export function parseParents(text: string): Map<number, { ppid: number; comm: string }> {
  const out = new Map<number, { ppid: number; comm: string }>()
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (match) out.set(Number(match[1]), { ppid: Number(match[2]), comm: match[3] ?? '' })
  }
  return out
}

// The nearest `claude` process above `pid`: the session the mod runs in.
export function findClaudeAncestor(
  pid: number,
  parents: Map<number, { ppid: number; comm: string }>,
): number | undefined {
  let at: number | undefined = pid
  for (let hops = 0; at && at > 1 && hops < 32; hops += 1) {
    const row = parents.get(at)
    if (!row) return undefined
    if (/(^|\/)claude$/.test(row.comm)) return at
    at = row.ppid
  }
  return undefined
}

export function isDescendant(
  pid: number,
  root: number,
  parents: Map<number, { ppid: number; comm: string }>,
): boolean {
  let at: number | undefined = pid
  for (let hops = 0; at && at > 1 && hops < 64; hops += 1) {
    if (at === root) return true
    at = parents.get(at)?.ppid
  }
  return false
}

// `ps -E -o pid=,command=`: the command line with the environment after it.
// Returns the pids whose environment names this session.
export function pidsWithSession(text: string, sessionId: string): Set<number> {
  const out = new Set<number>()
  const marker = `CLAUDE_CODE_SESSION_ID=${sessionId}`
  for (const line of text.split('\n')) {
    const pid = Number(line.trim().match(/^(\d+)\s/)?.[1])
    if (pid && line.includes(marker)) out.add(pid)
  }
  return out
}

// `ps -o pid=,args=`: each pid's command line.
export function parseArgs(text: string): Map<number, string> {
  const out = new Map<number, string>()
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/)
    if (match) out.set(Number(match[1]), match[2] ?? '')
  }
  return out
}

// `lsof -a -d cwd -F pn`: each pid's working directory.
export function parseCwds(text: string): Map<number, string> {
  const out = new Map<number, string>()
  let pid = 0
  for (const line of text.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n' && pid) out.set(pid, line.slice(1))
  }
  return out
}

// A long command line, with the home folder shortened and paths trimmed to
// their last part so the interesting words fit.
export function shortArgs(args: string, home: string | undefined, max = 60): string {
  let text = home ? args.split(home).join('~') : args
  text = text.replace(/(\S*\/)(node_modules\/\.bin\/|bin\/)?([^/\s]+)/g, (_, _dir, _bin, last) => last)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
