import { describe, expect, it } from 'vitest'
import { BLUE, GREEN, RED, colorName, filterLight, mix, shiftHue } from './color.ts'
import { makePiece } from './pieces.ts'
import { parseLevel } from './parse.ts'
import { evaluate, starsFor } from './rules.ts'
import type { Level, Piece } from './types.ts'

const level = (map: string[]): Level => parseLevel({ id: 't', name: 't', map, inventory: { mirror: 2 } })

describe('colour mixing', () => {
  it('adds light channel by channel', () => {
    expect(mix(RED, GREEN)).toBe(3)
    expect(colorName(mix(RED, BLUE))).toBe('magenta')
    expect(colorName(mix(GREEN, BLUE))).toBe('cyan')
    expect(colorName(mix(RED, GREEN, BLUE))).toBe('white')
    expect(mix(RED, RED)).toBe(RED)
    expect(mix()).toBe(0)
  })

  it('filters subtract and shifters rotate', () => {
    expect(filterLight(7, RED | GREEN)).toBe(3)
    expect(filterLight(BLUE, RED)).toBe(0)
    expect(shiftHue(RED)).toBe(GREEN)
    expect(shiftHue(GREEN)).toBe(BLUE)
    expect(shiftHue(BLUE)).toBe(RED)
    expect(shiftHue(shiftHue(shiftHue(5)))).toBe(5)
  })
})

describe('win and fail conditions', () => {
  it('solves when the receiver gets exactly its colour', () => {
    const l = level(['>r .  @r', '.  .  .', '.  .  .'])
    expect(evaluate(l, new Map()).solved).toBe(true)
  })

  it('fails when a receiver gets the wrong colour', () => {
    const l = level(['>b .  @r', '.  .  .', '.  .  .'])
    const ev = evaluate(l, new Map())
    expect(ev.solved).toBe(false)
    expect(ev.targets[0]).toMatchObject({ need: RED, got: BLUE, ok: false })
  })

  it('fails when a receiver gets more than its colour', () => {
    const l = level(['.  .  vg', '>r .  @r', '.  .  .'])
    const ev = evaluate(l, new Map())
    expect(ev.solved).toBe(false)
    expect(ev.targets[0]?.got).toBe(RED | GREEN)
  })

  it('fails while a sensor is lit, passes once it is dark', () => {
    const l = level(['>g .  x  .', '.  .  .  .', '.  @g .  .'])
    expect(evaluate(l, new Map()).solved).toBe(false)
    const fix: Piece = makePiece('mirror', 1)
    expect(evaluate(l, new Map([[1, fix]])).solved).toBe(true)
  })

  it('needs every receiver lit', () => {
    const l = level(['>r .  @r', '.  .  .', '@b .  .'])
    expect(evaluate(l, new Map()).solved).toBe(false)
  })

  it('awards stars against par', () => {
    expect(starsFor(2, 2)).toBe(3)
    expect(starsFor(3, 2)).toBe(2)
    expect(starsFor(5, 2)).toBe(1)
  })
})
