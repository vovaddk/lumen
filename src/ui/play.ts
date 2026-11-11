import { sfx } from '../audio/sound.ts'
import { colorName } from '../engine/color.ts'
import { canPlace, place, remaining, removeAt, rotateAt } from '../engine/game.ts'
import { cellName, isBuildable, tileAt } from '../engine/grid.ts'
import { canRedo, canUndo, createHistory, push, redo, undo, type History } from '../engine/history.ts'
import { isRotatable, makePiece, pieceLabel, samePiece, stockKey } from '../engine/pieces.ts'
import { evaluate, starsFor, type Evaluation } from '../engine/rules.ts'
import type { SolveResult } from '../engine/solver.ts'
import type { Level, Piece, Placement, Placements } from '../engine/types.ts'
import { BoardInput } from '../input/board-input.ts'
import { BoardRenderer } from '../render/board.ts'
import { maskCss } from '../render/theme.ts'
import { describeCell, describePiece } from './describe.ts'
import { announce, clear, h, isTyping } from './dom.ts'
import { pieceIcon, stars, swatch } from './icons.ts'
import { solveAsync } from './solve-async.ts'
import { loadProgress, markTutorialSeen, recordSolve } from './storage.ts'

export interface PlayOptions {
  readonly level: Level
  /** Shown above the level name, e.g. "Chapter 1, level 3". */
  readonly caption: string
  /**
   * Minimum pieces. Shipped levels carry it; for custom levels pass `'pending'` and call
   * `setPar` once the background solver answers (`undefined` means unknown).
   */
  readonly par: number | undefined | 'pending'
  /** Solver node budget for hints. */
  readonly solveBudget: number
  readonly campaign: boolean
  readonly colorblind: () => boolean
  readonly onNext?: () => void
  readonly onEdit?: () => void
  readonly editLabel?: string
}

export interface Screen {
  readonly unmount: () => void
  readonly refresh: () => void
}

export interface PlayScreen extends Screen {
  readonly setPar: (par: number | undefined) => void
}

