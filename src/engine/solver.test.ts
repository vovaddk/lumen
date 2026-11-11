import { describe, expect, it } from 'vitest'
import { CHAPTERS, ALL_LEVELS } from '../levels/index.ts'
import { place } from './game.ts'
import { makePiece } from './pieces.ts'
import { parseLevel } from './parse.ts'
import { evaluate } from './rules.ts'
import { SOLVE_BUDGET, solve } from './solver.ts'
import { parseBoard } from './parse.ts'
import type { Level, Placements } from './types.ts'

describe('shipped levels', () => {
  it('has at least 24 levels across 3 chapters with unique ids', () => {
    expect(CHAPTERS).toHaveLength(3)
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(24)
    expect(new Set(ALL_LEVELS.map((l) => l.id)).size).toBe(ALL_LEVELS.length)
  })

  it.each(ALL_LEVELS.map((l) => [l.id, l] as const))('level %s is solvable at exactly its par', (_, level) => {
    expect(evaluate(level, new Map()).solved).toBe(false)
    const r = solve(level, { maxNodes: 500_000 })
    expect(r.status).toBe('solved')
    if (r.status !== 'solved') return
    expect(r.min).toBe(level.par)
    // Replaying the solution through the game rules must respect the tray and solve the level.
    let placed: Placements = new Map()
    for (const { cell, piece } of r.solution) {
      const next = place(level, placed, cell, piece)
      expect(next).not.toBe(placed)
      placed = next
    }
    expect(evaluate(level, placed).solved).toBe(true)
  })
})

describe('solver', () => {
  const level = parseLevel({
    id: 't',
    name: 't',
    inventory: { mirror: 2 },
    map: ['.  .  @r', '.  .  .', '>r .  .'],
  })

  it('finds the minimum, not just any solution', () => {
    const r = solve(level)
    expect(r).toMatchObject({ status: 'solved', min: 1 })
  })

  it('proves a level unsolvable when the tray cannot do it', () => {
    const blocked = parseLevel({ id: 'u', name: 'u', inventory: { mirror: 1 }, map: ['>r #  @r', '.  .  .', '.  .  .'] })
    expect(solve(blocked).status).toBe('unsolvable')
  })

  it('reports when it hits the node budget', () => {
    const hard = ALL_LEVELS.find((l) => l.id === '2-7')
    if (!hard) throw new Error('missing level')
    expect(solve(hard, { maxNodes: 50 }).status).toBe('limit')
  })

  it('completes a partial board for hints', () => {
    const l = parseLevel({
      id: 'h',
      name: 'h',
      inventory: { mirror: 2 },
      map: ['.  .  .  .', '.  .  .  @r', '.  .  .  .', '>r .  .  .'],
    })
    const base: Placements = new Map([[l.w * 3 + 1, makePiece('mirror', 0)]])
    const r = solve(l, { base })
    expect(r).toMatchObject({ status: 'solved', min: 2 })
    if (r.status === 'solved') expect(r.solution).toEqual([{ cell: l.w * 1 + 1, piece: makePiece('mirror', 0) }])
  })

  it('stays bounded on a worst-case 12x12 share-link level', () => {
    // White light everywhere, a full tray of splitters and mirrors, and a receiver that
    // walls make unreachable: the search can only end by hitting its budget.
    const rows = Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => {
        if (x === 0 && y % 3 === 1) return '>w'
        if (y === 0 && x % 3 === 2) return 'vw'
        if (x === 10 && y === 10) return '@m'
        if ((x === 9 || x === 11) && y >= 9) return '#'
        if (y === 9 && x === 10) return '#'
        return '.'
      }).join(' '),
    )
    const board = parseBoard(rows)
    const tiles = [...board.tiles]
    tiles[11 * 12 + 10] = { t: 'wall' } // seal the receiver from below too
    const level: Level = {
      id: 'worst',
      name: 'worst',
      ...board,
      tiles,
      inventory: [
        { kind: 'splitter', color: 0, count: 6 },
        { kind: 'mirror', color: 0, count: 6 },
      ],
    }
    // Node-only memory probe; the app tsconfig has no Node types.
    const heap = (): number =>
      (globalThis as { process?: { memoryUsage: () => { heapUsed: number } } }).process?.memoryUsage().heapUsed ?? 0
    const heapBefore = heap()
    const t0 = performance.now()
    const r = solve(level, { maxNodes: SOLVE_BUDGET.untrusted })
    const ms = performance.now() - t0
    expect(r.status).toBe('limit')
    expect(r.nodes).toBeLessThanOrEqual(SOLVE_BUDGET.untrusted + 1)
    expect(ms).toBeLessThan(5000)
    expect(heap() - heapBefore).toBeLessThan(100 * 1024 * 1024)
  })
})
