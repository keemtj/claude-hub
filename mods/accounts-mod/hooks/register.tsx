import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AccountLine, AccountsView, ServiceRow } from '../types'
import { CATEGORIES, categoryOf, displayName, record, scanTranscript, sortRows, usageText } from './detect'
import type { Detected } from './detect'

const PANE = 'accounts-mod'
const TITLE = 'Accounts'
// Change the tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload.
const view = atom(
  { plugin: 'accounts-mod', key: 'view' } as const,
  { rows: [], isChecking: false },
  { shape: 'view-5' },
)

// Tool calls seen live since the last full scan of the transcript.
let live: Detected = new Map()
let transcriptPath: string | undefined
let isRefreshing = false

// ---- Where the session's record is ------------------------------------------

async function findTranscript($: EngineInterface): Promise<string | undefined> {
  if (transcriptPath) return transcriptPath
  try {
    const id = await $.session.id()
    const cwd = await $.session.cwd()
    const home = cwd.match(/^\/(?:Users|home)\/[^/]+/)?.[0]
    if (!home) return undefined
    const projects = `${home}/.claude/projects`
    const guess = `${projects}/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${id}.jsonl`
    if (await $.fs.exists(guess)) return (transcriptPath = guess)
    for (const entry of await $.fs.list(projects)) {
      const path = `${projects}/${entry.name}/${id}.jsonl`
      if (entry.kind === 'dir' && (await $.fs.exists(path))) return (transcriptPath = path)
    }
  } catch {}
  return undefined
}

// The transcript can be far past what one read may copy, so grep pulls out
// only the tool names and Bash commands.
async function scanSession($: EngineInterface): Promise<Detected> {
  const path = await findTranscript($)
  if (!path) return new Map(live)
  try {
    const { stdout } = await $.process.run(
      [
        'grep',
        '-oE',
        '"type":"tool_use","id":"[^"]+","name":"[^"]+"(,"input":\\{"command":"[^"]{0,250})?',
        path,
      ],
      { timeoutMs: 15000 },
    )
    live = new Map()
    return scanTranscript(stdout)
  } catch {
    return new Map(live)
  }
}

// ---- What the project points at ---------------------------------------------

type Hint = { id: string; reason: string; detail?: string }

async function readJson($: EngineInterface, path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await $.fs.read(path)) as Record<string, unknown>
  } catch {
    return undefined
  }
}

async function projectHints($: EngineInterface, cwd: string): Promise<Hint[]> {
  const hints: Hint[] = []
  const has = (path: string) => $.fs.exists(`${cwd}/${path}`).catch(() => false)
  if (await has('.git')) hints.push({ id: 'git', reason: 'git 저장소' })
  const vercel = await readJson($, `${cwd}/.vercel/project.json`)
  if (vercel) {
    const name = typeof vercel.projectName === 'string' ? vercel.projectName : undefined
    hints.push({ id: 'vercel', reason: '.vercel 연결', detail: name ? `프로젝트 ${name}` : undefined })
  }
  if ((await has('eas.json')) || (await has('app.json'))) {
    const app = await readJson($, `${cwd}/app.json`)
    const expo = app?.expo as Record<string, unknown> | undefined
    const owner = typeof expo?.owner === 'string' ? expo.owner : undefined
    if ((await has('eas.json')) || owner) {
      hints.push({ id: 'expo', reason: 'eas/app 설정', detail: owner ? `owner ${owner}` : undefined })
    }
  }
  if (await has('.firebaserc')) hints.push({ id: 'firebase', reason: '.firebaserc' })
  if (await has('supabase/config.toml')) hints.push({ id: 'supabase', reason: 'supabase 설정' })
  return hints
}

// ---- Who is signed in now ---------------------------------------------------

type Check = { account?: string; detail?: string; note?: string; accounts?: AccountLine[] }

async function run($: EngineInterface, argv: string[], cwd: string): Promise<string | undefined> {
  try {
    // Answers come on stdout; some CLIs print banners and status on stderr.
    const { stdout, stderr } = await $.process.run(argv, { cwd, timeoutMs: 15000 })
    return stdout.trim() || stderr.trim() || undefined
  } catch {
    return undefined
  }
}

