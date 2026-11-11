import { CHANNELS, shiftHue } from './color.ts'
import { pieceAt, reflect, step, tileAt, turnLeft, turnRight } from './grid.ts'
import type { Dir, Level, Placements } from './types.ts'

export interface Trace {
  /**
   * `out[cell * 4 + d]`: channels leaving the centre of `cell` towards side `d`.
   * `inn[cell * 4 + d]`: channels entering `cell` through side `d` and reaching its centre.
   * Together they describe every half-segment of light for the renderer.
   */
  readonly out: Uint8Array
  readonly inn: Uint8Array
  /** Channels that reached the centre of each cell, from any side. */
  readonly lit: Uint8Array
  /** Number of beam states processed; bounded by cells * 4 directions * 3 channels. */
  readonly steps: number
}

const orInto = (a: Uint8Array, i: number, v: number): void => {
  a[i] = (a[i] ?? 0) | v
}

const CHANNEL_INDEX: Readonly<Record<number, number>> = { 1: 0, 2: 1, 4: 2 }

/**
 * Traces every emitter's light through the board.
 *
 * Light is linear: each primary channel travels independently and only meets the others
 * at receivers, where they are OR-ed together. So the tracer walks single-channel states
 * (cell, direction, channel). There are at most cells * 4 * 3 of them, and each one is
 * expanded once, which makes beam loops (mirror cycles, splitter rings) terminate by
 * construction.
 */
export function trace(level: Level, placed: Placements): Trace {
  const { w, h } = level
  const n = w * h
  const out = new Uint8Array(n * 4)
  const inn = new Uint8Array(n * 4)
  const lit = new Uint8Array(n)
  const seen = new Uint8Array(n * 12)
  // A state means: a single channel is about to leave the centre of `cell` heading `dir`.
  const stack: number[] = []
  const push = (cell: number, dir: Dir, ch: number): void => {
    stack.push(cell, dir, ch)
  }

  for (let cell = 0; cell < n; cell++) {
    const tile = tileAt(level, cell)
    if (tile.t !== 'emitter') continue
    for (const ch of CHANNELS) if (tile.color & ch) push(cell, tile.dir, ch)
  }

  let steps = 0
  while (stack.length > 0) {
    const ch = stack.pop() ?? 0
    const dir = (stack.pop() ?? 0) as Dir
    const cell = stack.pop() ?? 0
    const key = (cell * 4 + dir) * 3 + (CHANNEL_INDEX[ch] ?? 0)
    if (seen[key]) continue
    seen[key] = 1
    steps++
    orInto(out, cell * 4 + dir, ch)

    const next = step(w, h, cell, dir)
    if (next < 0) continue
    const tile = tileAt(level, next)
    // Walls and emitter housings stop light at their edge.
    if (tile.t === 'wall' || tile.t === 'emitter') continue
    const side = ((dir + 2) % 4) as Dir
    orInto(inn, next * 4 + side, ch)
    orInto(lit, next, ch)
    // Receivers and sensors absorb light at their centre.
    if (tile.t === 'receiver' || tile.t === 'sensor') continue

    const piece = pieceAt(level, placed, next)
    if (!piece) {
      push(next, dir, ch)
      continue
    }
    switch (piece.kind) {
      case 'mirror':
        push(next, reflect(piece.orient, dir), ch)
        break
      case 'splitter':
        push(next, dir, ch)
        push(next, reflect(piece.orient, dir), ch)
        break
      case 'filter':
        if (piece.color & ch) push(next, dir, ch)
        break
      case 'prism':
        // Red bends left, green goes straight, blue bends right (relative to travel).
        push(next, ch === 1 ? turnLeft(dir) : ch === 4 ? turnRight(dir) : dir, ch)
        break
      case 'shifter':
        push(next, dir, shiftHue(ch))
        break
    }
  }
  return { out, inn, lit, steps }
}

/** Channels drawn on the half-segment from a cell's centre to its side `d`, in either direction. */
export const halfSegment = (t: Trace, cell: number, d: Dir): number =>
  (t.out[cell * 4 + d] ?? 0) | (t.inn[cell * 4 + d] ?? 0)
