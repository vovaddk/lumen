import { colorName } from '../engine/color.ts'
import { cellName, tileAt } from '../engine/grid.ts'
import { pieceLabel } from '../engine/pieces.ts'
import type { Level, Piece, Placements } from '../engine/types.ts'

const DIR_NAMES = ['north', 'east', 'south', 'west'] as const

export function describePiece(p: Piece): string {
  const turn = p.kind === 'mirror' || p.kind === 'splitter' ? (p.orient === 0 ? ' (/)' : ' (\\)') : ''
  return `${pieceLabel(p)}${turn}`
}

/** Spoken description of one cell, used when the keyboard cursor moves. */
export function describeCell(level: Level, placed: Placements, lit: Uint8Array, cell: number): string {
  const where = cellName(level.w, cell)
  const tile = tileAt(level, cell)
  const light = lit[cell] ?? 0
  const lightText = light ? `, ${colorName(light)} light` : ''
  switch (tile.t) {
    case 'wall':
      return `${where}: wall`
    case 'glass':
      return `${where}: glass${lightText}`
    case 'emitter':
      return `${where}: ${colorName(tile.color)} emitter facing ${DIR_NAMES[tile.dir]}`
    case 'receiver':
      return `${where}: receiver needs ${colorName(tile.color)}, gets ${colorName(light)}`
    case 'sensor':
      return `${where}: sensor, ${light ? `lit ${colorName(light)}` : 'dark'}`
    case 'fixed':
      return `${where}: fixed ${describePiece(tile.piece)}${lightText}`
    case 'empty': {
      const p = placed.get(cell)
      return p ? `${where}: ${describePiece(p)}${lightText}` : `${where}: floor${lightText}`
    }
  }
}