const STATE_LOOK: Record<AccountLine['state'], { label: string; color: string }> = {
  active: { label: '  활성  ', color: 'green' },
  inactive: { label: ' 비활성 ', color: 'gray' },
}

// The state label's column: '  활성  ', ' 비활성 ' and '확인불가' are all 8 cells.
const LABEL_WIDTH = 8

const firstLine = (text: string | undefined) =>
  text
    ?.split('\n')
    .map(line => line.replace(/^[>\s]+/, '').trim())
    .find(Boolean)

// A remote URL can carry a token: keep only the host and path.
const cleanRemote = (url: string) => url.replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '')

// Codex says who is signed in only through its app-server protocol
// (account/read). The server stops when its input closes, so the input stays
// open until the answer arrives and the loop ends, which ends the process.
const CODEX_REQUESTS = [
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"accounts-mod","version":"0.4.0"}}}',
  '{"jsonrpc":"2.0","method":"initialized"}',
  '{"jsonrpc":"2.0","id":2,"method":"account/read","params":{}}',
]

type CodexAccount = { type?: string; email?: string; planType?: string }

async function codexAccount(
  $: EngineInterface,
  cwd: string,
  codexHome?: string,
): Promise<CodexAccount | undefined> {
  const script = `(printf '%s\\n' ${CODEX_REQUESTS.map(r => `'${r}'`).join(' ')}; sleep 15) | codex app-server 2>/dev/null`
  let buffered = ''
  const started = Date.now()
  try {
    const env = codexHome ? { CODEX_HOME: codexHome } : undefined
    for await (const piece of $.process.spawn({ argv: ['sh', '-c', script], cwd, env })) {
      if (!('text' in piece)) break
      if (piece.stream !== 'stdout') continue
      buffered += piece.text
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as { id?: number; result?: { account?: CodexAccount | null } }
          if (message.id === 2) return message.result?.account ?? undefined
        } catch {}
      }
      if (Date.now() - started > 15000) break
    }
  } catch {}
  return undefined
}

// ---- Where this Claude runs -----------------------------------------------------
// The terminal or multiplexer around the session decides where Codex keeps its
// login. Orca manages accounts of its own (one Codex home per account, chosen per
// pane); everything else uses CODEX_HOME, or ~/.codex.

type Host = { name: string; orcaData?: string; codexHome?: string; orcaWorktree?: string }

let host: Host | undefined

async function detectHost($: EngineInterface, cwd: string): Promise<Host> {
  if (host) return host
  // name=value lines, so an empty variable never shifts the others.
  const text = (await run(
    $,
    [
      'sh',
      '-c',
      'for v in TERM_PROGRAM TMUX ORCA_USER_DATA_PATH ORCA_WORKTREE_ID CODEX_HOME ZELLIJ CMUX_SOCKET_PATH CMUX_WORKSPACE_ID HERDR_SESSION HERDR_PANE; do eval "printf \\"%s=%s\\\\n\\" \\"$v\\" \\"\\$$v\\""; done',
    ],
    cwd,
  )) ?? ''
  const vars = new Map(
    text.split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)] as const),
  )
  const term = vars.get('TERM_PROGRAM') ?? ''
  const tmux = vars.get('TMUX') ?? ''
  const orca = vars.get('ORCA_USER_DATA_PATH') ?? ''
  const codexHome = vars.get('CODEX_HOME') ?? ''
  const zellij = vars.get('ZELLIJ') ?? ''
  const cmux = (vars.get('CMUX_SOCKET_PATH') ?? '') + (vars.get('CMUX_WORKSPACE_ID') ?? '')
  const herdr = (vars.get('HERDR_SESSION') ?? '') + (vars.get('HERDR_PANE') ?? '')
  const name = orca || term === 'Orca'
    ? 'Orca'
    : cmux || /cmux/i.test(term)
      ? 'cmux'
      : herdr || /herdr/i.test(term)
        ? 'herdr'
        : tmux
          ? 'tmux'
          : zellij
            ? 'zellij'
            : term || '터미널'
  const orcaWorktree = vars.get('ORCA_WORKTREE_ID') ?? ''
  host = { name, orcaData: orca || undefined, codexHome: codexHome || undefined, orcaWorktree: orcaWorktree || undefined }
  return host
}


