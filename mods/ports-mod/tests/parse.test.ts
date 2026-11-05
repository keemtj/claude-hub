import { expect, test } from 'claude-code/testing'

import { shortArgs } from '../hooks/parse'

test('secret flag values never reach the pane', async () => {
  const shown = shortArgs('node server.js --token=synthetic-token --password synthetic-pass --port 3000', undefined, 200)
  expect(shown).not.toContain('synthetic-token')
  expect(shown).not.toContain('synthetic-pass')
  expect(shown).toContain('--token=***')
  expect(shown).toContain('--password ***')
  expect(shown).toContain('--port 3000')
})

test('credentials in a URL argument are hidden', async () => {
  const shown = shortArgs('proxy https://user:synthetic-secret@example.com/x?api_key=synthetic-key&page=2', undefined, 200)
  expect(shown).not.toContain('synthetic-secret')
  expect(shown).not.toContain('synthetic-key')
  expect(shown).toContain('page=2')
})
