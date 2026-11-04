import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AccountsView, ServiceRow } from '../types'
import { displayName, record, scanTranscript, sortRows, usageText } from './detect'
import type { Detected } from './detect'

const PANE = 'session-accounts'
const TITLE = 'Accounts'
// Change the tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload.
const view = atom(
  { plugin: 'session-accounts', key: 'view' } as const,
  { rows: [], isChecking: false },
  { shape: 'view-1' },
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

type Check = { account?: string; detail?: string; note?: string }

async function run($: EngineInterface, argv: string[], cwd: string): Promise<string | undefined> {
  try {
    // Answers come on stdout; some CLIs print banners and status on stderr.
    const { stdout, stderr } = await $.process.run(argv, { cwd, timeoutMs: 15000 })
    return stdout.trim() || stderr.trim() || undefined
  } catch {
    return undefined
  }
}

const firstLine = (text: string | undefined) =>
  text
    ?.split('\n')
    .map(line => line.replace(/^[>\s]+/, '').trim())
    .find(Boolean)

// A remote URL can carry a token: keep only the host and path.
const cleanRemote = (url: string) => url.replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '')

async function checkService($: EngineInterface, id: string, cwd: string): Promise<Check> {
  switch (id) {
    case 'git': {
      const name = firstLine(await run($, ['git', 'config', 'user.name'], cwd))
      const email = firstLine(await run($, ['git', 'config', 'user.email'], cwd))
      const remote = firstLine(await run($, ['git', 'remote', 'get-url', 'origin'], cwd))
      return {
        account: email ? `${name ?? ''} <${email}>`.trim() : undefined,
        detail: remote && !remote.includes('fatal') ? cleanRemote(remote) : undefined,
        note: email ? undefined : '커밋 계정이 설정되지 않음',
      }
    }
    case 'github': {
      const text = await run($, ['gh', 'auth', 'status', '--active', '--hostname', 'github.com'], cwd)
      const login = text?.match(/account\s+(\S+)/)?.[1]
      return login ? { account: login } : { note: text ? '로그인 안 됨' : 'gh 명령 없음' }
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
      const status = firstLine(await run($, ['codex', 'login', 'status'], cwd))
      return status ? { account: status } : { note: 'codex 명령 없음' }
    }
    case 'claude': {
      const who = await $.session.identity().catch(() => undefined)
      const kind = who && 'kind' in who ? who.kind : undefined
      const email = who && 'email' in who ? who.email : undefined
      return email ? { account: email, detail: kind } : { account: kind ?? '알 수 없음' }
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
        const detail = [check.detail, ...hint.map(h => h.detail)].filter(Boolean).join(' · ') || undefined
        const weight = usage ? usage.commands + usage.mcp + usage.artifacts : 0
        const row: ServiceRow & { weight: number } = {
          id,
          name: displayName(id),
          reasons: reasons.length > 0 ? reasons : ['이 세션'],
          account: check.account,
          detail,
          note: check.note,
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

function ago(at: number | undefined) {
  if (!at) return '확인 전'
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  return s < 60 ? `${s}초 전 확인` : `${Math.floor(s / 60)}분 전 확인`
}

export const register: Register = on => {
  live = new Map()
  transcriptPath = undefined
  isRefreshing = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'accounts',
      description: '이 세션이 쓴 서비스와 연결된 계정을 옆 패널에 보여 준다',
      argumentHint: '[refresh|close]',
    })
    return next(e)
  })

  on('command.run', { command: 'accounts' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: '계정 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current: AccountsView = await read($, view)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold color="claude">이 세션의 계정</Text>
          <Text dimColor>{current.isChecking ? '확인 중…' : ago(current.checkedAt)}</Text>
          <Box flexGrow={1} />
          <Button key="refresh" onPress={() => void refresh($)}>새로고침</Button>
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        {current.rows.length === 0 && (
          <Text dimColor>{current.isChecking ? '세션 기록을 읽는 중입니다.' : '아직 찾은 서비스가 없습니다.'}</Text>
        )}
        {current.rows.map(row => (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text color={row.account ? 'green' : 'gray'}>{row.account ? '● ' : '○ '}</Text>
              <Text bold>{row.name}</Text>
              <Text dimColor>  {row.reasons.join(' · ')}</Text>
            </Text>
            <Text>
              {'   '}
              {row.account ? <Text color="cyan">{row.account}</Text> : <Text dimColor>{row.note ?? '확인 못 함'}</Text>}
            </Text>
            {row.detail && <Text dimColor>{'   '}{row.detail}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
