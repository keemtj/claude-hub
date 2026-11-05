export type IsOn = boolean

declare module 'claude-code' {
  interface PluginState {
    'meditate-mod': {
      isOn: IsOn
    }
  }
}