// Orca's per-pane choice holds ids only (no credentials): which account home a
// Codex pane runs with, or the real ~/.codex.
// Orca's active Codex account: `owner` "managed" with the account id it runs,
// or "system-default" for ~/.codex. The file also holds credentials, so only
// those two fields are taken from it, and nothing of it is shown or logged.
async function orcaActiveAccount($: EngineInterface, orcaData: string): Promise<string | 'default' | undefined> {
  try {
    const text = await $.fs.read(`${orcaData}/codex-runtime-home/shared-runtime-auth-provenance.json`)
    const data = JSON.parse(text) as { owner?: unknown; accountId?: unknown }
    if (data.owner === 'managed' && typeof data.accountId === 'string') return data.accountId
    if (data.owner === 'system-default') return 'default'
  } catch {}
  return undefined
}

async function checkService($: EngineInterface, id: string, cwd: string): Promise<Check> {
  switch (id) {
    case 'git': {
      // Every scope that sets the commit identity; the last one wins.
      const text = (await run($, ['git', 'config', '--show-scope', '--get-all', 'user.email'], cwd)) ?? ''
      const name = firstLine(await run($, ['git', 'config', 'user.name'], cwd))
      const remote = firstLine(await run($, ['git', 'remote', 'get-url', 'origin'], cwd))
      const isRemote = remote !== undefined && /^(https?:\/\/|ssh:\/\/|git@)/.test(remote)
      const SCOPE: Record<string, string> = {
        local: '저장소',
        global: '전역',
        system: '시스템',
        worktree: '워크트리',
      }
      const rows = text
        .split('\n')
        .map(line => line.split('\t'))
        .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[1]))
      const accounts: AccountLine[] = rows
        .map(([scope, email], i) => ({
          value: i === rows.length - 1 && name ? `${name} <${email}>` : email,
          state: (i === rows.length - 1 ? 'active' : 'inactive') as AccountLine['state'],
          details: i === rows.length - 1 ? [`${SCOPE[scope] ?? scope} 설정`] : [`${SCOPE[scope] ?? scope} 설정`, '덮어써짐'],
        }))
        .reverse()
      return {
        account: accounts[0]?.value,
        accounts,
        detail: isRemote ? cleanRemote(remote) : undefined,
        note: accounts.length ? undefined : '커밋 계정 미설정',
      }
    }
    case 'github': {
      // gh may hold several accounts per host; one per host is active.
      const text = await run($, ['gh', 'auth', 'status'], cwd)
      if (!text) return { note: 'gh 명령 없음' }
      const accounts: AccountLine[] = []
      let hostName = 'github.com'
      let pending: AccountLine | undefined
      for (const line of text.split('\n')) {
        if (/^\S/.test(line)) hostName = line.trim()
        const login = line.match(/Logged in to (\S+) account (\S+)/)
        if (login) {
          const server = login[1] ?? hostName
          pending = { value: login[2] ?? '', state: 'inactive', details: server === 'github.com' ? undefined : [server] }
          accounts.push(pending)
        }
        if (pending && /Active account:\s*true/.test(line)) pending.state = 'active'
      }
      accounts.sort((a, b) => (a.state === 'active' ? -1 : 0) - (b.state === 'active' ? -1 : 0))
      return accounts.length ? { account: accounts[0]?.value, accounts } : { note: '로그인 안 됨' }
    }
    case 'vercel': {
      const who = firstLine(await run($, ['vercel', 'whoami'], cwd))
      return who && !/error|not|log in/i.test(who) ? { account: who } : { note: who ? '로그인 안 됨' : 'vercel 명령 없음' }
    }
    case 'aws': {
      const arn = firstLine(await run($, ['aws', 'sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text'], cwd))
      return arn?.startsWith('arn:') ? { account: arn } : { note: '자격 증명 확인 실패' }
    }
    case 'expo': {
      const who = firstLine(await run($, ['eas', 'whoami'], cwd))
      return who && !/not logged|error/i.test(who) ? { account: who } : { note: who ? '로그인 안 됨' : 'eas 명령 없음' }
    }
    case 'npm': {
      const who = firstLine(await run($, ['npm', 'whoami'], cwd))
      return who && !/ERR/i.test(who) ? { account: who } : { note: '로그인 안 됨' }
    }
    case 'gcloud': {
      const who = firstLine(await run($, ['gcloud', 'config', 'get-value', 'account'], cwd))
      return who ? { account: who } : { note: 'gcloud 명령 없음' }
    }
    case 'codex': {
      const where = await detectHost($, cwd)
      // Three lines for every agent: how it signs in, the plan (what it bills
      // under, related facts joined), where the login lives.
      const how = (account: CodexAccount) => (account.type === 'apiKey' ? 'API 키' : '구독')
      const plan = (account: CodexAccount) =>
        account.type === 'apiKey' ? undefined : ['ChatGPT', account.planType].filter(Boolean).join(' · ')
      const lines = (account: CodexAccount, source: string) =>
        [how(account), plan(account), source].filter((line): line is string => Boolean(line))
      // In Orca the active account is the one Orca runs Codex with; elsewhere
      // it is what codex from this session uses (CODEX_HOME, else ~/.codex).
      const accounts: AccountLine[] = []
      const mine = await codexAccount($, cwd, where.codexHome)
      if (where.orcaData) {
        const active = await orcaActiveAccount($, where.orcaData)
        const ids = (await $.fs.list(`${where.orcaData}/codex-accounts`).catch(() => []))
          .filter(entry => entry.kind === 'dir')
          .map(entry => entry.name)
        for (const id of ids) {
          const who = await codexAccount($, cwd, `${where.orcaData}/codex-accounts/${id}/home`)
          if (!who?.email) continue
          accounts.push({
            value: who.email,
            state: id === active ? 'active' : 'inactive',
            details: lines(who, 'Orca 관리'),
          })
        }
        if (mine?.email) {
          accounts.push({
            value: mine.email,
            state: active === 'default' ? 'active' : 'inactive',
            // Orca offers the system default in its own account picker too.
            details: lines(mine, ['시스템 기본', 'Orca 관리', where.codexHome].filter(Boolean).join(' · ')),
          })
        }
        accounts.sort((a, b) => Number(b.state === 'active') - Number(a.state === 'active'))
        return accounts.length ? { account: accounts[0]?.value, accounts } : { note: '로그인 안 됨' }
      }
      if (mine?.email) {
        return {
          account: mine.email,
          accounts: [{ value: mine.email, state: 'active', details: lines(mine, where.codexHome ?? '기본 로그인') }],
        }
      }
      const status = firstLine(await run($, ['codex', 'login', 'status'], cwd))
      if (!status) return { note: 'codex 명령 없음' }
      if (/not logged in/i.test(status)) return { note: '로그인 안 됨' }
      const method = status.match(/using (.+)$/i)?.[1]
      return { account: method ? `${method} 로그인` : status }
    }
    case 'claude': {
      const text = await run($, ['claude', 'auth', 'status'], cwd)
      try {
        const status = JSON.parse(text ?? '') as Record<string, unknown>
        const pick = (key: string) => (typeof status[key] === 'string' ? (status[key] as string) : undefined)
        const email = pick('email')
        const method = pick('authMethod')
        const provider = pick('apiProvider')
        // claude.ai is a subscription login; console and keys bill the API.
        const how =
          provider && provider !== 'firstParty'
            ? provider
            : method === 'claude.ai'
              ? '구독'
              : method
                ? 'API 키'
                : undefined
        // The login lives in a config folder: ~/.claude is the default one.
        const folder = pick('configDirectory')
        const isDefault = !folder || /\/\.claude\/?$/.test(folder)
        const details = [
          how,
          [pick('orgName'), pick('subscriptionType')].filter(Boolean).join(' · ') || undefined,
          isDefault ? '시스템 기본' : `설정 폴더 ${folder}`,
        ].filter((line): line is string => Boolean(line))
        if (email) return { account: email, accounts: [{ value: email, state: 'active', details }] }
        if (status.loggedIn === false) return { note: '로그인 안 됨' }
      } catch {}
      const who = await $.session.identity().catch(() => undefined)
      const email = who && 'email' in who ? who.email : undefined
      return email ? { account: email } : { note: '계정 확인 실패' }
    }
    case 'mcp:figma-desktop':
      return { note: 'Figma 데스크톱 앱에 로그인한 계정' }
    default:
      if (id.startsWith('mcp:claude_ai_')) return { note: 'claude.ai에 연결한 커넥터 계정' }
      if (id.startsWith('mcp:')) return { note: '이 MCP 서버의 설정을 따름' }
      return { note: '확인 명령 없음' }
  }
}

