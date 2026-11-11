import { colorName } from './color.ts'
import { cellName, tileAt } from './grid.ts'
import { trace, type Trace } from './tracer.ts'
import type { Level, Mask, Placements } from './types.ts'

export interface TargetStatus {
  readonly cell: number
  /** Required colour; 0 for a "keep dark" sensor. */
  readonly need: Mask
  readonly got: Mask
  readonly ok: boolean
  readonly sensor: boolean
}

export interface Evaluation {
  readonly trace: Trace
  readonly targets: readonly TargetStatus[]
  readonly solved: boolean
}

/**
 * A level is solved when every receiver sees exactly its colour (no more, no less)
 * and every sensor stays dark.
 */
export function evaluate(level: Level, placed: Placements): Evaluation {
  const t = trace(level, placed)
  const targets: TargetStatus[] = []
  for (let cell = 0; cell < level.tiles.length; cell++) {
    const tile = tileAt(level, cell)
    if (tile.t === 'receiver') {
      const got = t.lit[cell] ?? 0
      targets.push({ cell, need: tile.color, got, ok: got === tile.color, sensor: false })
    } else if (tile.t === 'sensor') {
      const got = t.lit[cell] ?? 0
      targets.push({ cell, need: 0, got, ok: got === 0, sensor: true })
    }
  }
  const solved = targets.some((s) => !s.sensor) && targets.every((s) => s.ok)
  return { trace: t, targets, solved }
}

export function describeTarget(level: Level, s: TargetStatus): string {
  const where = cellName(level.w, s.cell)
  if (s.sensor) return s.ok ? `Sensor ${where} is dark` : `Sensor ${where} is lit ${colorName(s.got)}, keep it dark`
  if (s.ok) return `Receiver ${where} is lit ${colorName(s.got)}`
  return `Receiver ${where} needs ${colorName(s.need)}, gets ${colorName(s.got)}`
}

/** 3 stars at par, 2 stars at par + 1, otherwise 1. */
export function starsFor(used: number, par: number | undefined): 1 | 2 | 3 {
  if (par === undefined || used <= par) return 3
  return used === par + 1 ? 2 : 1
}
