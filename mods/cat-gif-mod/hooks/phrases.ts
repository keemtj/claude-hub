// Lines put on the cat. cataas draws them in the GIF, so they stay short and
// avoid `/`, `?` and `#`, which the URL path cannot carry.
export const PHRASES = [
  'It works on my machine',
  'LGTM',
  "It's not a bug, it's a feature",
  'Who wrote this. Oh. Me.',
  'git push --force',
  'Deploying on Friday',
  'Works in prod',
  'Tests pass locally',
  'Merge conflict',
  'rm -rf node_modules',
  'undefined is not a function',
  'Just one more commit',
  'TODO: fix later',
  'Stack Overflow is down',
  'Have you tried restarting',
  '99 bugs in the code',
  'Code review time',
  'npm install',
  'Compiling...',
  'Hotfix in production',
  'Ship it',
  'Cache invalidation',
  'Off by one',
  'Senior developer',
]

export function pickPhrase(previous: string, random: () => number = Math.random): string {
  const others = PHRASES.filter(phrase => phrase !== previous)
  return others[Math.floor(random() * others.length)] ?? PHRASES[0]!
}
