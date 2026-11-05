import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Inventory, McpItem, PluginItem, SkillItem, Tab } from '../types'
import { isBlockedTool, parseMcp, parsePlugins, pluginName, skillOfCall } from './parse'

const PANE = 'inventory-mod'
const TITLE = 'Inventory'
const SELF = 'inventory-mod'

// Change a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const tab = atom({ plugin: 'inventory-mod', key: 'tab' } as const, 'plugins' as Tab)
const inventory = atom(
  { plugin: 'inventory-mod', key: 'inventory' } as const,
  { plugins: [], skills: [], pluginSkills: [], mcp: [], isLoading: false, isMcpLoading: false },
  { shape: 'inventory-1' },
)
// What this session turned off: kept in the session's state, so other
// sessions never see it.
const blockedSkills = atom({ plugin: 'inventory-mod', key: 'blockedSkills' } as const, [], {
  shape: 'skills-1',
})
const blockedMcp = atom({ plugin: 'inventory-mod', key: 'blockedMcp' } as const, [], { shape: 'mcp-1' })

let home: string | undefined

async function run($: EngineInterface, argv: string[], timeoutMs = 20000) {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(argv, { timeoutMs })
    return { ok: exitCode === 0, text: stdout.trim() || stderr.trim() }
  } catch (error) {
    return { ok: false, text: String(error) }
  }
}

async function homeDir($: EngineInterface) {
  if (!home) home = (await run($, ['sh', '-c', 'printf %s "$HOME"'])).text || undefined
  return home
}

async function listDir($: EngineInterface, path: string) {
  return $.fs.list(path).catch(() => [])
}

// ---- Loading -----------------------------------------------------------------

async function loadPlugins($: EngineInterface): Promise<PluginItem[]> {
  const plugins = parsePlugins((await run($, ['claude', 'plugin', 'list', '--json'])).text)
  // This session's own mods folder, which no install lists.
  const root = await homeDir($)
  if (root) {
    const id = await $.session.id()
    for (const entry of await listDir($, `${root}/.claude/dev-mods/${id}`)) {
      if (entry.kind === 'dir' && !plugins.some(p => pluginName(p.id) === entry.name)) {
        plugins.push({ id: entry.name, isEnabled: true, scope: 'dev-mod', path: `${root}/.claude/dev-mods/${id}/${entry.name}` })
      }
    }
  }
  return plugins.sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id))
}

async function loadSkills($: EngineInterface, plugins: PluginItem[]) {
  const root = await homeDir($)
  const skills: SkillItem[] = []
  if (root) {
    for (const entry of await listDir($, `${root}/.claude/skills`)) {
      if (entry.name === 'synced' || entry.name.startsWith('.')) continue
      if (entry.isLink) skills.push({ name: entry.name, kind: 'linked' })
      else if (entry.kind === 'dir') skills.push({ name: entry.name, kind: 'mine' })
    }
  }
  const pluginSkills = []
  for (const plugin of plugins) {
    if (!plugin.isEnabled || !plugin.path) continue
    const count = (await listDir($, `${plugin.path}/skills`)).filter(e => e.kind === 'dir').length
    if (count > 0) pluginSkills.push({ plugin: pluginName(plugin.id), count })
  }
  return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)), pluginSkills }
}

async function loadMcp($: EngineInterface): Promise<McpItem[]> {
  // The list checks every server's health, so it takes a while.
  return parseMcp((await run($, ['claude', 'mcp', 'list'], 60000)).text)
}

async function reload($: EngineInterface, options: { withMcp: boolean }) {
  await update($, inventory, v => ({ ...v, isLoading: true, isMcpLoading: options.withMcp || v.isMcpLoading }))
  const plugins = await loadPlugins($)
  const { skills, pluginSkills } = await loadSkills($, plugins)
  await update($, inventory, v => ({ ...v, plugins, skills, pluginSkills, isLoading: false }))
  if (options.withMcp) {
    const mcp = await loadMcp($)
    await update($, inventory, v => ({ ...v, mcp, isMcpLoading: false }))
  }
}

// ---- Toggles -------------------------------------------------------------------

