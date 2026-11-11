import { DX, DY, pieceAt, tileAt } from '../engine/grid.ts'
import type { TargetStatus } from '../engine/rules.ts'
import { halfSegment, type Trace } from '../engine/tracer.ts'
import type { Dir, Level, Piece, Placements } from '../engine/types.ts'
import { drawGlyph, drawPiece, drawTile, orientAngle } from './draw.ts'
import { CHANNEL_RGB, THEME, rgba } from './theme.ts'

export interface BoardView {
  readonly level: Level
  readonly placed: Placements
  readonly trace: Trace
  readonly targets: readonly TargetStatus[]
  readonly cursor: number | null
  readonly showCursor: boolean
  /** A translucent preview piece (hint or hover). */
  readonly ghost: { readonly cell: number; readonly piece: Piece; readonly hint: boolean } | null
  readonly solved: boolean
  readonly colorblind: boolean
  /** Cells where the current action would be legal, outlined while editing. */
  readonly highlightAll?: boolean
}

interface Anim {
  readonly t0: number
  readonly kind: 'place' | 'rotate'
  readonly from?: number
}

const PLACE_MS = 180
const ROTATE_MS = 150
const PULSE_MS = 700

const easeOut = (t: number): number => 1 - (1 - t) ** 3

export interface Layout {
  readonly cell: number
  readonly ox: number
  readonly oy: number
}

