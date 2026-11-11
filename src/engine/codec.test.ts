import { describe, expect, it } from 'vitest'
import { ALL_LEVELS } from '../levels/index.ts'
import { CodecError, decodeLevel, encodeLevel, fromBase64Url, toBase64Url } from './codec.ts'
import { parseLevel } from './parse.ts'
import type { Level } from './types.ts'

const strip = (l: Level) => ({ name: l.name, w: l.w, h: l.h, tiles: l.tiles, inventory: l.inventory })

const sample = parseLevel({
  id: 'x',
  name: 'Ünïcode ✦ name',
  inventory: { mirror: 2, 'filter-c': 1, prism: 1 },
  map: ['>w .  ~  @c', '.  #  s/ .', 'x  fy p  h', '\\ /  .  ^b'].map((r) => r.replace('@c', '@c')),
})

/** Re-encodes raw bytes with a valid checksum so tests reach the structural checks. */
function withChecksum(bytes: number[]): string {
  const sum = bytes.reduce((a, b) => (a * 31 + b) & 0xff, 0x5a)
  return toBase64Url([...bytes, sum])
}

describe('level codec', () => {
  it('round-trips every shipped level', () => {
    for (const level of ALL_LEVELS) {
      const code = encodeLevel(level)
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(strip(decodeLevel(code))).toEqual(strip(level))
    }
  })

  it('round-trips unicode names and every tile type', () => {
    expect(strip(decodeLevel(encodeLevel(sample)))).toEqual(strip(sample))
  })

  it('base64url round-trips every length', () => {
    for (let n = 0; n < 12; n++) {
      const bytes = Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255)
      expect(fromBase64Url(toBase64Url(bytes) || 'AA').slice(0, n)).toEqual(bytes)
    }
  })

  const code = encodeLevel(sample)
  const bytes = fromBase64Url(code)
  const body = bytes.slice(0, -1)

  it.each([
    ['empty', ''],
    ['bad characters', 'abc$%^'],
    ['impossible length', 'AAAAA'],
    ['too long', 'A'.repeat(5000)],
    ['truncated', code.slice(0, code.length - 6)],
    ['flipped byte', toBase64Url(bytes.map((b, i) => (i === 8 ? b ^ 1 : b)))],
  ])('rejects %s codes', (_, bad) => {
    expect(() => decodeLevel(bad)).toThrow(CodecError)
  })

  it.each([
    ['an unknown version', [9, ...body.slice(1)]],
    ['an oversized board', [1, 40, 40, ...body.slice(3)]],
    ['a tiny board', [1, 2, 2, ...body.slice(3)]],
    ['trailing data', [...body, 0]],
    ['a tile outside the board', [1, 3, 3, 1, 200, 1, 0, 0, 0]],
    ['an unknown tile type', [1, 3, 3, 1, 0, 42, 0, 0, 0]],
    ['a repeated cell', [1, 3, 3, 2, 0, 1, 0, 0, 1, 0, 0, 0]],
    ['a level with no receiver', [1, 3, 3, 1, 0, 3, 0x0f, 0, 0]],
    ['invalid utf-8 in the name', [1, 3, 3, 2, 0, 3, 0x0f, 2, 4, 1, 0, 2, 0xff, 0xfe]],
    ['an impossible tray count', [1, 3, 3, 2, 0, 3, 0x0f, 2, 4, 1, 1, 0, 99, 0]],
    ['a white filter', [1, 3, 3, 2, 0, 3, 0x0f, 2, 4, 1, 1, (2 << 3) | 7, 1, 0]],
  ])('rejects %s', (_, raw) => {
    expect(() => decodeLevel(withChecksum(raw))).toThrow(CodecError)
  })

  it('accepts a minimal hand-built code', () => {
    // 3x3, red emitter facing east at 0, red receiver at 2, empty tray, no name.
    const level = decodeLevel(withChecksum([1, 3, 3, 2, 0, 3, (1 << 3) | 1, 2, 4, 1, 0, 0]))
    expect(level.tiles[0]).toEqual({ t: 'emitter', dir: 1, color: 1 })
    expect(level.name).toBe('Untitled')
  })

  it('never throws anything but CodecError on random input', () => {
    let seed = 42
    const rand = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let k = 0; k < 2000; k++) {
      const len = 1 + Math.floor(rand() * 60)
      const s = Array.from({ length: len }, () => alphabet[Math.floor(rand() * 64)]).join('')
      try {
        decodeLevel(s)
      } catch (e) {
        expect(e).toBeInstanceOf(CodecError)
      }
    }
  })
})
