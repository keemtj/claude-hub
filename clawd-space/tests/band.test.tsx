import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'clawd-space',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12 },
  },
} as const

test('the band stays empty until /meditate turns it on', async ($, on) => {
  on('command.register', () => ({ value: { command: 'meditate' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const off = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await off.find({ type: 'Text' }))?.text).toBe('engine')
  await off.unmount()

  const ran = await $.command.run({ command: 'meditate', args: 'on' })
  expect(ran.text).toContain('우주')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeTruthy()
  await ui.unmount()

  await $.command.run({ command: 'meditate', args: 'off' })
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await again.find({ type: 'Text' }))?.text).toBe('engine')
  await again.unmount()
})
