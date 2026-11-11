/** Immutable undo/redo stack. Every operation returns a new history. */
export interface History<T> {
  readonly past: readonly T[]
  readonly present: T
  readonly future: readonly T[]
}

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

/** Records a new state; pushing the current state again is a no-op. Clears the redo branch. */
export function push<T>(h: History<T>, next: T, limit = 500): History<T> {
  if (Object.is(next, h.present)) return h
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past.at(-1)
  if (h.past.length === 0 || prev === undefined) return h
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0]
  if (h.future.length === 0 || next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0
