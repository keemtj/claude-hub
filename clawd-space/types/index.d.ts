export type IsOn = boolean

declare module 'claude-code' {
  interface PluginState {
    'clawd-space': {
      isOn: IsOn
    }
  }
}
