import { PIECE_KINDS, stockKey } from './pieces.ts'
import type { Level, Piece } from './types.ts'

export const LIMITS = {
  minSize: 3,
  maxSize: 12,
  maxStockCount: 9,
  maxPieces: 12,
  maxName: 40,
} as const

const isInt = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

/** Filters pass one or two primaries; a white filter would do nothing. */
const validFilterColor = (c: number): boolean => isInt(c, 1, 6)

function pieceError(p: Piece): string | undefined {
  if (!PIECE_KINDS.includes(p.kind)) return 'unknown piece kind'
  if (p.kind === 'filter' ? !validFilterColor(p.color) : p.color !== 0) return 'bad filter colour'
  return undefined
}

/**
 * Structural checks shared by the text parser, the share-code decoder and the editor.
 * With `playable: false` a level may still lack emitters or receivers (an editor draft).
 */
export function validateLevel(level: Level, { playable = true } = {}): string[] {
  const errors: string[] = []
  const { w, h } = level
  if (!isInt(w, LIMITS.minSize, LIMITS.maxSize) || !isInt(h, LIMITS.minSize, LIMITS.maxSize)) {
    errors.push(`Board must be between ${LIMITS.minSize} and ${LIMITS.maxSize} cells per side`)
    return errors
  }
  if (level.tiles.length !== w * h) errors.push('Tile count does not match the board size')
  if (level.name.length > LIMITS.maxName) errors.push(`Name is longer than ${LIMITS.maxName} characters`)

  let emitters = 0
  let receivers = 0
  for (const tile of level.tiles) {
    if (tile.t === 'emitter') {
      emitters++
      if (!isInt(tile.dir, 0, 3) || !isInt(tile.color, 1, 7)) errors.push('Emitter has a bad direction or colour')
    } else if (tile.t === 'receiver') {
      receivers++
      if (!isInt(tile.color, 1, 7)) errors.push('Receiver has a bad colour')
    } else if (tile.t === 'fixed') {
      const e = pieceError(tile.piece)
      if (e) errors.push(`Fixed piece: ${e}`)
    }
  }
  if (playable && emitters === 0) errors.push('Add at least one emitter')
  if (playable && receivers === 0) errors.push('Add at least one receiver')

  const keys = new Set<string>()
  let total = 0
  for (const s of level.inventory) {
    if (!PIECE_KINDS.includes(s.kind)) errors.push('Unknown piece in the tray')
    else if (s.kind === 'filter' ? !validFilterColor(s.color) : s.color !== 0) errors.push('Bad filter colour in the tray')
    if (!isInt(s.count, 1, LIMITS.maxStockCount)) errors.push(`Tray counts must be 1 to ${LIMITS.maxStockCount}`)
    const key = stockKey(s)
    if (keys.has(key)) errors.push('The tray lists the same piece twice')
    keys.add(key)
    total += s.count
  }
  if (total > LIMITS.maxPieces) errors.push(`The tray holds more than ${LIMITS.maxPieces} pieces`)
  return errors
}
