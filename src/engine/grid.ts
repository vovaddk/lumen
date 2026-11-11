import type { Dir, Level, Piece, Placements, Tile } from './types.ts'

export const DX = [0, 1, 0, -1] as const
export const DY = [-1, 0, 1, 0] as const

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir

/** "/" sends N<->E and S<->W; "\" sends N<->W and S<->E. */
const SLASH: readonly Dir[] = [1, 0, 3, 2]
const BACKSLASH: readonly Dir[] = [3, 2, 1, 0]
export const reflect = (orient: 0 | 1, d: Dir): Dir => (orient === 0 ? SLASH : BACKSLASH)[d] ?? d

/** Neighbouring cell index, or -1 when stepping off the board. */
export function step(w: number, h: number, cell: number, d: Dir): number {
  const x = (cell % w) + DX[d]
  const y = Math.floor(cell / w) + DY[d]
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x
}

export const EMPTY: Tile = { t: 'empty' }

export const tileAt = (level: Level, cell: number): Tile => level.tiles[cell] ?? EMPTY

/** The piece standing on a cell: a fixed one from the level or one placed by the player. */
export function pieceAt(level: Level, placed: Placements, cell: number): Piece | undefined {
  const tile = tileAt(level, cell)
  return tile.t === 'fixed' ? tile.piece : placed.get(cell)
}

/** Only bare floor accepts player pieces; glass lets light through but not hands. */
export const isBuildable = (level: Level, cell: number): boolean => tileAt(level, cell).t === 'empty'

/** Human-friendly coordinate such as "C4" (column letter, 1-based row). */
export const cellName = (w: number, cell: number): string =>
  `${String.fromCharCode(65 + (cell % w))}${Math.floor(cell / w) + 1}`
