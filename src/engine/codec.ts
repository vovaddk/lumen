import { PIECE_KINDS } from './pieces.ts'
import type { Dir, Level, Piece, Stock, Tile } from './types.ts'
import { LIMITS, validateLevel } from './validate.ts'

/*
 * Share codes: a compact, versioned binary layout encoded as base64url.
 *
 *   [version][w][h][tileCount] {[cell][type][param]}*  [stockCount] {[kind<<3 | colour][count]}*
 *   [nameLength] {utf-8 bytes}  [checksum]
 *
 * Codes arrive in URLs, so decoding treats them as untrusted input: every byte is
 * range-checked, trailing data is rejected and the result must pass `validateLevel`.
 */
export const CODEC_VERSION = 1
/** Upper bound on code length, well above the largest legal level. */
export const MAX_CODE_LENGTH = 1024

export class CodecError extends Error {
  override name = 'CodecError'
}

const TILE_TYPES = ['empty', 'wall', 'glass', 'emitter', 'receiver', 'sensor', 'fixed'] as const
type TileType = (typeof TILE_TYPES)[number]

const encodePiece = (p: Piece): number => (PIECE_KINDS.indexOf(p.kind) << 4) | (p.orient << 3) | p.color

function decodePiece(b: number): Piece {
  const kind = PIECE_KINDS[b >> 4]
  if (!kind || b > 0x7f) throw new CodecError('Unknown piece')
  return { kind, orient: ((b >> 3) & 1) as 0 | 1, color: b & 7 }
}

const checksum = (bytes: readonly number[]): number => bytes.reduce((a, b) => (a * 31 + b) & 0xff, 0x5a)

function tileParam(tile: Tile): number {
  switch (tile.t) {
    case 'emitter':
      return (tile.dir << 3) | tile.color
    case 'receiver':
      return tile.color
    case 'fixed':
      return encodePiece(tile.piece)
    default:
      return 0
  }
}

export function encodeLevel(level: Level): string {
  const tiles: number[] = []
  level.tiles.forEach((tile, cell) => {
    if (tile.t !== 'empty') tiles.push(cell, TILE_TYPES.indexOf(tile.t), tileParam(tile))
  })
  const bytes: number[] = [CODEC_VERSION, level.w, level.h, tiles.length / 3, ...tiles, level.inventory.length]
  for (const s of level.inventory) bytes.push((PIECE_KINDS.indexOf(s.kind) << 3) | s.color, s.count)
  const name = [...new TextEncoder().encode(level.name.slice(0, LIMITS.maxName))].slice(0, 160)
  bytes.push(name.length, ...name)
  bytes.push(checksum(bytes))
  return toBase64Url(bytes)
}

export function decodeLevel(code: string, id = 'shared', { playable = true } = {}): Level {
  if (code.length === 0) throw new CodecError('The level code is empty')
  if (code.length > MAX_CODE_LENGTH) throw new CodecError('The level code is too long')
  const bytes = fromBase64Url(code)
  if (bytes.length < 2 || checksum(bytes.slice(0, -1)) !== bytes[bytes.length - 1]) {
    throw new CodecError('The level code is damaged (checksum mismatch)')
  }
  let i = 0
  const end = bytes.length - 1
  const read = (): number => {
    const b = i < end ? bytes[i++] : undefined
    if (b === undefined) throw new CodecError('The level code is cut short')
    return b
  }

  const version = read()
  if (version !== CODEC_VERSION) throw new CodecError(`Unsupported level code version ${version}`)
  const w = read()
  const h = read()
  if (w < LIMITS.minSize || h < LIMITS.minSize || w > LIMITS.maxSize || h > LIMITS.maxSize) {
    throw new CodecError('The board size is out of range')
  }
  const tiles: Tile[] = Array.from({ length: w * h }, (): Tile => ({ t: 'empty' }))
  const count = read()
  if (count > w * h) throw new CodecError('Too many tiles')
  const seen = new Set<number>()
  for (let k = 0; k < count; k++) {
    const cell = read()
    const type = TILE_TYPES[read()]
    const param = read()
    if (cell >= w * h || seen.has(cell)) throw new CodecError('A tile is outside the board or repeated')
    seen.add(cell)
    tiles[cell] = decodeTile(type, param)
  }

  const stockCount = read()
  if (stockCount > 16) throw new CodecError('Too many tray entries')
  const inventory: Stock[] = []
  for (let k = 0; k < stockCount; k++) {
    const b = read()
    const kind = b > 0x3f ? undefined : PIECE_KINDS[b >> 3]
    if (!kind) throw new CodecError('Unknown piece in the tray')
    inventory.push({ kind, color: b & 7, count: read() })
  }

  const nameLength = read()
  const nameBytes = Uint8Array.from({ length: nameLength }, read)
  let name: string
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)
  } catch {
    throw new CodecError('The level name is not valid text')
  }
  if (i !== end) throw new CodecError('The level code has trailing data')

  const level: Level = { id, name: name.trim() || 'Untitled', w, h, tiles, inventory }
  const errors = validateLevel(level, { playable })
  if (errors.length) throw new CodecError(errors.join('; '))
  return level
}

function decodeTile(type: TileType | undefined, param: number): Tile {
  switch (type) {
    case 'wall':
    case 'glass':
    case 'sensor':
      if (param !== 0) throw new CodecError('Unexpected tile data')
      return { t: type }
    case 'emitter':
      if (param > 0x1f) throw new CodecError('Bad emitter')
      return { t: 'emitter', dir: (param >> 3) as Dir, color: param & 7 }
    case 'receiver':
      if (param > 7) throw new CodecError('Bad receiver')
      return { t: 'receiver', color: param }
    case 'fixed':
      return { t: 'fixed', piece: decodePiece(param) }
    case 'empty':
    case undefined:
      throw new CodecError('Unknown tile type')
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toBase64Url(bytes: readonly number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const chars = Math.min(4, bytes.length - i + 1)
    for (let k = 0; k < chars; k++) out += ALPHABET.charAt((n >> (18 - 6 * k)) & 63)
  }
  return out
}

export function fromBase64Url(code: string): number[] {
  if (!/^[A-Za-z0-9_-]+$/.test(code) || code.length % 4 === 1) {
    throw new CodecError('The level code has invalid characters')
  }
  const bytes: number[] = []
  for (let i = 0; i < code.length; i += 4) {
    const chunk = code.slice(i, i + 4)
    let n = 0
    for (let k = 0; k < 4; k++) n = (n << 6) | (k < chunk.length ? ALPHABET.indexOf(chunk.charAt(k)) : 0)
    bytes.push((n >> 16) & 255)
    if (chunk.length > 2) bytes.push((n >> 8) & 255)
    if (chunk.length > 3) bytes.push(n & 255)
  }
  return bytes
}
