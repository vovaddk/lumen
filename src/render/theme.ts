/** Cyanotype palette: Prussian-blue paper, chalk linework, pure light. */
export const THEME = {
  ground: '#0d2240',
  paper: '#173a63',
  paperDeep: '#11305a',
  etch: 'rgba(170, 205, 240, 0.16)',
  etchStrong: 'rgba(190, 220, 248, 0.42)',
  chalk: '#eaf1f6',
  ink: '#0a1a30',
  sodium: '#ffc56b',
  alarm: '#ff8a5c',
} as const

/** Light channels as RGB triplets; drawn with additive blending so overlaps mix like real light. */
export const CHANNEL_RGB: Readonly<Record<number, readonly [number, number, number]>> = {
  1: [255, 48, 64],
  2: [48, 255, 104],
  4: [80, 130, 255],
}

/** Display colours for every mask, used by DOM swatches and solid fills. */
export const MASK_CSS: Readonly<Record<number, string>> = {
  0: '#4a6688',
  1: '#ff3040',
  2: '#30ff68',
  3: '#fff04a',
  4: '#5a8cff',
  5: '#ff4af0',
  6: '#4af2ff',
  7: '#ffffff',
}

export const maskCss = (m: number): string => MASK_CSS[m & 7] ?? MASK_CSS[0] ?? '#fff'

export const rgba = (rgb: readonly [number, number, number], a: number): string => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
