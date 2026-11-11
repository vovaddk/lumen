/** Travel direction: 0 = north, 1 = east, 2 = south, 3 = west. */
export type Dir = 0 | 1 | 2 | 3

/**
 * A colour is a 3-bit additive light mask: red = 1, green = 2, blue = 4.
 * Mixing light is a bitwise OR, filtering is a bitwise AND.
 */
export type Mask = number

export type PieceKind = 'mirror' | 'splitter' | 'filter' | 'prism' | 'shifter'

/**
 * A movable optical element.
 * `orient` matters for mirrors and splitters (0 = "/", 1 = "\"); `color` only for filters.
 */
export interface Piece {
  readonly kind: PieceKind
  readonly orient: 0 | 1
  readonly color: Mask
}

export type Tile =
  | { readonly t: 'empty' }
  | { readonly t: 'wall' }
  | { readonly t: 'glass' }
  | { readonly t: 'emitter'; readonly dir: Dir; readonly color: Mask }
  | { readonly t: 'receiver'; readonly color: Mask }
  | { readonly t: 'sensor' }
  | { readonly t: 'fixed'; readonly piece: Piece }

/** One kind of piece in the player's tray, e.g. "mirror" or "red filter". */
export interface Stock {
  readonly kind: PieceKind
  /** Filter colour; 0 for every other kind. */
  readonly color: Mask
  readonly count: number
}

export interface Level {
  readonly id: string
  readonly name: string
  readonly w: number
  readonly h: number
  /** Row-major, length w * h. */
  readonly tiles: readonly Tile[]
  readonly inventory: readonly Stock[]
  /** Minimum number of pieces needed; proven by the solver test for shipped levels. */
  readonly par?: number
  /** One-off tutorial text shown the first time the level is opened. */
  readonly tutorial?: string
}

/** Player placements keyed by cell index. */
export type Placements = ReadonlyMap<number, Piece>

export interface Placement {
  readonly cell: number
  readonly piece: Piece
}