// ---- Putting it together ----------------------------------------------------

// Where the login lives, for services that hold one.
const SINGLE_DETAILS: Record<string, string[]> = {
  vercel: ['vercel CLI'],
  expo: ['eas CLI'],
  aws: ['AWS 자격 증명'],
  npm: ['~/.npmrc'],
  gcloud: ['gcloud 구성'],
}

async function refresh($: EngineInterface) {
  if (isRefreshing) return
  isRefreshing = true
  try {
    await update($, view, current => ({ ...current, isChecking: true }))
    const cwd = await $.session.cwd()
    const used = await scanSession($)
    for (const [id, usage] of live) {
      const had = used.get(id) ?? { commands: 0, mcp: 0, artifacts: 0 }
      used.set(id, {
        commands: had.commands + usage.commands,
        mcp: had.mcp + usage.mcp,
        artifacts: had.artifacts + usage.artifacts,
      })
    }
    const hints = await projectHints($, cwd)

    // Claude runs every session; list it with whatever else was found.
    const ids = new Set<string>(['claude', ...used.keys(), ...hints.map(h => h.id)])
    if (ids.has('git') || ids.has('github')) {
      const remote = firstLine(await run($, ['git', 'remote', 'get-url', 'origin'], cwd))
      if (remote?.includes('github.com')) ids.add('github')
    }

    const checks = await Promise.all([...ids].map(async id => [id, await checkService($, id, cwd)] as const))
    const rows = sortRows(
      checks.map(([id, check]) => {
        const usage = used.get(id)
        const hint = hints.filter(h => h.id === id)
        const reasons = [...(usage ? usageText(usage) : []), ...hint.map(h => h.reason)]
        const detail = [check.detail, ...hint.map(h => h.detail)].filter(Boolean).join('\n') || undefined
        const weight = usage ? usage.commands + usage.mcp + usage.artifacts : 0
        const row: ServiceRow & { weight: number } = {
          id,
          name: displayName(id),
          category: categoryOf(id),
          reasons: reasons.length > 0 ? reasons : ['이 세션'],
          account: check.account,
          detail,
          note: check.note,
          accounts:
            check.accounts ??
            (check.account ? [{ value: check.account, state: 'active' as const, details: SINGLE_DETAILS[id] }] : []),
          weight,
        }
        return row
      }),
    ).map(({ weight: _weight, ...row }) => row)

    await update($, view, () => ({ rows, checkedAt: Date.now(), isChecking: false }))
  } catch {
    await update($, view, current => ({ ...current, isChecking: false }))
  } finally {
    isRefreshing = false
  }
}

