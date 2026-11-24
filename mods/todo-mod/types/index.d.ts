export type TodoStatus = 'pending' | 'doing' | 'done'
export type Todo = { id: number; text: string; status: TodoStatus }

declare module 'claude-code' {
  interface PluginState {
    'todo-mod': { todos: Shaped<Todo[]>; current: Shaped<string>; repo: Shaped<string> }
  }
}
