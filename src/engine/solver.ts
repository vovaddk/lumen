import { GREEN } from './color.ts'
import { remaining } from './game.ts'
import { isBuildable } from './grid.ts'
import { PIECE_KINDS, stockKey, variants } from './pieces.ts'
import { evaluate } from './rules.ts'
import { trace } from './tracer.ts'
import type { Level, Piece, Placement, Placements, PieceKind, Mask } from './types.ts'

export type SolveResult =
  | { readonly status: 'solved'; readonly min: number; readonly solution: readonly Placement[]; readonly nodes: number }
  | { readonly status: 'unsolvable'; readonly nodes: number }
  | { readonly status: 'limit'; readonly nodes: number }

export interface SolveOptions {
  /** Pieces that stay where they are (e.g. the player's current board, for hints). */
  readonly base?: Placements
  /**
   * Give up after generating this many configurations. Memory is bounded by it too: the
   * seen-set and the frontier never hold more than `maxNodes` entries, each a few numbers.
   */
  readonly maxNodes?: number
}

/**
 * Node budgets. Untrusted levels (share links) get a small one because the search runs on
 * the main thread; shipped levels need up to ~115k nodes (level 2-7).
 */
export const SOLVE_BUDGET = {
  untrusted: 25_000,
  editor: 100_000,
  shipped: 150_000,
} as const

interface Node {
  readonly used: readonly number[]
  /** Sorted placement codes of the pieces added by the search; also the de-duplication key. */
  readonly codes: readonly number[]
}

const pieceCode = (p: Piece): number => PIECE_KINDS.indexOf(p.kind) * 16 + p.orient * 8 + p.color
const encode = (cell: number, p: Piece): number => cell * 128 + pieceCode(p)

function decode(code: number): Placement {
  const pc = code % 128
  return {
    cell: Math.floor(code / 128),
    piece: { kind: PIECE_KINDS[pc >> 4] ?? 'mirror', orient: ((pc >> 3) & 1) as 0 | 1, color: pc & 7 },
  }
}

function withCodes(base: Placements, codes: readonly number[]): Map<number, Piece> {
  const placed = new Map(base)
  for (const c of codes) {
    const { cell, piece } = decode(c)
    placed.set(cell, piece)
  }
  return placed
}

/**
 * True when a piece would leave every channel that currently reaches `cell` untouched,
 * so adding it now cannot change the board.
 */
function isNoOp(kind: PieceKind, color: Mask, lit: number): boolean {
  if (kind === 'filter') return (lit & ~color & 7) === 0
  if (kind === 'prism') return lit === GREEN
  return false
}

/**
 * Breadth-first search over sets of placements, one piece deeper per layer, so the first
 * solution found uses the minimum number of pieces.
 *
 * Pruning (both keep the search complete for minimum solutions):
 *  1. Only cells that light currently reaches are candidates. In a minimal solution every
 *     piece is hit by light; ordering pieces by when the final beam first reaches them
 *     shows each one sits on a lit cell at the moment it is added.
 *  2. A piece that would act as identity on the light reaching its cell (a red filter on
 *     a red beam, a prism on pure green) is skipped. If every remaining piece of a minimal
 *     solution were an identity or unlit, the smaller partial set would already solve the
 *     level, contradicting minimality.
 * Configurations are de-duplicated as unordered sets, so permutations are visited once.
 * Nodes store only their placement codes; boards are rebuilt and re-traced when expanded,
 * trading some CPU for a small, predictable memory footprint.
 */
export function solve(level: Level, opts: SolveOptions = {}): SolveResult {
  const base = opts.base ?? new Map<number, Piece>()
  const maxNodes = opts.maxNodes ?? 250_000
  const left = remaining(level, base)
  const stock = level.inventory
    .map((s) => ({ s, count: Math.max(0, Math.min(s.count, left.get(stockKey(s)) ?? 0)) }))
    .filter((x) => x.count > 0)
  const counts = stock.map((x) => x.count)
  const total = counts.reduce((a, c) => a + c, 0)
  const n = level.w * level.h

  let nodes = 1
  const first = evaluate(level, base)
  if (first.solved) return { status: 'solved', min: base.size, solution: [], nodes }

  let frontier: Node[] = [{ used: counts.map(() => 0), codes: [] }]
  const seen = new Set<string>()

  for (let depth = 1; depth <= total; depth++) {
    const next: Node[] = []
    for (const node of frontier) {
      const placedHere = withCodes(base, node.codes)
      const litHere = trace(level, placedHere).lit
      for (let cell = 0; cell < n; cell++) {
        const lit = litHere[cell] ?? 0
        if (lit === 0 || !isBuildable(level, cell) || placedHere.has(cell)) continue
        for (let i = 0; i < stock.length; i++) {
          const entry = stock[i]
          if (!entry || (node.used[i] ?? 0) >= entry.count) continue
          if (isNoOp(entry.s.kind, entry.s.color, lit)) continue
          for (const piece of variants(entry.s)) {
            const code = encode(cell, piece)
            const codes = [...node.codes, code].sort((a, b) => a - b)
            const key = codes.join(',')
            if (seen.has(key)) continue
            seen.add(key)
            if (++nodes > maxNodes) return { status: 'limit', nodes }
            if (evaluate(level, new Map(placedHere).set(cell, piece)).solved) {
              return { status: 'solved', min: base.size + codes.length, solution: codes.map(decode), nodes }
            }
            next.push({ used: node.used.map((u, j) => (j === i ? u + 1 : u)), codes })
          }
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return { status: 'unsolvable', nodes }
}