async function isPaneShown($: EngineInterface) {
  const panes = await $.ui.panes().catch(() => [])
  return panes.some(pane => pane.id === PANE && pane.isPlaced)
}

export const register: Register = on => {
  live = new Map()
  transcriptPath = undefined
  isRefreshing = false
  host = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'accounts-mod',
      description: '이 세션이 쓴 서비스와 연결된 계정을 옆 패널에 보여 준다',
      argumentHint: '[refresh|close]',
    })
    return next(e)
  })

  on('command.run', { command: 'accounts-mod' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: '계정 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: "transparent" })
    void refresh($)
    return {
      text: opened.isPlaced ? '계정 패널을 열었습니다. 계정을 확인하는 중입니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  // Watch calls as they happen; a service the list does not have yet is
  // checked right away while the pane is on screen.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const command = e.tool === 'Bash' ? (e as unknown as { command?: string }).command : undefined
    const before = new Set(live.keys())
    record(live, e.tool, command)
    const isNew = [...live.keys()].some(id => !before.has(id))
    if (isNew) {
      const known = (await read($, view)).rows.map(row => row.id)
      const unseen = [...live.keys()].some(id => !known.includes(id))
      if (unseen && (await isPaneShown($))) void refresh($)
    }
    return result
  }).catch(($, e, next) => next(e))

  // With one pane open the engine draws no title row, so the body's first row
  // sits at the very top, under Orca's window buttons: start one row down,
  // and one column in from the engine's divider.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current: AccountsView = await read($, view)
    const connected = current.rows.filter(row => row.account).length
    const unknown = current.rows.length - connected
    // Groups in a fixed order; within one, the order refresh sorted them in.
    const groups = CATEGORIES.map(category => ({
      category,
      rows: current.rows.filter(row => (row.category ?? '기타 연결') === category),
    })).filter(group => group.rows.length > 0)

    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color="claude">이 세션의 계정</Text>
          <Box flexGrow={1} />
          <Button key="refresh" onPress={() => void refresh($)}>새로고침</Button>
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          {host && <Text backgroundColor="magenta" color="black"> {host.name} </Text>}
          {connected > 0 && <Text backgroundColor="green" color="black"> 연결 {connected} </Text>}
          {unknown > 0 && <Text backgroundColor="gray" color="black"> 확인 불가 {unknown} </Text>}
          {current.isChecking && <Text backgroundColor="yellow" color="black"> 확인 중… </Text>}
        </Box>
        <Text dimColor>활성: 지금 선택된 계정</Text>
        <Text dimColor>비활성: 로그인만 된 계정</Text>
        {current.rows.length === 0 && (
          <Text dimColor>{current.isChecking ? '세션 기록을 읽는 중입니다.' : '아직 찾은 서비스가 없습니다.'}</Text>
        )}
        {groups.map(group => (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="magenta">{group.category}</Text>
            {group.rows.map(row => (
              <Box flexDirection="column" marginTop={1}>
                <Box marginLeft={1}>
                  <Text bold>{row.name}</Text>
                </Box>
                {(row.accounts ?? []).length === 0 && (
                  <Box flexDirection="row" marginLeft={2} gap={1}>
                    <Box width={LABEL_WIDTH} flexShrink={0}>
                      <Text backgroundColor="gray" color="black">확인불가</Text>
                    </Box>
                    <Text dimColor>{row.note ?? '확인 못 함'}</Text>
                  </Box>
                )}
                {(row.accounts ?? []).map(line => (
                  <Box flexDirection="row" marginLeft={2} gap={1}>
                    <Box width={LABEL_WIDTH} flexShrink={0}>
                      <Text backgroundColor={STATE_LOOK[line.state].color} color="black">{STATE_LOOK[line.state].label}</Text>
                    </Box>
                    <Box flexDirection="column" flexShrink={1}>
                      <Text color={line.state === 'active' ? 'cyan' : undefined} dimColor={line.state === 'inactive'}>
                        {line.value}
                      </Text>
                      {(line.details ?? []).map(fact => <Text dimColor>{fact}</Text>)}
                    </Box>
                  </Box>
                ))}
                {row.detail && (
                  <Box flexDirection="column" marginLeft={2 + LABEL_WIDTH + 1}>
                    {row.detail.split('\n').map(fact => <Text dimColor>{fact}</Text>)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
