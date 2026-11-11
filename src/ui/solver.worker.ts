// Runs the solver off the main thread so a heavy (or hostile) level never freezes the page.
import { solve } from '../engine/solver.ts'
import type { Level, Piece } from '../engine/types.ts'

export interface SolveRequest {
  readonly id: number
  readonly level: Level
  /** Base placements as [cell, piece] pairs (Maps survive structured clone, but pairs are explicit). */
  readonly base: readonly (readonly [number, Piece])[]
  readonly maxNodes: number
}

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, level, base, maxNodes } = e.data
  self.postMessage({ id, result: solve(level, { base: new Map(base), maxNodes }) })
}
