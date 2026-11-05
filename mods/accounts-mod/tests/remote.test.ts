import { expect, test } from 'claude-code/testing'

import { cleanRemote } from '../hooks/detect'

test('a remote URL keeps only its host and path', async () => {
  expect(cleanRemote('https://user:synthetic-userinfo@github.com/org/repo.git?access_token=synthetic-query#synthetic-fragment')).toBe(
    'https://github.com/org/repo',
  )
  expect(cleanRemote('https://github.com/org/repo.git')).toBe('https://github.com/org/repo')
})

test('an scp-style remote drops anything after ? or #', async () => {
  expect(cleanRemote('git@github.com:org/repo.git')).toBe('git@github.com:org/repo')
  expect(cleanRemote('git@github.com:org/repo.git?token=synthetic#x')).toBe('git@github.com:org/repo')
})
