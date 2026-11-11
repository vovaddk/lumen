import { parseLevel, type LevelSource } from '../engine/parse.ts'
import type { Level } from '../engine/types.ts'
import { chapter1 } from './chapter1.ts'
import { chapter2 } from './chapter2.ts'
import { chapter3 } from './chapter3.ts'

export interface Chapter {
  readonly id: string
  readonly name: string
  readonly blurb: string
  readonly levels: readonly Level[]
}

const chapter = (id: string, name: string, blurb: string, src: readonly LevelSource[]): Chapter => ({
  id,
  name,
  blurb,
  levels: src.map(parseLevel),
})

export const CHAPTERS: readonly Chapter[] = [
  chapter('1', 'Reflection', 'Mirrors, walls, glass and sensors.', chapter1),
  chapter('2', 'Spectrum', 'Mixing light, splitting it and filtering it.', chapter2),
  chapter('3', 'Refraction', 'Prisms and hue shifters.', chapter3),
]

export const ALL_LEVELS: readonly Level[] = CHAPTERS.flatMap((c) => c.levels)

export const levelById = (id: string): Level | undefined => ALL_LEVELS.find((l) => l.id === id)

/** The level after `id`, across chapter boundaries. */
export function nextLevel(id: string): Level | undefined {
  const i = ALL_LEVELS.findIndex((l) => l.id === id)
  return i < 0 ? undefined : ALL_LEVELS[i + 1]
}
