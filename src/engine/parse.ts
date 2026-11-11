import { COLOR_CHARS } from './color.ts'
import { makePiece } from './pieces.ts'
import type { Dir, Level, Mask, PieceKind, Stock, Tile } from './types.ts'
import { validateLevel } from './validate.ts'

/*
 * Text format for handcrafted levels: one row per string, cells separated by spaces.
 *
 *   .   floor            #   wall             ~   glass            x   sensor (keep dark)
 *   >r ^g vb <w          emitter: direction + colour (r g b y m c w)
 *   @y                   receiver that needs that colour
 *   /  \                 fixed mirror         s/  s\   fixed splitter
 *   fr fg fb fy ...      fixed filter         p   fixed prism      h   fixed hue shifter
 */
const DIRS: Readonly<Record<string, Dir>> = { '^': 0, '>': 1, v: 2, '<': 3 }

function colorOf(ch: string | undefined, token: string): Mask {
  const m = ch === undefined ? -1 : COLOR_CHARS.indexOf(ch)
  if (m <= 0) throw new Error(`Bad colour in token "${token}"`)
  return m
}

const SIMPLE: Readonly<Record<string, Tile>> = {
  '.': { t: 'empty' },
  '#': { t: 'wall' },
  '~': { t: 'glass' },
  x: { t: 'sensor' },
  '/': { t: 'fixed', piece: makePiece('mirror', 0) },
  '\\': { t: 'fixed', piece: makePiece('mirror', 1) },
  's/': { t: 'fixed', piece: makePiece('splitter', 0) },
  's\\': { t: 'fixed', piece: makePiece('splitter', 1) },
  p: { t: 'fixed', piece: makePiece('prism') },
  h: { t: 'fixed', piece: makePiece('shifter') },
}

export function parseTile(token: string): Tile {
  const simple = SIMPLE[token]
  if (simple) return simple
  const [a, b] = [token[0], token[1]]
  if (token.length === 2 && a === 'f') return { t: 'fixed', piece: makePiece('filter', 0, colorOf(b, token)) }
  if (token.length === 2 && a === '@') return { t: 'receiver', color: colorOf(b, token) }
  const dir = a === undefined ? undefined : DIRS[a]
  if (token.length === 2 && dir !== undefined) return { t: 'emitter', dir, color: colorOf(b, token) }
  throw new Error(`Unknown tile token "${token}"`)
}

/** Tray shorthand, e.g. { mirror: 2, 'filter-r': 1 }. */
export type InventorySpec = Readonly<Partial<Record<string, number>>>

export function parseInventory(spec: InventorySpec): Stock[] {
  return Object.entries(spec).map(([key, count = 0]) => {
    const [kind = '', c] = key.split('-')
    const color = kind === 'filter' ? colorOf(c, key) : 0
    return { kind: kind as PieceKind, color, count }
  })
}

export interface LevelSource {
  readonly id: string
  readonly name: string
  readonly map: readonly string[]
  readonly inventory: InventorySpec
  readonly par?: number
  readonly tutorial?: string
}

/** Parses only the grid, without level validation. */
export function parseBoard(map: readonly string[]): Pick<Level, 'w' | 'h' | 'tiles'> {
  const rows = map.map((r) => r.trim().split(/\s+/))
  const w = rows[0]?.length ?? 0
  if (rows.some((r) => r.length !== w)) throw new Error('Rows have different lengths')
  return { w, h: rows.length, tiles: rows.flat().map(parseTile) }
}

export function parseLevel(src: LevelSource): Level {
  const level: Level = {
    id: src.id,
    name: src.name,
    ...parseBoard(src.map),
    inventory: parseInventory(src.inventory),
    ...(src.par === undefined ? {} : { par: src.par }),
    ...(src.tutorial === undefined ? {} : { tutorial: src.tutorial }),
  }
  const errors = validateLevel(level)
  if (errors.length) throw new Error(`Level ${src.id}: ${errors.join('; ')}`)
  return level
}
