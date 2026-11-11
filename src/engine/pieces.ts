import { colorName } from './color.ts'
import type { Mask, Piece, PieceKind, Stock } from './types.ts'

export const PIECE_KINDS: readonly PieceKind[] = ['mirror', 'splitter', 'filter', 'prism', 'shifter']

/** Pieces whose orientation can be toggled by the player. */
export const isRotatable = (kind: PieceKind): boolean => kind === 'mirror' || kind === 'splitter'

export const makePiece = (kind: PieceKind, orient: 0 | 1 = 0, color: Mask = 0): Piece => ({
  kind,
  orient: isRotatable(kind) ? orient : 0,
  color: kind === 'filter' ? color : 0,
})

/** Inventory identity of a piece: orientation is free, filter colour is not. */
export const stockKey = (p: { kind: PieceKind; color: Mask }): string =>
  p.kind === 'filter' ? `filter${p.color}` : p.kind

export const samePiece = (a: Piece, b: Piece): boolean =>
  a.kind === b.kind && a.orient === b.orient && a.color === b.color

export const rotated = (p: Piece): Piece => (isRotatable(p.kind) ? { ...p, orient: p.orient === 0 ? 1 : 0 } : p)

/** All placeable variants of a stock entry (both orientations for mirrors and splitters). */
export const variants = (s: Pick<Stock, 'kind' | 'color'>): Piece[] =>
  isRotatable(s.kind) ? [makePiece(s.kind, 0), makePiece(s.kind, 1)] : [makePiece(s.kind, 0, s.color)]

const KIND_LABEL: Record<PieceKind, string> = {
  mirror: 'mirror',
  splitter: 'splitter',
  filter: 'filter',
  prism: 'prism',
  shifter: 'hue shifter',
}

export const pieceLabel = (p: { kind: PieceKind; color: Mask }): string =>
  p.kind === 'filter' ? `${colorName(p.color)} filter` : KIND_LABEL[p.kind]
