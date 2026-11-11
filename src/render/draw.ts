import type { Dir, Mask, Piece, Tile } from '../engine/types.ts'
import { CHANNEL_RGB, THEME, maskCss, rgba } from './theme.ts'

type Ctx = CanvasRenderingContext2D

/** Colour-blind glyphs: red = triangle, green = square, blue = circle. */
export function drawGlyph(ctx: Ctx, channel: number, x: number, y: number, r: number, fill: string, filled = true): void {
  ctx.beginPath()
  if (channel === 1) {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r * 0.95, y + r * 0.7)
    ctx.lineTo(x - r * 0.95, y + r * 0.7)
    ctx.closePath()
  } else if (channel === 2) {
    ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5)
  } else {
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2)
  }
  if (filled) {
    ctx.fillStyle = fill
    ctx.fill()
  } else {
    ctx.strokeStyle = fill
    ctx.lineWidth = Math.max(1, r * 0.3)
    ctx.stroke()
  }
}

/** A row of glyphs for every channel in `mask`, centred on (x, y). */
export function drawGlyphRow(ctx: Ctx, mask: Mask, x: number, y: number, r: number, fill: string, hollow = 0): void {
  const chans = [1, 2, 4].filter((c) => (mask | hollow) & c)
  const gap = r * 2.3
  chans.forEach((c, i) => {
    drawGlyph(ctx, c, x + (i - (chans.length - 1) / 2) * gap, y, r, fill, (mask & c) !== 0)
  })
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Angle of a mirror line: "/" rises to the right. */
export const orientAngle = (orient: 0 | 1): number => (orient === 0 ? -Math.PI / 4 : Math.PI / 4)

/**
 * Draws a movable piece centred at (cx, cy) inside a cell of size `s`.
 * `angle` overrides the mirror angle so rotations can be tweened.
 */
export function drawPiece(ctx: Ctx, piece: Piece, cx: number, cy: number, s: number, angle?: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.lineCap = 'round'
  switch (piece.kind) {
    case 'mirror':
    case 'splitter': {
      ctx.rotate(angle ?? orientAngle(piece.orient))
      const half = s * 0.4
      if (piece.kind === 'mirror') {
        ctx.strokeStyle = THEME.ink
        ctx.lineWidth = s * 0.15
        ctx.beginPath()
        ctx.moveTo(-half, s * 0.035)
        ctx.lineTo(half, s * 0.035)
        ctx.stroke()
        ctx.strokeStyle = THEME.chalk
        ctx.lineWidth = s * 0.085
        ctx.beginPath()
        ctx.moveTo(-half, 0)
        ctx.lineTo(half, 0)
        ctx.stroke()
      } else {
        ctx.strokeStyle = 'rgba(234, 241, 246, 0.35)'
        ctx.lineWidth = s * 0.12
        ctx.beginPath()
        ctx.moveTo(-half, 0)
        ctx.lineTo(half, 0)
        ctx.stroke()
        ctx.strokeStyle = THEME.chalk
        ctx.lineWidth = s * 0.05
        ctx.setLineDash([s * 0.07, s * 0.07])
        ctx.beginPath()
        ctx.moveTo(-half, 0)
        ctx.lineTo(half, 0)
        ctx.stroke()
        ctx.setLineDash([])
      }
      break
    }
    case 'filter': {
      const r = s * 0.3
      roundRect(ctx, -r, -r, r * 2, r * 2, s * 0.08)
      ctx.fillStyle = maskCss(piece.color)
      ctx.globalAlpha = 0.3
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = maskCss(piece.color)
      ctx.lineWidth = s * 0.05
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = s * 0.025
      ctx.beginPath()
      ctx.moveTo(-r * 0.55, r * 0.2)
      ctx.lineTo(r * 0.2, -r * 0.55)
      ctx.stroke()
      break
    }
    case 'prism': {
      const r = s * 0.34
      const pts = [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
        return [Math.cos(a) * r, Math.sin(a) * r + r * 0.12] as const
      })
      ctx.beginPath()
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.closePath()
      const g = ctx.createLinearGradient(-r, 0, r, 0)
      g.addColorStop(0, 'rgba(255, 48, 64, 0.35)')
      g.addColorStop(0.5, 'rgba(48, 255, 104, 0.3)')
      g.addColorStop(1, 'rgba(80, 130, 255, 0.4)')
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = THEME.chalk
      ctx.lineWidth = s * 0.05
      ctx.lineJoin = 'round'
      ctx.stroke()
      break
    }
    case 'shifter': {
      const r = s * 0.27
      ctx.lineWidth = s * 0.07
      ;[1, 2, 4].forEach((ch, i) => {
        const a0 = -Math.PI / 2 + (i * Math.PI * 2) / 3 + 0.25
        const a1 = a0 + (Math.PI * 2) / 3 - 0.5
        ctx.strokeStyle = maskCss(ch)
        ctx.beginPath()
        ctx.arc(0, 0, r, a0, a1)
        ctx.stroke()
        // Arrowhead pointing to the next colour.
        const ax = Math.cos(a1) * r
        const ay = Math.sin(a1) * r
        const t = a1 + Math.PI / 2
        ctx.fillStyle = maskCss(ch)
        ctx.beginPath()
        ctx.moveTo(ax + Math.cos(t) * s * 0.08, ay + Math.sin(t) * s * 0.08)
        ctx.lineTo(ax + Math.cos(a1) * s * 0.07, ay + Math.sin(a1) * s * 0.07)
        ctx.lineTo(ax - Math.cos(a1) * s * 0.07, ay - Math.sin(a1) * s * 0.07)
        ctx.fill()
      })
      ctx.fillStyle = THEME.chalk
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.045, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

const DIR_ANGLE: Readonly<Record<Dir, number>> = { 0: -Math.PI / 2, 1: 0, 2: Math.PI / 2, 3: Math.PI }

export interface TileStyle {
  /** Light currently reaching the cell. */
  readonly got: Mask
  readonly ok: boolean
  readonly colorblind: boolean
  /** 0..1 pulse used right after a receiver is satisfied. */
  readonly pulse: number
}

/** Draws fixed board objects. Walls and glass go under the light, the rest on top. */
export function drawTile(ctx: Ctx, tile: Tile, x: number, y: number, s: number, st: TileStyle): void {
  const cx = x + s / 2
  const cy = y + s / 2
  switch (tile.t) {
    case 'wall': {
      roundRect(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.06)
      ctx.fillStyle = THEME.ink
      ctx.fill()
      ctx.save()
      ctx.clip()
      ctx.strokeStyle = 'rgba(170, 205, 240, 0.13)'
      ctx.lineWidth = 1
      for (let k = -s; k < s; k += s / 6) {
        ctx.beginPath()
        ctx.moveTo(x + k, y + s)
        ctx.lineTo(x + k + s, y)
        ctx.stroke()
      }
      ctx.restore()
      break
    }
    case 'glass': {
      roundRect(ctx, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.12)
      ctx.fillStyle = 'rgba(220, 238, 255, 0.07)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(220, 238, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
      // Corner sheen; deliberately not diagonal so glass never reads as a mirror.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.lineWidth = s * 0.035
      ctx.beginPath()
      ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.3, Math.PI * 1.05, Math.PI * 1.4)
      ctx.stroke()
      break
    }
    case 'emitter': {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(DIR_ANGLE[tile.dir])
      roundRect(ctx, -s * 0.36, -s * 0.3, s * 0.62, s * 0.6, s * 0.12)
      ctx.fillStyle = THEME.ink
      ctx.fill()
      ctx.strokeStyle = THEME.etchStrong
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Nozzle facing the firing direction.
      ctx.fillStyle = THEME.chalk
      ctx.fillRect(s * 0.26, -s * 0.11, s * 0.16, s * 0.22)
      ctx.restore()
      glowDot(ctx, cx, cy, s * 0.15, tile.color)
      if (st.colorblind) drawGlyphRow(ctx, tile.color, cx, cy + s * 0.36, s * 0.06, THEME.chalk)
      break
    }
    case 'receiver': {
      const r = s * 0.34
      if (st.ok) {
        const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * (1.9 + st.pulse * 0.8))
        g.addColorStop(0, withAlpha(maskCss(tile.color), 0.55))
        g.addColorStop(1, withAlpha(maskCss(tile.color), 0))
        ctx.fillStyle = g
        ctx.fillRect(x - s, y - s, s * 3, s * 3)
      }
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = THEME.ink
      ctx.fill()
      ctx.lineWidth = s * (st.ok ? 0.08 : 0.05)
      ctx.strokeStyle = maskCss(tile.color)
      ctx.stroke()
      // Inner ring shows the required colour; the core shows what arrives.
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
      ctx.strokeStyle = withAlpha(maskCss(tile.color), 0.5)
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (st.got) glowDot(ctx, cx, cy, r * (st.ok ? 0.5 : 0.32), st.got)
      if (st.got && !st.ok) {
        ctx.strokeStyle = THEME.alarm
        ctx.lineWidth = s * 0.035
        ctx.setLineDash([s * 0.06, s * 0.05])
        ctx.beginPath()
        ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (st.colorblind) drawGlyphRow(ctx, st.got & tile.color, cx, cy + r * 1.32, s * 0.065, THEME.chalk, tile.color)
      break
    }
    case 'sensor': {
      const r = s * 0.3
      const lit = st.got !== 0
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = THEME.ink
      ctx.fill()
      ctx.strokeStyle = lit ? THEME.alarm : THEME.etchStrong
      ctx.lineWidth = s * 0.05
      ctx.stroke()
      ctx.beginPath()
      const k = r * 0.5
      ctx.moveTo(cx - k, cy - k)
      ctx.lineTo(cx + k, cy + k)
      ctx.moveTo(cx + k, cy - k)
      ctx.lineTo(cx - k, cy + k)
      ctx.stroke()
      if (lit) glowDot(ctx, cx, cy, r * 0.35, st.got)
      break
    }
    case 'fixed': {
      roundRect(ctx, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.1)
      ctx.fillStyle = 'rgba(10, 26, 48, 0.55)'
      ctx.fill()
      ctx.fillStyle = THEME.etchStrong
      for (const [dx, dy] of [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]] as const) {
        ctx.beginPath()
        ctx.arc(x + s * dx, y + s * dy, s * 0.035, 0, Math.PI * 2)
        ctx.fill()
      }
      drawPiece(ctx, tile.piece, cx, cy, s)
      break
    }
    case 'empty':
      break
  }
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** A small additive light core in the given colour mask. */
export function glowDot(ctx: Ctx, cx: number, cy: number, r: number, mask: Mask): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const ch of [1, 2, 4]) {
    if (!(mask & ch)) continue
    const rgb = CHANNEL_RGB[ch]
    if (!rgb) continue
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2)
    g.addColorStop(0, rgba(rgb, 0.95))
    g.addColorStop(0.35, rgba(rgb, 0.55))
    g.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
