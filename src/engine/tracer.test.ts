import { describe, expect, it } from 'vitest'
import { BLUE, GREEN, RED, WHITE } from './color.ts'
import { makePiece } from './pieces.ts'
import { parseBoard } from './parse.ts'
import { halfSegment, trace } from './tracer.ts'
import type { Level, Piece, Placements } from './types.ts'

const level = (map: string[]): Level => ({ id: 't', name: 't', inventory: [], ...parseBoard(map) })
const at = (l: Level, x: number, y: number): number => y * l.w + x
const with1 = (l: Level, x: number, y: number, p: Piece): Placements => new Map([[at(l, x, y), p]])
const NONE: Placements = new Map()

describe('beam tracer', () => {
  // Emitter at (0,1) firing east across a 5x3 board.
  const row = level(['.  .  .  .  .', '>w .  .  .  .', '.  .  .  .  .'])

  it('travels in a straight line and leaves the board', () => {
    const t = trace(row, NONE)
    for (let x = 1; x < 5; x++) expect(t.lit[at(row, x, 1)]).toBe(WHITE)
    expect(t.lit[at(row, 1, 0)]).toBe(0)
    expect(halfSegment(t, at(row, 4, 1), 1)).toBe(WHITE)
  })

  it('reflects on "/" mirrors (east to north)', () => {
    const t = trace(row, with1(row, 2, 1, makePiece('mirror', 0)))
    expect(t.lit[at(row, 2, 0)]).toBe(WHITE)
    expect(t.lit[at(row, 3, 1)]).toBe(0)
  })

  it('reflects on "\\" mirrors (east to south)', () => {
    const t = trace(row, with1(row, 2, 1, makePiece('mirror', 1)))
    expect(t.lit[at(row, 2, 2)]).toBe(WHITE)
    expect(t.lit[at(row, 2, 0)]).toBe(0)
  })

  it('splitters pass and reflect at once', () => {
    const t = trace(row, with1(row, 2, 1, makePiece('splitter', 0)))
    expect(t.lit[at(row, 2, 0)]).toBe(WHITE)
    expect(t.lit[at(row, 4, 1)]).toBe(WHITE)
    expect(t.lit[at(row, 2, 2)]).toBe(0)
  })

  it('filters keep only their own channels', () => {
    const t = trace(row, with1(row, 2, 1, makePiece('filter', 0, RED | BLUE)))
    expect(t.lit[at(row, 2, 1)]).toBe(WHITE)
    expect(t.lit[at(row, 3, 1)]).toBe(RED | BLUE)
  })

  it('a filter that matches nothing blocks the beam', () => {
    const red = level(['>r .  .  .', '.  .  .  .', '.  .  .  .'])
    const t = trace(red, with1(red, 1, 0, makePiece('filter', 0, GREEN)))
    expect(t.lit[at(red, 2, 0)]).toBe(0)
  })

  it('prisms bend red left, pass green, bend blue right', () => {
    const t = trace(row, with1(row, 2, 1, makePiece('prism')))
    expect(t.lit[at(row, 2, 0)]).toBe(RED) // left of east is north
    expect(t.lit[at(row, 3, 1)]).toBe(GREEN)
    expect(t.lit[at(row, 2, 2)]).toBe(BLUE)
  })

  it('hue shifters rotate red to green to blue to red', () => {
    const t = trace(row, with1(row, 2, 1, makePiece('shifter')))
    expect(t.lit[at(row, 3, 1)]).toBe(WHITE)
    const red = level(['>r .  .  .', '.  .  .  .', '.  .  .  .'])
    expect(trace(red, with1(red, 1, 0, makePiece('shifter'))).lit[at(red, 2, 0)]).toBe(GREEN)
    const blue = level(['>b .  .  .', '.  .  .  .', '.  .  .  .'])
    expect(trace(blue, with1(blue, 1, 0, makePiece('shifter'))).lit[at(blue, 2, 0)]).toBe(RED)
  })

  it('walls and emitter housings stop light at their edge; glass lets it through', () => {
    const l = level(['>g ~  #  .', '.  .  .  .', '<b .  .  >r'])
    const t = trace(l, NONE)
    expect(t.lit[at(l, 1, 0)]).toBe(GREEN)
    expect(t.lit[at(l, 2, 0)]).toBe(0)
    expect(t.lit[at(l, 3, 0)]).toBe(0)
    // The red emitter faces off-board; the blue one fires west off-board too.
    expect(t.lit[at(l, 1, 2)]).toBe(0)
  })

  it('receivers absorb and mix light from several sides', () => {
    const l = level(['.  vr .', '>g @y .', '.  .  .'])
    const t = trace(l, NONE)
    expect(t.lit[at(l, 1, 1)]).toBe(RED | GREEN)
    expect(t.lit[at(l, 2, 1)]).toBe(0)
    expect(t.lit[at(l, 1, 2)]).toBe(0)
  })

  it('respects fixed pieces from the level', () => {
    const l = level(['>r /  .', '.  .  .', '.  .  .'])
    expect(trace(l, NONE).lit[at(l, 2, 0)]).toBe(0)
  })
})

describe('beam loops', () => {
  // A ring of mirrors fed through a splitter: light circulates forever in a naive tracer.
  const ring = level([
    '.  .  .  .  .  .  .',
    '.  /  .  .  .  \\ .',
    '.  .  .  .  .  .  .',
    '.  .  .  .  .  .  .',
    '.  \\ .  s/ .  /  .',
    '.  .  .  .  .  .  .',
    '.  .  .  ^w .  .  .',
  ])

  it('terminates on a splitter ring and lights the whole loop', () => {
    const t = trace(ring, NONE)
    expect(t.steps).toBeLessThanOrEqual(ring.w * ring.h * 12)
    for (const [x, y] of [[3, 1], [5, 2], [2, 4], [1, 2]] as const) expect(t.lit[at(ring, x, y)]).toBe(WHITE)
  })

  it('terminates when a hue shifter sits inside the loop', () => {
    const t = trace(ring, with1(ring, 5, 3, makePiece('shifter')))
    expect(t.steps).toBeLessThanOrEqual(ring.w * ring.h * 12)
    // Every channel ends up everywhere on the loop after enough laps.
    expect(t.lit[at(ring, 1, 3)]).toBe(WHITE)
  })

  it('terminates on a pure splitter lattice', () => {
    const l = level(['>w s/ s\\ .', '.  s\\ s/ .', '.  .  .  .'])
    const t = trace(l, NONE)
    expect(t.steps).toBeLessThanOrEqual(l.w * l.h * 12)
  })

  it('is bounded on a large board full of splitters', () => {
    const size = 12
    const rows = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => (x === 0 && y === 0 ? '>w' : (x + y) % 2 ? 's/' : 's\\')).join(' '),
    )
    const l = level(rows)
    const t = trace(l, NONE)
    expect(t.steps).toBeLessThanOrEqual(size * size * 12)
    expect(t.steps).toBeGreaterThan(size)
  })
})
