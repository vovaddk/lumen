import { describe, expect, it } from 'vitest'
import { canPlace, place, remaining, removeAt, rotateAt } from './game.ts'
import { canRedo, canUndo, createHistory, push, redo, undo } from './history.ts'
import { makePiece } from './pieces.ts'
import { parseLevel } from './parse.ts'
import type { Placements } from './types.ts'

describe('undo / redo', () => {
  it('walks back and forth through states', () => {
    let h = createHistory(0)
    h = push(push(push(h, 1), 2), 3)
    expect(h.present).toBe(3)
    h = undo(undo(h))
    expect(h.present).toBe(1)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toBe(2)
  })

  it('drops the redo branch on a new move', () => {
    let h = push(push(createHistory('a'), 'b'), 'c')
    h = push(undo(h), 'd')
    expect(h.present).toBe('d')
    expect(canRedo(h)).toBe(false)
    expect(undo(h).present).toBe('b')
  })

  it('is a no-op at the ends and for repeated states', () => {
    const h = createHistory('a')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
    expect(push(h, 'a')).toBe(h)
    expect(canUndo(h)).toBe(false)
  })

  it('caps its length', () => {
    let h = createHistory(0)
    for (let i = 1; i <= 20; i++) h = push(h, i, 5)
    expect(h.past).toHaveLength(5)
  })
})

describe('board moves', () => {
  const level = parseLevel({
    id: 't',
    name: 't',
    inventory: { mirror: 1, 'filter-r': 1 },
    map: ['>r .  ~  @r', '.  #  .  .', '.  .  .  .'],
  })
  const mirror = makePiece('mirror', 0)

  it('places only on floor and only while stock lasts', () => {
    expect(canPlace(level, new Map(), 1, mirror)).toBe(true)
    expect(canPlace(level, new Map(), 2, mirror)).toBe(false) // glass
    expect(canPlace(level, new Map(), 5, mirror)).toBe(false) // wall
    const one = place(level, new Map(), 1, mirror)
    expect(place(level, one, 4, mirror)).toBe(one)
    expect(remaining(level, one).get('mirror')).toBe(0)
    expect(canPlace(level, one, 4, makePiece('filter', 0, 1))).toBe(true)
  })

  it('records moves in history and undoes them exactly', () => {
    let h = createHistory<Placements>(new Map())
    h = push(h, place(level, h.present, 1, mirror))
    h = push(h, rotateAt(h.present, 1))
    expect(h.present.get(1)?.orient).toBe(1)
    h = push(h, removeAt(h.present, 1))
    expect(h.present.size).toBe(0)
    h = undo(h)
    expect(h.present.get(1)?.orient).toBe(1)
    h = undo(h)
    expect(h.present.get(1)?.orient).toBe(0)
    h = redo(redo(h))
    expect(h.present.size).toBe(0)
  })
})