/** Canvas renderer for one board. Pure drawing: it never mutates game state. */
export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D
  private view: BoardView | null = null
  private layout: Layout = { cell: 40, ox: 0, oy: 0 }
  private cssW = 0
  private cssH = 0
  private readonly anims = new Map<number, Anim>()
  private readonly pulses = new Map<number, number>()
  private winAt = 0
  private raf = 0
  private dirty = true
  private grain: CanvasPattern | null = null
  private readonly motion: MediaQueryList
  private readonly observer: ResizeObserver

  /**
   * @param still  Render without motion or resize tracking (level-select thumbnails).
   */
  private readonly canvas: HTMLCanvasElement
  private readonly still: boolean

  constructor(canvas: HTMLCanvasElement, still = false) {
    this.canvas = canvas
    this.still = still
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    this.motion = matchMedia('(prefers-reduced-motion: reduce)')
    this.observer = new ResizeObserver(() => {
      this.resize()
    })
    if (!still) this.observer.observe(canvas.parentElement ?? canvas)
    this.resize()
  }

  get reducedMotion(): boolean {
    return this.still || this.motion.matches
  }

  /** Draws the current view immediately (used for still thumbnails). */
  drawNow(): void {
    this.draw(0)
  }

  setView(next: BoardView): void {
    const prev = this.view
    const now = performance.now()
    if (prev?.level === next.level && !this.reducedMotion) {
      for (const [cell, piece] of next.placed) {
        const old = prev.placed.get(cell)
        if (!old || old.kind !== piece.kind) this.anims.set(cell, { t0: now, kind: 'place' })
        else if (old.orient !== piece.orient) this.anims.set(cell, { t0: now, kind: 'rotate', from: orientAngle(old.orient) })
      }
      const wasOk = new Set(prev.targets.filter((t) => t.ok && !t.sensor).map((t) => t.cell))
      for (const t of next.targets) if (t.ok && !t.sensor && !wasOk.has(t.cell)) this.pulses.set(t.cell, now)
      if (next.solved && !prev.solved) this.winAt = now
    }
    if (prev?.level !== next.level) this.layoutFor(next.level)
    this.view = next
    this.dirty = true
  }

  start(): void {
    const loop = (t: number): void => {
      this.raf = requestAnimationFrame(loop)
      if (this.dirty || this.isAnimating(t)) this.draw(t)
    }
    this.raf = requestAnimationFrame(loop)
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
  }

  /** Cell under a client-space point, or -1. */
  cellAt(clientX: number, clientY: number): number {
    const v = this.view
    if (!v) return -1
    const r = this.canvas.getBoundingClientRect()
    const { cell, ox, oy } = this.layout
    const x = Math.floor((clientX - r.left - ox) / cell)
    const y = Math.floor((clientY - r.top - oy) / cell)
    return x < 0 || y < 0 || x >= v.level.w || y >= v.level.h ? -1 : y * v.level.w + x
  }

  private resize(): void {
    const host = this.still ? this.canvas : (this.canvas.parentElement ?? this.canvas)
    const w = Math.max(this.still ? 40 : 160, host.clientWidth)
    const h = Math.max(this.still ? 40 : 160, host.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    this.cssW = w
    this.cssH = h
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (this.view) this.layoutFor(this.view.level)
    this.dirty = true
  }

  private layoutFor(level: Level): void {
    // Leave half a cell around the board for coordinate labels (none on thumbnails).
    const pad = this.still ? 0.3 : 1
    const cell = Math.floor(Math.min(this.cssW / (level.w + pad), this.cssH / (level.h + pad), 88))
    this.layout = {
      cell,
      ox: Math.round((this.cssW - cell * level.w) / 2),
      oy: Math.round((this.cssH - cell * level.h) / 2),
    }
  }

  private isAnimating(t: number): boolean {
    if (this.reducedMotion) return false
    // Photons always drift along lit beams, so a lit board keeps drawing.
    if (this.view && this.view.trace.steps > 0) return true
    return this.anims.size > 0 || this.pulses.size > 0 || t - this.winAt < 1200
  }

  private paperPattern(): CanvasPattern | null {
    if (this.grain) return this.grain
    const c = document.createElement('canvas')
    c.width = c.height = 160
    const g = c.getContext('2d')
    if (!g) return null
    const img = g.createImageData(160, 160)
    // Deterministic grain so screenshots are stable.
    let seed = 7
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647
      const v = (seed % 255) | 0
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 14
    }
    g.putImageData(img, 0, 0)
    this.grain = this.ctx.createPattern(c, 'repeat')
    return this.grain
  }

  private draw(t: number): void {
    this.dirty = false
    const v = this.view
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.cssW, this.cssH)
    if (!v) return
    const { level } = v
    const { cell: s, ox, oy } = this.layout
    const W = s * level.w
    const H = s * level.h

    // Paper
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(ox - s * 0.12, oy - s * 0.12, W + s * 0.24, H + s * 0.24, s * 0.16)
    const paper = ctx.createRadialGradient(ox + W / 2, oy + H / 2, 0, ox + W / 2, oy + H / 2, Math.max(W, H) * 0.75)
    paper.addColorStop(0, THEME.paper)
    paper.addColorStop(1, THEME.paperDeep)
    ctx.fillStyle = paper
    ctx.fill()
    const grain = this.paperPattern()
    if (grain) {
      ctx.fillStyle = grain
      ctx.fill()
    }
    ctx.restore()

    // Etched grid
    ctx.strokeStyle = THEME.etch
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= level.w; x++) {
      ctx.moveTo(ox + x * s + 0.5, oy)
      ctx.lineTo(ox + x * s + 0.5, oy + H)
    }
    for (let y = 0; y <= level.h; y++) {
      ctx.moveTo(ox, oy + y * s + 0.5)
      ctx.lineTo(ox + W, oy + y * s + 0.5)
    }
    ctx.stroke()

    // Coordinate labels (match the names used in announcements, e.g. "C4").
    ctx.fillStyle = 'rgba(200, 222, 245, 0.5)'
    ctx.font = `600 ${Math.max(9, Math.round(s * 0.2))}px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (!this.still) for (let x = 0; x < level.w; x++) ctx.fillText(String.fromCharCode(65 + x), ox + x * s + s / 2, oy - s * 0.32)
    if (!this.still) for (let y = 0; y < level.h; y++) ctx.fillText(String(y + 1), ox - s * 0.32, oy + y * s + s / 2)

    const targetAt = new Map(v.targets.map((x) => [x.cell, x]))
    const style = (cell: number) => {
      const ts = targetAt.get(cell)
      const p0 = this.pulses.get(cell)
      let pulse = 0
      if (p0 !== undefined) {
        const k = (t - p0) / PULSE_MS
        if (k >= 1) this.pulses.delete(cell)
        else pulse = Math.sin(k * Math.PI)
      }
      return { got: v.trace.lit[cell] ?? 0, ok: ts?.ok ?? false, colorblind: v.colorblind, pulse }
    }

    // Under-light tiles
    for (let c = 0; c < level.tiles.length; c++) {
      const tile = tileAt(level, c)
      if (tile.t === 'wall' || tile.t === 'glass') drawTile(ctx, tile, ox + (c % level.w) * s, oy + Math.floor(c / level.w) * s, s, style(c))
    }

    this.drawBeams(v, t)

    // Objects and pieces
    for (let c = 0; c < level.tiles.length; c++) {
      const tile = tileAt(level, c)
      const x = ox + (c % level.w) * s
      const y = oy + Math.floor(c / level.w) * s
      if (tile.t !== 'wall' && tile.t !== 'glass' && tile.t !== 'empty') drawTile(ctx, tile, x, y, s, style(c))
      const placed = v.placed.get(c)
      if (placed) this.drawPlaced(placed, c, x, y, s, t)
    }

    if (v.ghost && !pieceAt(level, v.placed, v.ghost.cell)) {
      const g = v.ghost
      ctx.save()
      ctx.globalAlpha = g.hint && !this.reducedMotion ? 0.45 + 0.3 * Math.sin(t / 220) : 0.5
      drawPiece(ctx, g.piece, ox + (g.cell % level.w) * s + s / 2, oy + Math.floor(g.cell / level.w) * s + s / 2, s)
      ctx.restore()
      if (g.hint) this.drawCellOutline(g.cell, THEME.sodium, [s * 0.1, s * 0.07])
    }

    if (v.showCursor && v.cursor !== null && v.cursor >= 0) this.drawCellOutline(v.cursor, THEME.sodium, [])

    if (v.solved && !this.reducedMotion) {
      const k = (t - this.winAt) / 1200
      if (k < 1) {
        // One sweep of light across the plate when the level is solved.
        const sx = ox - W * 0.3 + k * W * 1.6
        const g = ctx.createLinearGradient(sx - s * 2, 0, sx + s * 2, 0)
        g.addColorStop(0, 'rgba(255,255,255,0)')
        g.addColorStop(0.5, 'rgba(255,255,255,0.16)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(ox, oy, W, H)
      }
    }
  }

  private drawCellOutline(cell: number, color: string, dash: number[]): void {
    const v = this.view
    if (!v) return
    const { cell: s, ox, oy } = this.layout
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, s * 0.05)
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.roundRect(ox + (cell % v.level.w) * s + 3, oy + Math.floor(cell / v.level.w) * s + 3, s - 6, s - 6, s * 0.14)
    ctx.stroke()
    ctx.restore()
  }

  private drawPlaced(piece: Piece, cell: number, x: number, y: number, s: number, t: number): void {
    const a = this.anims.get(cell)
    const ctx = this.ctx
    let scale = 1
    let angle: number | undefined
    if (a) {
      if (a.kind === 'place') {
        const k = Math.min(1, (t - a.t0) / PLACE_MS)
        scale = 0.55 + 0.45 * easeOut(k)
        if (k >= 1) this.anims.delete(cell)
      } else {
        const k = Math.min(1, (t - a.t0) / ROTATE_MS)
        const to = orientAngle(piece.orient)
        let from = a.from ?? to
        // Always turn a quarter clockwise.
        if (from > to) from -= Math.PI
        angle = from + (to - from) * easeOut(k)
        if (k >= 1) this.anims.delete(cell)
      }
    }
    ctx.save()
    ctx.translate(x + s / 2, y + s / 2)
    ctx.scale(scale, scale)
    drawPiece(ctx, piece, 0, 0, s, angle)
    ctx.restore()
  }

  private drawBeams(v: BoardView, t: number): void {
    const ctx = this.ctx
    const { level, trace } = v
    const { cell: s, ox, oy } = this.layout
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    const passes = [
      { w: s * 0.42, a: 0.07 },
      { w: s * 0.2, a: 0.22 },
      { w: s * 0.075, a: 0.95 },
    ]
    for (const ch of [1, 2, 4]) {
      const rgb = CHANNEL_RGB[ch]
      if (!rgb) continue
      for (const pass of passes) {
        ctx.strokeStyle = rgba(rgb, pass.a)
        ctx.lineWidth = pass.w
        ctx.beginPath()
        for (let c = 0; c < level.tiles.length; c++) {
          const cx = ox + (c % level.w) * s + s / 2
          const cy = oy + Math.floor(c / level.w) * s + s / 2
          for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
            if (!(halfSegment(trace, c, d) & ch)) continue
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + (DX[d] * s) / 2, cy + (DY[d] * s) / 2)
          }
        }
        ctx.stroke()
      }
    }

    // Photons drifting in the direction of travel, plus colour-blind glyphs.
    const motion = !this.reducedMotion
    const phase = motion ? (t / 900) % 1 : 0.5
    for (let c = 0; c < level.tiles.length; c++) {
      const cx = ox + (c % level.w) * s + s / 2
      const cy = oy + Math.floor(c / level.w) * s + s / 2
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const outMask = trace.out[c * 4 + d] ?? 0
        const innMask = trace.inn[c * 4 + d] ?? 0
        if (motion) {
          // Outgoing half runs centre -> edge, incoming half edge -> centre.
          if (outMask) this.photon(cx + (DX[d] * s * phase) / 2, cy + (DY[d] * s * phase) / 2, outMask, s)
          if (innMask) this.photon(cx + (DX[d] * s * (1 - phase)) / 2, cy + (DY[d] * s * (1 - phase)) / 2, innMask, s)
        }
        if (v.colorblind && (d === 1 || d === 2)) {
          // One glyph set per cell edge, offset sideways so channels never overlap.
          const mask = halfSegment(trace, c, d)
          if (!mask) continue
          ctx.save()
          ctx.globalCompositeOperation = 'source-over'
          const ex = cx + (DX[d] * s) / 2
          const ey = cy + (DY[d] * s) / 2
          const chans = [1, 2, 4].filter((k) => mask & k)
          chans.forEach((k, i) => {
            const off = (i - (chans.length - 1) / 2) * s * 0.17
            const gx = d === 1 ? ex : ex + off
            const gy = d === 1 ? ey + off : ey
            drawGlyph(ctx, k, gx, gy, s * 0.07, THEME.ink)
            drawGlyph(ctx, k, gx, gy, s * 0.05, THEME.chalk)
          })
          ctx.restore()
        }
      }
    }
    ctx.restore()
  }

  private photon(x: number, y: number, mask: number, s: number): void {
    const ctx = this.ctx
    for (const ch of [1, 2, 4]) {
      if (!(mask & ch)) continue
      const rgb = CHANNEL_RGB[ch]
      if (!rgb) continue
      ctx.fillStyle = rgba(rgb, 0.8)
      ctx.beginPath()
      ctx.arc(x, y, s * 0.055, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