async function togglePlugin($: EngineInterface, plugin: PluginItem) {
  if (pluginName(plugin.id) === SELF || plugin.scope === 'dev-mod') return
  const verb = plugin.isEnabled ? 'disable' : 'enable'
  const result = await run($, ['claude', 'plugin', verb, plugin.id])
  const message = result.ok
    ? `${plugin.id}을(를) ${plugin.isEnabled ? '껐습니다' : '켰습니다'}. 모든 세션에 적용되며, 지금 세션은 /reload-plugins 후 반영됩니다.`
    : `${plugin.id} ${verb} 실패: ${result.text.split('\n')[0] ?? ''}`
  await update($, inventory, v => ({ ...v, message }))
  $.ui.toast(message)
  await reload($, { withMcp: false })
}

const flip = (items: string[], name: string) =>
  items.includes(name) ? items.filter(i => i !== name) : [...items, name]

async function toggleSkill($: EngineInterface, name: string) {
  await update($, blockedSkills, items => flip(items, name))
}

async function toggleMcp($: EngineInterface, name: string) {
  await update($, blockedMcp, items => flip(items, name))
}

// ---- Drawing helpers -------------------------------------------------------------

const SCOPE_LABEL: Record<string, string> = {
  user: '사용자',
  project: '프로젝트',
  local: '로컬',
  synced: 'claude.ai 동기화',
  session: '세션 전용',
  'dev-mod': '이 세션 mod 폴더',
}

const MCP_LOOK: Record<string, { label: string; color: string }> = {
  connected: { label: '연결됨', color: 'green' },
  auth: { label: '인증 필요', color: 'yellow' },
  unset: { label: '설정 안 됨', color: 'gray' },
  failed: { label: '실패', color: 'red' },
}

