import type { Mask } from './types.ts'

export const RED = 1
export const GREEN = 2
export const BLUE = 4
export const WHITE = 7
/** The three primary channels, in tracing order. */
export const CHANNELS = [RED, GREEN, BLUE] as const

export const COLOR_NAMES: Readonly<Record<number, string>> = {
  0: 'dark',
  1: 'red',
  2: 'green',
  3: 'yellow',
  4: 'blue',
  5: 'magenta',
  6: 'cyan',
  7: 'white',
}

/** Additive mixing of light. */
export const mix = (...colors: readonly Mask[]): Mask => colors.reduce((a, c) => a | c, 0) & WHITE

/** What survives a colour filter. */
export const filterLight = (light: Mask, filter: Mask): Mask => light & filter & WHITE

/** Hue shifter: red becomes green, green becomes blue, blue becomes red. */
export const shiftHue = (light: Mask): Mask => ((light << 1) | (light >> 2)) & WHITE

export const colorName = (m: Mask): string => COLOR_NAMES[m & WHITE] ?? 'dark'

/** Single-letter colour code used by the text level format. */
export const COLOR_CHARS = '.rgybmcw'
