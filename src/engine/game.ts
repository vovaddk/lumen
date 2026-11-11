import { isBuildable } from './grid.ts'
import { rotated, stockKey } from './pieces.ts'
import type { Level, Piece, Placements, Stock } from './types.ts'

/** Pieces still in the tray, keyed by `stockKey`. */
export function remaining(level: Level, placed: Placements): Map<string, number> {
  const left = new Map<string, number>()
  for (const s of level.inventory) left.set(stockKey(s), (left.get(stockKey(s)) ?? 0) + s.count)
  for (const p of placed.values()) left.set(stockKey(p), (left.get(stockKey(p)) ?? 0) - 1)
  return left
}

export const piecesUsed = (placed: Placements): number => placed.size

export const totalInventory = (level: Level): number => level.inventory.reduce((a, s) => a + s.count, 0)

export function canPlace(level: Level, placed: Placements, cell: number, piece: Piece): boolean {
  if (!isBuildable(level, cell) || placed.has(cell)) return false
  return (remaining(level, placed).get(stockKey(piece)) ?? 0) > 0
}

/** Returns new placements, or the same object when the move is illegal. */
export function place(level: Level, placed: Placements, cell: number, piece: Piece): Placements {
  if (!canPlace(level, placed, cell, piece)) return placed
  return new Map(placed).set(cell, piece)
}

export function removeAt(placed: Placements, cell: number): Placements {
  if (!placed.has(cell)) return placed
  const next = new Map(placed)
  next.delete(cell)
  return next
}

export function rotateAt(placed: Placements, cell: number): Placements {
  const p = placed.get(cell)
  if (!p) return placed
  const r = rotated(p)
  return r === p ? placed : new Map(placed).set(cell, r)
}

export const stockFor = (level: Level, key: string): Stock | undefined =>
  level.inventory.find((s) => stockKey(s) === key)