export const register: Register = on => {
  home = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'inventory-mod',
      description: '플러그인·mod, 스킬, MCP 서버를 보고 켜고 끄는 패널을 연다',
      argumentHint: '[close]',
    })
    return next(e)
  })

  on('command.run', { command: 'inventory-mod' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: '인벤토리 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: "transparent" })
    void reload($, { withMcp: (await read($, tab)) === 'mcp' })
    return {
      text: opened.isPlaced ? '인벤토리 패널을 열었습니다.' : '패널을 놓을 자리가 없습니다. 터미널을 넓혀 주세요.',
    }
  })

  // This session's switches: a skill or an MCP server turned off here answers
  // its calls with a refusal; everything else passes.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Skill') {
      const skill = skillOfCall(e as unknown as { skill?: unknown })
      if (skill && (await read($, blockedSkills)).includes(skill)) {
        return { deny: `'${skill}' 스킬은 이 세션에서 꺼져 있습니다 (/inventory-mod에서 켤 수 있음).` }
      }
    } else if (e.tool.startsWith('mcp__')) {
      const server = isBlockedTool(e.tool, await read($, blockedMcp))
      if (server) return { deny: `'${server}' MCP 서버는 이 세션에서 꺼져 있습니다 (/inventory-mod에서 켤 수 있음).` }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A skill typed as /name expands without the Skill tool: say it is off.
  on('skill.prompt', async ($, e, next) => {
    if ((await read($, blockedSkills)).includes(e.skill)) {
      return { text: `'${e.skill}' 스킬은 이 세션에서 꺼져 있습니다. 사용자에게 /inventory-mod에서 켤 수 있다고 알려 주세요.` }
    }
    return next(e)
  })

  // With one pane open the engine draws no title row, so the body's first row
  // sits at the very top, under Orca's window buttons: start one row down,
  // and one column in from the engine's divider.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current: Inventory = await read($, inventory)
    const active: Tab = await read($, tab)
    const offSkills = await read($, blockedSkills)
    const offMcp = await read($, blockedMcp)

    const switchTo = (next: Tab) => async () => {
      await update($, tab, () => next)
      if (next === 'mcp' && current.mcp.length === 0 && !current.isMcpLoading) void reload($, { withMcp: true })
    }
    const tabButton = (id: Tab, label: string, count: number) => (
      <Button key={`tab-${id}`} variant={active === id ? 'primary' : 'secondary'} onPress={switchTo(id)}>
        {label} {count}
      </Button>
    )

    const pluginRows = current.plugins.map(plugin => {
      const isSelf = pluginName(plugin.id) === SELF
      const isLocked = isSelf || plugin.scope === 'dev-mod'
      return (
        <Box flexDirection="row" gap={1}>
          {isLocked ? (
            <Text dimColor> 잠김 </Text>
          ) : (
            <Button key={`plugin-${plugin.id}`} plain onPress={() => void togglePlugin($, plugin)}>
              <Text color={plugin.isEnabled ? 'green' : 'gray'}>{plugin.isEnabled ? '● 켜짐' : '○ 꺼짐'}</Text>
            </Button>
          )}
          <Text bold={plugin.isEnabled} dimColor={!plugin.isEnabled}>{plugin.id}</Text>
          <Text dimColor>{plugin.version ?? ''} · {SCOPE_LABEL[plugin.scope] ?? plugin.scope}</Text>
        </Box>
      )
    })

    const skillRows = current.skills.map(skill => {
      const isOff = offSkills.includes(skill.name)
      return (
        <Box flexDirection="row" gap={1}>
          {skill.kind === 'linked' ? (
            <Text dimColor> 잠김 </Text>
          ) : (
            <Button key={`skill-${skill.name}`} plain onPress={() => void toggleSkill($, skill.name)}>
              <Text color={isOff ? 'gray' : 'green'}>{isOff ? '○ 꺼짐' : '● 켜짐'}</Text>
            </Button>
          )}
          <Text dimColor={isOff}>{skill.name}</Text>
          <Text dimColor>{skill.kind === 'linked' ? '외부 설치 (링크)' : '직접 만듦'}</Text>
        </Box>
      )
    })

    const mcpRows = current.mcp.map(server => {
      const isOff = offMcp.includes(server.name)
      const look = MCP_LOOK[server.status] ?? { label: server.status, color: 'gray' }
      return (
        <Box flexDirection="row" gap={1}>
          <Button key={`mcp-${server.name}`} plain onPress={() => void toggleMcp($, server.name)}>
            <Text color={isOff ? 'gray' : 'green'}>{isOff ? '○ 꺼짐' : '● 켜짐'}</Text>
          </Button>
          <Text dimColor={isOff}>{server.name}</Text>
          <Text color={look.color}>{look.label}</Text>
        </Box>
      )
    })

    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box flexDirection="row" gap={1}>
          {tabButton('plugins', '플러그인', current.plugins.length)}
          {tabButton('skills', '스킬', current.skills.length)}
          {tabButton('mcp', 'MCP', current.mcp.length)}
          <Box flexGrow={1} />
          <Button key="refresh" onPress={() => void reload($, { withMcp: active === 'mcp' })}>새로고침</Button>
          <Button key="close" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>닫기</Button>
        </Box>
        {(current.isLoading || (active === 'mcp' && current.isMcpLoading)) && (
          <Text backgroundColor="yellow" color="black"> 불러오는 중… </Text>
        )}

        {active === 'plugins' && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>켜고 끄면 모든 세션에 적용됩니다. 지금 세션은 /reload-plugins 후 반영됩니다.</Text>
            {current.message && <Text color="cyan">{current.message}</Text>}
            <Box flexDirection="column" marginTop={1}>{pluginRows}</Box>
          </Box>
        )}

        {active === 'skills' && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>개인 스킬을 이 세션에서만 끄고 켭니다. 외부 설치 스킬은 보기만 합니다.</Text>
            <Box flexDirection="column" marginTop={1}>{skillRows}</Box>
            {current.pluginSkills.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>플러그인 스킬 (플러그인 탭에서 켜고 끔)</Text>
                <Text dimColor>
                  {current.pluginSkills.map(group => `${group.plugin} ${group.count}`).join(' · ')}
                </Text>
              </Box>
            )}
          </Box>
        )}

        {active === 'mcp' && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>이 세션에서만 서버의 도구 호출을 막습니다. 상태는 `claude mcp list` 기준입니다.</Text>
            <Box flexDirection="column" marginTop={1}>{mcpRows}</Box>
          </Box>
        )}
      </Box>
    )
  })
}
