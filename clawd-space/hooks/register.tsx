import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { drawScene, encodeCells } from './scene'

const isOn = atom({ plugin: 'clawd-space', key: 'isOn' } as const, false)

const RASTER = 'space'
const FRAME_MS = 100

// The band's Raster as last drawn: the timer repaints it in place.
type Mounted = { requestId: string; columns: number; rows: number }
let mounted: Mounted | undefined
let stopFrames: (() => void) | undefined
let tick = 0

function stopAnimation() {
  stopFrames?.()
  stopFrames = undefined
  mounted = undefined
}

function startAnimation($: EngineInterface) {
  if (stopFrames) return
  const timer = $.clock.every(FRAME_MS, () => {
    const site = mounted
    if (!site) return
    tick += 1
    const frame = drawScene(site.columns, site.rows, tick)
    void $.ui
      .blit({
        requestId: site.requestId,
        key: RASTER,
        cells: encodeCells(frame.cells),
        columns: site.columns,
        rows: site.rows,
      })
      .then(result => {
        // Not mounted any more (turned off, collapsed, resized): wait for the
        // next drawing to start again.
        if ('deny' in result && result.deny) stopAnimation()
      })
      .catch(() => stopAnimation())
  })
  stopFrames = () => timer.cancel()
}

export const register: Register = on => {
  stopAnimation()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'meditate',
      description: '프롬프트 위에 우주를 떠다니는 Clawd를 켜고 끈다 (on/off)',
      argumentHint: '[on|off]',
    })
    return next(e)
  })

  on('command.run', { command: 'meditate' }, async ($, e) => {
    const arg = e.args.trim()
    const wasOn = await read($, isOn)
    const turnOn = arg === 'on' ? true : arg === 'off' ? false : !wasOn
    await update($, isOn, () => turnOn)
    if (!turnOn) stopAnimation()
    return { text: turnOn ? 'Clawd가 우주로 떠났습니다. 끄려면 /meditate off. 띠가 접혀 있으면 프롬프트 위 ▸ plugin panel hidden 줄을 클릭해 펼칩니다.' : 'Clawd가 돌아왔습니다.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) {
      stopAnimation()
      return next(e)
    }
    // Raster is the terminal's cell grid; other surfaces keep the band as is.
    const elements = $.ui.resolve(e)
    if (!('Raster' in elements)) return next(e)
    const { Raster } = elements

    const columns = Math.max(20, Math.min(512, e.props.bodyColumns))
    const rows = Math.max(4, Math.min(256, e.props.maxRows))
    mounted = { requestId: e.requestId, columns, rows }
    startAnimation($)

    const first = drawScene(columns, rows, tick)
    return <Raster key={RASTER} columns={columns} rows={rows} cells={encodeCells(first.cells)} />
  })
}
