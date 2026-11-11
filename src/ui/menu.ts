import { evaluate, starsFor } from '../engine/rules.ts'
import { ALL_LEVELS, CHAPTERS } from '../levels/index.ts'
import { BoardRenderer } from '../render/board.ts'
import { clear, h } from './dom.ts'
import { stars } from './icons.ts'
import type { Screen } from './play.ts'
import { loadProgress } from './storage.ts'

/** Title screen and level select: each level is shown as a small cyanotype print of its board. */
export function mountMenu(root: HTMLElement, colorblind: () => boolean): Screen {
  const { best } = loadProgress()
  const solved = ALL_LEVELS.filter((l) => best[l.id] !== undefined)
  const totalStars = ALL_LEVELS.reduce((a, l) => {
    const b = best[l.id]
    return a + (b === undefined ? 0 : starsFor(b, l.par))
  }, 0)
  const next = ALL_LEVELS.find((l) => best[l.id] === undefined) ?? ALL_LEVELS[0]
  const thumbs: { canvas: HTMLCanvasElement; id: string }[] = []

  const hero = h(
    'section',
    { class: 'hero' },
    h('h1', { class: 'wordmark' }, h('span', { class: 'beam', 'aria-hidden': 'true' }), 'lumen'),
    h(
      'p',
      { class: 'pitch' },
      'Route light through mirrors, splitters, filters and prisms until every receiver glows with exactly its colour.',
    ),
    h(
      'div',
      { class: 'hero-actions' },
      next
        ? h('a', { class: 'button primary', href: `#/play/${next.id}` }, solved.length ? `Continue with ${next.id} ${next.name}` : 'Start playing')
        : null,
      h('a', { class: 'button', href: '#/editor' }, 'Open the level editor'),
    ),
    h('p', { class: 'progress' }, `${solved.length} of ${ALL_LEVELS.length} levels solved, ${totalStars} of ${ALL_LEVELS.length * 3} stars`),
  )

  const chapters = CHAPTERS.map((ch) =>
    h(
      'section',
      { class: 'chapter', 'aria-labelledby': `ch-${ch.id}` },
      h(
        'header',
        { class: 'chapter-head' },
        h('h2', { id: `ch-${ch.id}` }, h('span', { class: 'chapter-num' }, ch.id), ch.name),
        h('p', {}, ch.blurb),
      ),
      h(
        'ol',
        { class: 'prints' },
        ...ch.levels.map((l) => {
          const b = best[l.id]
          const canvas = h('canvas', { class: 'thumb', 'aria-hidden': 'true' })
          canvas.style.aspectRatio = `${l.w} / ${l.h}`
          thumbs.push({ canvas, id: l.id })
          return h(
            'li',
            {},
            h(
              'a',
              { class: `print${b === undefined ? '' : ' solved'}`, href: `#/play/${l.id}` },
              h('span', { class: 'thumb-frame' }, canvas),
              h('span', { class: 'print-meta' }, h('span', { class: 'print-id' }, l.id), h('span', { class: 'print-name' }, l.name)),
              b === undefined ? h('span', { class: 'visually-hidden' }, 'Not solved yet') : stars(starsFor(b, l.par), 13),
            ),
          )
        }),
      ),
    ),
  )

  clear(root, h('div', { class: 'menu' }, hero, ...chapters))

  const drawThumbs = (): void => {
    for (const { canvas, id } of thumbs) {
      const level = ALL_LEVELS.find((l) => l.id === id)
      if (!level) continue
      const r = new BoardRenderer(canvas, true)
      const ev = evaluate(level, new Map())
      r.setView({ level, placed: new Map(), trace: ev.trace, targets: ev.targets, cursor: null, showCursor: false, ghost: null, solved: false, colorblind: colorblind() })
      r.drawNow()
      r.destroy()
    }
  }
  // Thumbnails size themselves from layout, so draw after the first frame.
  let raf = requestAnimationFrame(() => {
    raf = 0
    drawThumbs()
  })

  return {
    unmount: () => {
      if (raf) cancelAnimationFrame(raf)
    },
    refresh: drawThumbs,
  }
}
