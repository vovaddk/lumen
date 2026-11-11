import type { Piece } from '../engine/types.ts'
import { drawPiece } from '../render/draw.ts'
import { h } from './dom.ts'

/** A small canvas icon of a piece, for trays and tool palettes. */
export function pieceIcon(piece: Piece, size = 36): HTMLCanvasElement {
  const c = h('canvas', { width: size * 2, height: size * 2, class: 'piece-icon', 'aria-hidden': 'true' })
  c.style.width = c.style.height = `${size}px`
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.scale(2, 2)
    drawPiece(ctx, piece, size / 2, size / 2, size)
  }
  return c
}

/** Colour swatch with a text fallback for the colour name. */
export function swatch(css: string): HTMLSpanElement {
  const s = h('span', { class: 'swatch', 'aria-hidden': 'true' })
  s.style.setProperty('--c', css)
  return s
}

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z'

/** Three stars with `n` filled, with an accessible label. */
export function stars(n: number, size = 16): HTMLSpanElement {
  const el = h('span', { class: 'stars', role: 'img', 'aria-label': `${n} of 3 stars` })
  for (let i = 0; i < 3; i++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    svg.setAttribute('class', i < n ? 'star on' : 'star')
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', STAR_PATH)
    svg.append(p)
    el.append(svg)
  }
  return el
}
