import type { SolveResult } from '../engine/solver.ts'
import type { Level, Placements } from '../engine/types.ts'
import type { SolveRequest } from './solver.worker.ts'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (r: SolveResult) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result: SolveResult }>) => {
      pending.get(e.data.id)?.(e.data.result)
      pending.delete(e.data.id)
    }
    // A crashed worker must not leave callers waiting forever.
    worker.onerror = () => {
      for (const done of pending.values()) done({ status: 'limit', nodes: 0 })
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

/** Solves in a Web Worker. Memory stays bounded by `maxNodes`; the page never blocks. */
export function solveAsync(level: Level, maxNodes: number, base: Placements = new Map()): Promise<SolveResult> {
  const id = nextId++
  const req: SolveRequest = { id, level, base: [...base], maxNodes }
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(req)
  })
}
