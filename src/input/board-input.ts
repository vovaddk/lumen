export interface BoardInputHandlers {
  /** Tap, click, Space or Enter on a cell. */
  readonly activate: (cell: number) => void
  /** Right-click, long-press, Delete or Backspace. */
  readonly remove: (cell: number) => void
  /** R key. */
  readonly rotate?: (cell: number) => void
  readonly hover?: (cell: number) => void
  /** Keyboard cursor moved or pointer took over; `visible` says whether to draw the cursor. */
  readonly cursor: (cell: number, visible: boolean) => void
}

export interface BoardGeometry {
  readonly w: number
  readonly h: number
  readonly cellAt: (clientX: number, clientY: number) => number
}

const LONG_PRESS_MS = 450

/**
 * Pointer and keyboard input for a board canvas. Translates raw events into cell-level
 * intents; it knows nothing about game rules.
 */
export class BoardInput {
  private cursorCell = 0
  private pressTimer = 0
  private pressCell = -1
  private longPressed = false
  private lastPointer = -Infinity
  private readonly ac = new AbortController()
  private readonly canvas: HTMLCanvasElement
  private readonly geo: () => BoardGeometry
  private readonly on: BoardInputHandlers

  constructor(canvas: HTMLCanvasElement, geo: () => BoardGeometry, on: BoardInputHandlers) {
    this.canvas = canvas
    this.geo = geo
    this.on = on
    const opts = { signal: this.ac.signal }
    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown(e)
    }, opts)
    canvas.addEventListener('pointerup', (e) => {
      this.pointerUp(e)
    }, opts)
    canvas.addEventListener('pointercancel', () => {
      this.cancelPress()
    }, opts)
    canvas.addEventListener('pointermove', (e) => {
      const cell = this.geo().cellAt(e.clientX, e.clientY)
      if (cell !== this.pressCell) this.cancelPress()
      this.on.hover?.(e.pointerType === 'mouse' ? cell : -1)
    }, opts)
    canvas.addEventListener('pointerleave', () => this.on.hover?.(-1), opts)
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault()
    }, opts)
    canvas.addEventListener('keydown', (e) => {
      this.keyDown(e)
    }, opts)
    // Keyboard users get the cursor as soon as the board takes focus; pointer users do not.
    document.addEventListener('pointerdown', () => {
      this.lastPointer = performance.now()
    }, { ...opts, capture: true })
    canvas.addEventListener('focus', () => {
      if (performance.now() - this.lastPointer > 800) this.on.cursor(this.cursorCell, true)
    }, opts)
    canvas.addEventListener('blur', () => {
      this.on.cursor(this.cursorCell, false)
    }, opts)
  }

  get cursor(): number {
    return this.cursorCell
  }

  setCursor(cell: number, visible: boolean): void {
    this.cursorCell = cell
    this.on.cursor(cell, visible)
  }

  destroy(): void {
    this.cancelPress()
    this.ac.abort()
  }

  private pointerDown(e: PointerEvent): void {
    const cell = this.geo().cellAt(e.clientX, e.clientY)
    if (cell < 0) return
    this.canvas.focus({ preventScroll: true })
    this.cursorCell = cell
    this.on.cursor(cell, false)
    if (e.button === 2) {
      this.on.remove(cell)
      return
    }
    if (e.button !== 0) return
    this.pressCell = cell
    this.longPressed = false
    if (e.pointerType !== 'mouse') {
      this.pressTimer = window.setTimeout(() => {
        this.longPressed = true
        if ('vibrate' in navigator) navigator.vibrate(12)
        this.on.remove(cell)
      }, LONG_PRESS_MS)
    }
  }

  private pointerUp(e: PointerEvent): void {
    const cell = this.geo().cellAt(e.clientX, e.clientY)
    const pressed = this.pressCell
    const long = this.longPressed
    this.cancelPress()
    if (e.button === 0 && !long && cell >= 0 && cell === pressed) this.on.activate(cell)
  }

  private cancelPress(): void {
    window.clearTimeout(this.pressTimer)
    this.pressCell = -1
  }

  private keyDown(e: KeyboardEvent): void {
    const intent = keyIntent(e)
    if (!intent) return
    e.preventDefault()
    const cell = this.cursorCell
    switch (intent.type) {
      case 'move': {
        const { w, h } = this.geo()
        const x = Math.max(0, Math.min(w - 1, (cell % w) + intent.dx))
        const y = Math.max(0, Math.min(h - 1, Math.floor(cell / w) + intent.dy))
        this.setCursor(y * w + x, true)
        return
      }
      case 'activate':
        this.on.cursor(cell, true)
        this.on.activate(cell)
        return
      case 'remove':
        this.on.remove(cell)
        return
      case 'rotate':
        this.on.rotate?.(cell)
        return
    }
  }
}

export type KeyIntent =
  | { readonly type: 'move'; readonly dx: number; readonly dy: number }
  | { readonly type: 'activate' | 'remove' | 'rotate' }

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

/**
 * Board-level meaning of a key press, or null to let it bubble to screen shortcuts.
 * Modified keys always bubble: Ctrl+Z is undo, and Shift+R is reset, not rotate.
 */
export function keyIntent(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): KeyIntent | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const move = MOVES[e.key]
  if (move) return { type: 'move', dx: move[0], dy: move[1] }
  if (e.shiftKey) return null
  if (e.key === ' ' || e.key === 'Enter') return { type: 'activate' }
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'remove' }
  if (e.key === 'r' || e.key === 'R') return { type: 'rotate' } // 'R' alone: Caps Lock
  return null
}