export function mountPlay(root: HTMLElement, opts: PlayOptions): PlayScreen {
  const { level } = opts
  let history: History<Placements> = createHistory(new Map())
  let ev: Evaluation = evaluate(level, history.present)
  let selected = level.inventory[0] ? stockKey(level.inventory[0]) : ''
  let lastOrient: 0 | 1 = 0
  let cursor = Math.max(0, level.tiles.findIndex((t) => t.t === 'emitter'))
  let showCursor = false
  let hover = -1
  let hint: Placement | null = null
  let wasSolved = false
  let par = opts.par === 'pending' ? undefined : opts.par
  let alive = true
  let thinking = false

  // ----- DOM -------------------------------------------------------------------------
  const canvas = h('canvas', {
    class: 'board',
    tabindex: '0',
    role: 'application',
    'aria-roledescription': 'puzzle board',
    'aria-label': `${level.name}. ${level.w} by ${level.h} board. Arrow keys move, Space places or turns, Delete removes, number keys pick a piece.`,
  })
  const stage = h('div', { class: 'stage' }, canvas)
  const trayList = h('ul', { class: 'tray', role: 'list' })
  const targetList = h('ul', { class: 'targets', role: 'list' })
  const btn = (label: string, key: string, onclick: () => void, extra: Record<string, unknown> = {}) =>
    h('button', { class: 'tool', type: 'button', onclick, 'aria-keyshortcuts': key, ...extra }, label, h('kbd', { 'aria-hidden': 'true' }, key))
  const undoBtn = btn('Undo', 'Z', () => {
    doUndo()
  })
  const redoBtn = btn('Redo', 'Y', () => {
    doRedo()
  })
  const resetBtn = btn('Reset', 'Shift+R', () => {
    doReset()
  })
  const hintBtn = btn('Hint', 'H', () => {
    void doHint()
  })
  const message = h('p', { class: 'message', role: 'status' })
  const result = h('div', { class: 'result', hidden: true })

  const parLabel = (): string =>
    opts.par === 'pending' && par === undefined && !parSettled
      ? 'Working out par…'
      : par === undefined
        ? 'Par unknown'
        : `Par ${par} ${par === 1 ? 'piece' : 'pieces'}`
  let parSettled = opts.par !== 'pending'
  const parEl = h('span', {}, parLabel())
  const best = loadProgress().best[level.id]
  const panel = h(
    'aside',
    { class: 'panel', 'aria-label': 'Level controls' },
    h(
      'header',
      { class: 'level-head' },
      h('p', { class: 'caption' }, opts.caption),
      h('h1', { class: 'level-name' }, level.name),
      h('p', { class: 'par' }, parEl, opts.campaign && best !== undefined ? h('span', { class: 'best' }, ` Best ${best}`) : null),
    ),
    h('section', { 'aria-label': 'Pieces' }, h('h2', { class: 'sub' }, 'Pieces'), trayList),
    h('section', { 'aria-label': 'Targets' }, h('h2', { class: 'sub' }, 'Targets'), targetList),
    h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Board actions' }, undoBtn, redoBtn, resetBtn, hintBtn),
    message,
    result,
  )
  const screen = h('div', { class: 'play' }, stage, panel)
  clear(root, screen)

  const renderer = new BoardRenderer(canvas)
  const input = new BoardInput(canvas, () => ({ w: level.w, h: level.h, cellAt: (x, y) => renderer.cellAt(x, y) }), {
    activate,
    remove: removePiece,
    rotate: rotatePiece,
    hover: (cell) => {
      if (cell !== hover) {
        hover = cell
        draw()
      }
    },
    cursor: (cell, visible) => {
      const moved = cell !== cursor
      cursor = cell
      showCursor = visible
      if (moved && visible) announce(describeCell(level, history.present, ev.trace.lit, cell))
      draw()
    },
  })
  input.setCursor(cursor, false)
  renderer.start()

  // ----- Rendering -------------------------------------------------------------------
  function ghost(): { cell: number; piece: Piece; hint: boolean } | null {
    if (hint) return { ...hint, hint: true }
    if (hover < 0 || history.present.has(hover) || !isBuildable(level, hover)) return null
    const piece = pieceFor(selected)
    return piece && canPlace(level, history.present, hover, piece) ? { cell: hover, piece, hint: false } : null
  }

  function draw(): void {
    renderer.setView({
      level,
      placed: history.present,
      trace: ev.trace,
      targets: ev.targets,
      cursor,
      showCursor,
      ghost: ghost(),
      solved: ev.solved,
      colorblind: opts.colorblind(),
    })
  }

  function renderPanel(): void {
    const left = remaining(level, history.present)
    clear(
      trayList,
      ...level.inventory.map((s, i) => {
        const key = stockKey(s)
        const n = left.get(key) ?? 0
        const piece = makePiece(s.kind, lastOrient, s.color)
        return h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: `stock${key === selected ? ' selected' : ''}`,
              'aria-pressed': String(key === selected),
              'aria-keyshortcuts': String(i + 1),
              disabled: n === 0 && key !== selected,
              onclick: () => {
                select(key)
              },
            },
            pieceIcon(piece, 34),
            h('span', { class: 'stock-name' }, capital(pieceLabel(s))),
            h('span', { class: 'stock-count', 'aria-label': `${n} left` }, `${n}`),
            h('kbd', { 'aria-hidden': 'true' }, String(i + 1)),
          ),
        )
      }),
    )

    clear(
      targetList,
      ...ev.targets.map((t) =>
        h(
          'li',
          { class: t.ok ? 'ok' : 'pending' },
          t.sensor ? h('span', { class: 'sensor-mark', 'aria-hidden': 'true' }, '×') : swatch(maskCss(t.need)),
          h(
            'span',
            {},
            t.sensor
              ? `${cellName(level.w, t.cell)} stays dark`
              : `${cellName(level.w, t.cell)} needs ${colorName(t.need)}`,
          ),
          h(
            'span',
            { class: 'got' },
            t.ok ? 'Done' : t.sensor ? `Lit ${colorName(t.got)}` : t.got ? `Gets ${colorName(t.got)}` : 'Dark',
          ),
        ),
      ),
    )

    undoBtn.disabled = !canUndo(history)
    redoBtn.disabled = !canRedo(history)
    resetBtn.disabled = history.present.size === 0
    hintBtn.disabled = ev.solved || thinking

    result.hidden = !ev.solved
    if (ev.solved) {
      const used = history.present.size
      const n = starsFor(used, par)
      const actions: HTMLElement[] = []
      if (opts.onNext) actions.push(h('button', { type: 'button', class: 'primary', onclick: opts.onNext }, 'Next level'))
      if (opts.onEdit) actions.push(h('button', { type: 'button', class: 'primary', onclick: opts.onEdit }, opts.editLabel ?? 'Edit'))
      clear(
        result,
        h('p', { class: 'result-title' }, 'Solved'),
        stars(n, 22),
        h(
          'p',
          { class: 'result-note' },
          `${used} ${used === 1 ? 'piece' : 'pieces'} used.`,
          par !== undefined && used > par ? ` Solve it with ${par} for three stars.` : '',
        ),
        h('div', { class: 'result-actions' }, ...actions),
      )
    }
  }

  function update(): void {
    ev = evaluate(level, history.present)
    if (hint && !isBuildable(level, hint.cell)) hint = null
    if (ev.solved && !wasSolved) {
      sfx.solved()
      if (opts.campaign) recordSolve(level.id, history.present.size)
      announce(`Solved with ${history.present.size} pieces. ${starsFor(history.present.size, par)} stars.`)
    }
    wasSolved = ev.solved
    renderPanel()
    draw()
  }

  // ----- Actions ---------------------------------------------------------------------
  function pieceFor(key: string): Piece | undefined {
    const s = level.inventory.find((x) => stockKey(x) === key)
    return s ? makePiece(s.kind, lastOrient, s.color) : undefined
  }

  function select(key: string): void {
    selected = key
    const s = level.inventory.find((x) => stockKey(x) === key)
    if (s) announce(`${capital(pieceLabel(s))} selected`)
    renderPanel()
    draw()
  }

  function commit(next: Placements, sound: () => void): void {
    if (next === history.present) return
    const before = ev
    history = push(history, next)
    sound()
    update()
    newlyLit(before)
  }

  function newlyLit(before: Evaluation): void {
    for (const t of ev.targets) {
      const old = before.targets.find((x) => x.cell === t.cell)
      if (!t.sensor && t.ok && !old?.ok) sfx.lit(t.need)
    }
    const done = ev.targets.filter((t) => t.ok).length
    if (!ev.solved) {
      const bad = ev.targets.find((t) => !t.ok && t.got)
      const tip = bad ? ` ${bad.sensor ? `Sensor ${cellName(level.w, bad.cell)} is lit.` : `${cellName(level.w, bad.cell)} gets ${colorName(bad.got)}.`}` : ''
      message.textContent = `${done} of ${ev.targets.length} targets satisfied.${tip}`
    } else {
      message.textContent = ''
    }
  }

  function activate(cell: number): void {
    const existing = history.present.get(cell)
    if (existing) {
      if (isRotatable(existing.kind)) rotatePiece(cell)
      else removePiece(cell)
      return
    }
    if (!isBuildable(level, cell)) {
      sfx.deny()
      announce(`${describeCell(level, history.present, ev.trace.lit, cell)}. Nothing can be placed here.`)
      return
    }
    const left = remaining(level, history.present)
    let key = selected
    if (hint?.cell === cell) key = stockKey(hint.piece)
    if ((left.get(key) ?? 0) <= 0) {
      const other = level.inventory.find((s) => (left.get(stockKey(s)) ?? 0) > 0)
      if (!other) {
        sfx.deny()
        message.textContent = 'The tray is empty. Remove a piece to move it.'
        announce(message.textContent)
        return
      }
      key = stockKey(other)
      selected = key
    }
    let piece = pieceFor(key)
    if (!piece) return
    if (hint?.cell === cell && stockKey(hint.piece) === key) {
      piece = hint.piece
      hint = null
    }
    commit(place(level, history.present, cell, piece), sfx.place)
    announce(`${capital(describePiece(piece))} placed at ${cellName(level.w, cell)}. ${message.textContent}`)
  }

  function rotatePiece(cell: number): void {
    const p = history.present.get(cell)
    if (!p || !isRotatable(p.kind)) {
      if (tileAt(level, cell).t === 'fixed') sfx.deny()
      return
    }
    const next = rotateAt(history.present, cell)
    lastOrient = next.get(cell)?.orient ?? lastOrient
    commit(next, sfx.rotate)
    const turned = next.get(cell)
    if (turned) announce(`${capital(describePiece(turned))} at ${cellName(level.w, cell)}. ${message.textContent}`)
  }

  function removePiece(cell: number): void {
    const p = history.present.get(cell)
    if (!p) return
    commit(removeAt(history.present, cell), sfx.remove)
    selected = stockKey(p)
    renderPanel()
    announce(`${capital(pieceLabel(p))} removed from ${cellName(level.w, cell)}. ${message.textContent}`)
  }

  function doUndo(): void {
    if (!canUndo(history)) return
    history = undo(history)
    sfx.rotate()
    update()
    announce('Undone')
  }

  function doRedo(): void {
    if (!canRedo(history)) return
    history = redo(history)
    sfx.rotate()
    update()
    announce('Redone')
  }

  function doReset(): void {
    if (history.present.size === 0) return
    history = push(history, new Map())
    hint = null
    sfx.remove()
    message.textContent = 'Board cleared. Undo brings your pieces back.'
    update()
    announce(message.textContent)
  }

  async function doHint(): Promise<void> {
    if (ev.solved || thinking) return
    thinking = true
    message.textContent = 'Looking for a hint…'
    renderPanel()
    const asked = history.present
    // Prefer a hint that keeps the player's pieces; fall back to a fresh solution.
    const empty = asked.size === 0
    const kept = empty
      ? await solutionFor(level, opts.solveBudget)
      : await solveAsync(level, Math.min(opts.solveBudget, 60_000), asked)
    let fresh: SolveResult | null = null
    if (kept.status !== 'solved' && !empty) fresh = await solutionFor(level, opts.solveBudget)
    thinking = false
    // The board changed or the screen closed while the worker was busy: drop the answer.
    if (!alive) return
    if (history.present !== asked) {
      message.textContent = ''
      renderPanel()
      return
    }
    let pick: Placement | undefined
    let note = ''
    if (kept.status === 'solved') {
      pick = kept.solution[0]
    } else {
      if (fresh?.status === 'solved') {
        pick = fresh.solution.find((s) => {
          const cur = history.present.get(s.cell)
          return !cur || !samePiece(cur, s.piece)
        })
        if (pick && history.present.has(pick.cell)) note = ` Clear ${cellName(level.w, pick.cell)} first.`
        else note = ' Some of your pieces will need to move.'
      }
    }
    if (!pick) {
      message.textContent = 'No hint available for this board.'
      announce(message.textContent)
      renderPanel()
      return
    }
    hint = pick
    selected = stockKey(pick.piece)
    message.textContent = `Hint: a ${describePiece(pick.piece)} at ${cellName(level.w, pick.cell)}.${note}`
    announce(message.textContent)
    renderPanel()
    draw()
  }

  // ----- Keyboard shortcuts ----------------------------------------------------------
  const onKey = (e: KeyboardEvent): void => {
    if (isTyping(e) || document.querySelector('.overlay')) return
    const k = e.key.toLowerCase()
    const mod = e.ctrlKey || e.metaKey
    if ((mod && k === 'z' && !e.shiftKey) || (!mod && k === 'z')) {
      e.preventDefault()
      doUndo()
    } else if ((mod && (k === 'y' || (k === 'z' && e.shiftKey))) || (!mod && k === 'y')) {
      e.preventDefault()
      doRedo()
    } else if (!mod && k === 'h') {
      void doHint()
    } else if (!mod && e.shiftKey && k === 'r') {
      doReset()
    } else if (!mod && /^[1-9]$/.test(e.key)) {
      const s = level.inventory[Number(e.key) - 1]
      if (s) select(stockKey(s))
    } else if (!mod && k === 'n' && ev.solved && opts.onNext) {
      opts.onNext()
    } else if (k === 'escape' && hint) {
      hint = null
      message.textContent = ''
      draw()
    }
  }
  document.addEventListener('keydown', onKey)

  // ----- Tutorial --------------------------------------------------------------------
  function showTutorial(): void {
    if (!level.tutorial || !opts.campaign || loadProgress().seenTutorials.includes(level.id)) {
      canvas.focus({ preventScroll: true })
      return
    }
    const close = (): void => {
      markTutorialSeen(level.id)
      card.remove()
      canvas.focus({ preventScroll: true })
    }
    const ok = h('button', { type: 'button', class: 'primary', onclick: close }, 'Got it')
    const card = h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tut-title' },
      h('div', { class: 'overlay-card' }, h('h2', { id: 'tut-title' }, level.name), h('p', {}, level.tutorial), ok),
    )
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        if (e.key === 'Escape') close()
      }
    })
    stage.append(card)
    ok.focus()
  }

  update()
  showTutorial()

  return {
    setPar: (value) => {
      par = value
      parSettled = true
      parEl.textContent = parLabel()
      renderPanel()
    },
    unmount: () => {
      alive = false
      document.removeEventListener('keydown', onKey)
      input.destroy()
      renderer.destroy()
    },
    refresh: () => {
      renderPanel()
      draw()
    },
  }
}

const solutions = new Map<Level, Promise<SolveResult>>()
/** The from-scratch solution never changes, so hints compute it once per level. */
function solutionFor(level: Level, budget: number): Promise<SolveResult> {
  let r = solutions.get(level)
  if (!r) {
    r = solveAsync(level, budget)
    solutions.set(level, r)
  }
  return r
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
