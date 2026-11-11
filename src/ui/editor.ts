import { CodecError, decodeLevel, encodeLevel } from '../engine/codec.ts'
import { COLOR_NAMES } from '../engine/color.ts'
import { tileAt } from '../engine/grid.ts'
import { makePiece, pieceLabel, stockKey } from '../engine/pieces.ts'
import { evaluate } from '../engine/rules.ts'
import { SOLVE_BUDGET } from '../engine/solver.ts'
import type { Dir, Level, Mask, PieceKind, Stock, Tile } from '../engine/types.ts'
import { LIMITS, validateLevel } from '../engine/validate.ts'
import { BoardInput } from '../input/board-input.ts'
import { BoardRenderer } from '../render/board.ts'
import { maskCss } from '../render/theme.ts'
import { sfx } from '../audio/sound.ts'
import { describeCell } from './describe.ts'
import { announce, clear, h } from './dom.ts'
import { pieceIcon, swatch } from './icons.ts'
import { solveAsync } from './solve-async.ts'
import type { Screen } from './play.ts'
import { loadProgress, saveProgress } from './storage.ts'

type ToolId = 'floor' | 'wall' | 'glass' | 'emitter' | 'receiver' | 'sensor' | PieceKind

const TOOLS: readonly { id: ToolId; label: string }[] = [
  { id: 'emitter', label: 'Emitter' },
  { id: 'receiver', label: 'Receiver' },
  { id: 'sensor', label: 'Sensor' },
  { id: 'wall', label: 'Wall' },
  { id: 'glass', label: 'Glass' },
  { id: 'floor', label: 'Erase' },
  { id: 'mirror', label: 'Fixed mirror' },
  { id: 'splitter', label: 'Fixed splitter' },
  { id: 'filter', label: 'Fixed filter' },
  { id: 'prism', label: 'Fixed prism' },
  { id: 'shifter', label: 'Fixed shifter' },
]

/** Every tray entry the editor offers, in display order. */
const STOCKS: readonly { kind: PieceKind; color: Mask }[] = [
  { kind: 'mirror', color: 0 },
  { kind: 'splitter', color: 0 },
  { kind: 'prism', color: 0 },
  { kind: 'shifter', color: 0 },
  ...[1, 2, 4, 3, 5, 6].map((color) => ({ kind: 'filter' as const, color })),
]

const DIRS: readonly { dir: Dir; label: string }[] = [
  { dir: 0, label: 'North' },
  { dir: 1, label: 'East' },
  { dir: 2, label: 'South' },
  { dir: 3, label: 'West' },
]

interface Draft {
  name: string
  w: number
  h: number
  tiles: Tile[]
  stock: Map<string, number>
}

const SAMPLE: Level = {
  id: 'custom',
  name: 'My level',
  w: 7,
  h: 6,
  tiles: Array.from({ length: 42 }, (_, i): Tile =>
    i === 21 ? { t: 'emitter', dir: 1, color: 1 } : i === 5 ? { t: 'receiver', color: 1 } : { t: 'empty' },
  ),
  inventory: [{ kind: 'mirror', color: 0, count: 2 }],
}

function draftFrom(level: Level): Draft {
  return {
    name: level.name,
    w: level.w,
    h: level.h,
    tiles: [...level.tiles],
    stock: new Map(level.inventory.map((s) => [stockKey(s), s.count])),
  }
}

export function draftToLevel(d: Draft): Level {
  const inventory: Stock[] = STOCKS.flatMap((s) => {
    const count = d.stock.get(stockKey(s)) ?? 0
    return count > 0 ? [{ ...s, count }] : []
  })
  return { id: 'custom', name: d.name.trim() || 'Untitled', w: d.w, h: d.h, tiles: d.tiles, inventory }
}

/** Puts a level into the editor draft (used by "Edit a copy" on shared levels). */
export function saveDraft(level: Level): void {
  saveProgress({ draft: encodeLevel(level) })
}

function loadDraft(): Draft {
  const code = loadProgress().draft
  if (code) {
    try {
      return draftFrom(decodeLevel(code, 'custom', { playable: false }))
    } catch {
      // A damaged draft falls back to the sample.
    }
  }
  return draftFrom(SAMPLE)
}

export interface EditorOptions {
  readonly colorblind: () => boolean
  readonly onTest: (code: string) => void
  readonly shareUrl: (code: string) => string
}

export function mountEditor(root: HTMLElement, opts: EditorOptions): Screen {
  const draft = loadDraft()
  let tool: ToolId = 'emitter'
  let color: Mask = 1
  let dir: Dir = 1
  let cursor = 0
  let showCursor = false
  let alive = true

  const canvas = h('canvas', {
    class: 'board',
    tabindex: '0',
    role: 'application',
    'aria-roledescription': 'level editor board',
    'aria-label': 'Level editor board. Arrow keys move, Space applies the selected tool, Delete erases.',
  })
  const stage = h('div', { class: 'stage editor-stage' }, canvas)

  const nameInput = h('input', {
    id: 'ed-name',
    type: 'text',
    maxlength: String(LIMITS.maxName),
    value: draft.name,
    oninput: () => {
      draft.name = nameInput.value
      changed(false)
    },
  })
  const sizeSelect = (label: string, value: number, set: (n: number) => void) => {
    const id = `ed-${label.toLowerCase()}`
    const sel = h(
      'select',
      { id, onchange: () => {
        set(Number(sel.value))
      } },
      ...Array.from({ length: LIMITS.maxSize - LIMITS.minSize + 1 }, (_, i) => {
        const n = i + LIMITS.minSize
        return h('option', { value: String(n), selected: n === value }, String(n))
      }),
    )
    return h('label', { class: 'field small', for: id }, h('span', {}, label), sel)
  }

  const toolBox = h('div', { class: 'tool-grid', role: 'radiogroup', 'aria-label': 'Tool' })
  const colorBox = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Colour' })
  const dirBox = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Emitter direction' })
  const stockBox = h('ul', { class: 'stock-edit', role: 'list' })
  const problems = h('ul', { class: 'problems', 'aria-live': 'polite' })
  const status = h('p', { class: 'message', role: 'status' })
  const shareField = h('input', { type: 'text', readonly: true, class: 'share', 'aria-label': 'Share link', id: 'ed-share' })
  const codeField = h('input', { type: 'text', id: 'ed-code', placeholder: 'Paste a share link or code', spellcheck: 'false' })

  const panel = h(
    'aside',
    { class: 'panel', 'aria-label': 'Editor controls' },
    h('header', { class: 'level-head' }, h('p', { class: 'caption' }, 'Level editor'), h('h1', { class: 'level-name' }, 'Build a level')),
    h('div', { class: 'field' }, h('label', { for: 'ed-name' }, 'Name'), nameInput),
    h(
      'div',
      { class: 'row' },
      sizeSelect('Width', draft.w, (n) => {
        resize(n, draft.h)
      }),
      sizeSelect('Height', draft.h, (n) => {
        resize(draft.w, n)
      }),
    ),
    h('section', {}, h('h2', { class: 'sub' }, 'Tool'), toolBox, h('h2', { class: 'sub' }, 'Colour'), colorBox, h('h2', { class: 'sub' }, 'Direction'), dirBox),
    h('section', {}, h('h2', { class: 'sub' }, 'Player tray'), stockBox),
    problems,
    h(
      'div',
      { class: 'tools' },
      h('button', { type: 'button', class: 'primary', onclick: test }, 'Test play'),
      h('button', { type: 'button', onclick: check }, 'Check with solver'),
      h('button', { type: 'button', onclick: share }, 'Copy share link'),
    ),
    status,
    h('div', { class: 'field' }, h('label', { for: 'ed-share' }, 'Share link'), shareField),
    h(
      'form',
      { class: 'field load', onsubmit: (e: Event) => {
        e.preventDefault()
        loadCode()
      } },
      h('label', { for: 'ed-code' }, 'Open a code'),
      h('div', { class: 'row' }, codeField, h('button', { type: 'submit' }, 'Open')),
    ),
    h('button', { type: 'button', class: 'link', onclick: clearBoard }, 'Clear the board'),
  )
  clear(root, h('div', { class: 'play editor' }, stage, panel))

  const renderer = new BoardRenderer(canvas)
  const input = new BoardInput(canvas, () => ({ w: draft.w, h: draft.h, cellAt: (x, y) => renderer.cellAt(x, y) }), {
    activate: apply,
    remove: (cell) => {
      setTile(cell, { t: 'empty' })
    },
    rotate: (cell) => {
      const t = tileAt(draftToLevel(draft), cell)
      if (t.t === 'emitter') setTile(cell, { ...t, dir: ((t.dir + 1) % 4) as Dir })
      else if (t.t === 'fixed' && (t.piece.kind === 'mirror' || t.piece.kind === 'splitter')) {
        setTile(cell, { t: 'fixed', piece: { ...t.piece, orient: t.piece.orient ? 0 : 1 } })
      }
    },
    cursor: (cell, visible) => {
      cursor = cell
      showCursor = visible
      if (visible) {
        const level = draftToLevel(draft)
        announce(describeCell(level, new Map(), evaluate(level, new Map()).trace.lit, cell))
      }
      draw()
    },
  })
  renderer.start()

  function draw(): void {
    const level = draftToLevel(draft)
    const ev = evaluate(level, new Map())
    renderer.setView({
      level,
      placed: new Map(),
      trace: ev.trace,
      targets: ev.targets,
      cursor,
      showCursor,
      ghost: null,
      solved: false,
      colorblind: opts.colorblind(),
    })
  }

  function renderControls(): void {
    clear(
      toolBox,
      ...TOOLS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(t.id === tool),
            class: `tool-pick${t.id === tool ? ' selected' : ''}`,
            onclick: () => {
              tool = t.id
              if (tool === 'filter' && color === 7) color = 1
              renderControls()
            },
          },
          t.label,
        ),
      ),
    )
    const colorUsed = tool === 'emitter' || tool === 'receiver' || tool === 'filter'
    clear(
      colorBox,
      ...[1, 2, 4, 3, 5, 6, 7].map((m) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(m === color),
            class: `chip${m === color ? ' selected' : ''}`,
            disabled: !colorUsed || (tool === 'filter' && m === 7),
            onclick: () => {
              color = m
              renderControls()
            },
          },
          swatch(maskCss(m)),
          COLOR_NAMES[m] ?? '',
        ),
      ),
    )
    clear(
      dirBox,
      ...DIRS.map((d) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(d.dir === dir),
            class: `chip${d.dir === dir ? ' selected' : ''}`,
            disabled: tool !== 'emitter',
            onclick: () => {
              dir = d.dir
              renderControls()
            },
          },
          d.label,
        ),
      ),
    )
    clear(
      stockBox,
      ...STOCKS.map((s) => {
        const key = stockKey(s)
        const n = draft.stock.get(key) ?? 0
        const stepTo = (v: number): void => {
          draft.stock.set(key, Math.max(0, Math.min(LIMITS.maxStockCount, v)))
          changed(true)
        }
        const name = pieceLabel(s)
        return h(
          'li',
          { class: n > 0 ? 'has' : '' },
          pieceIcon(makePiece(s.kind, 0, s.color), 26),
          h('span', { class: 'stock-name' }, name),
          h('button', { type: 'button', class: 'step', 'aria-label': `One fewer ${name}`, disabled: n === 0, onclick: () => {
            stepTo(n - 1)
          } }, '−'),
          h('output', { 'aria-label': `${name} count` }, String(n)),
          h('button', { type: 'button', class: 'step', 'aria-label': `One more ${name}`, disabled: n >= LIMITS.maxStockCount, onclick: () => {
            stepTo(n + 1)
          } }, '+'),
        )
      }),
    )
    const errs = validateLevel(draftToLevel(draft))
    clear(problems, ...errs.map((e) => h('li', {}, e)))
  }

  function changed(controls: boolean): void {
    saveProgress({ draft: encodeLevel(draftToLevel(draft)) })
    shareField.value = ''
    if (controls) renderControls()
    else clear(problems, ...validateLevel(draftToLevel(draft)).map((e) => h('li', {}, e)))
    draw()
  }

  function setTile(cell: number, tile: Tile): void {
    if (cell < 0 || cell >= draft.tiles.length) return
    draft.tiles[cell] = tile
    sfx.place()
    changed(true)
  }

  function apply(cell: number): void {
    const cur = draft.tiles[cell] ?? { t: 'empty' }
    switch (tool) {
      case 'floor':
        setTile(cell, { t: 'empty' })
        break
      case 'wall':
      case 'glass':
      case 'sensor':
        setTile(cell, { t: tool })
        break
      case 'emitter':
        // Clicking an emitter of the same colour turns it.
        if (cur.t === 'emitter' && cur.color === color) setTile(cell, { ...cur, dir: ((cur.dir + 1) % 4) as Dir })
        else setTile(cell, { t: 'emitter', dir, color })
        break
      case 'receiver':
        setTile(cell, { t: 'receiver', color })
        break
      case 'mirror':
      case 'splitter':
        if (cur.t === 'fixed' && cur.piece.kind === tool) setTile(cell, { t: 'fixed', piece: makePiece(tool, cur.piece.orient ? 0 : 1) })
        else setTile(cell, { t: 'fixed', piece: makePiece(tool, 0) })
        break
      case 'filter':
        setTile(cell, { t: 'fixed', piece: makePiece('filter', 0, color === 7 ? 1 : color) })
        break
      case 'prism':
      case 'shifter':
        setTile(cell, { t: 'fixed', piece: makePiece(tool) })
        break
    }
  }

  function resize(w: number, hh: number): void {
    const tiles: Tile[] = []
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) tiles.push(x < draft.w && y < draft.h ? (draft.tiles[y * draft.w + x] ?? { t: 'empty' }) : { t: 'empty' })
    }
    draft.w = w
    draft.h = hh
    draft.tiles = tiles
    cursor = Math.min(cursor, w * hh - 1)
    changed(true)
  }

  function playable(): Level | null {
    const level = draftToLevel(draft)
    const errs = validateLevel(level)
    if (errs.length) {
      status.textContent = `Fix this first: ${errs[0] ?? ''}`
      announce(status.textContent)
      return null
    }
    return level
  }

  function test(): void {
    const level = playable()
    if (level) opts.onTest(encodeLevel(level))
  }

  function check(): void {
    const level = playable()
    if (!level) return
    status.textContent = 'Solving…'
    void solveAsync(level, SOLVE_BUDGET.editor).then((r) => {
      if (!alive) return
      if (r.status === 'solved') {
        status.textContent =
          r.min === 0
            ? 'This level is already solved before any piece is placed. Move a receiver or an emitter.'
            : `Solvable. The best solution uses ${r.min} ${r.min === 1 ? 'piece' : 'pieces'}, so that is par.`
      } else if (r.status === 'unsolvable') {
        status.textContent = 'Not solvable with this tray. Add pieces or move the receivers.'
      } else {
        status.textContent = `Too many possibilities to check (${r.nodes.toLocaleString()} boards tried). Try a smaller tray.`
      }
      announce(status.textContent)
    })
  }

  function share(): void {
    const level = playable()
    if (!level) return
    const url = opts.shareUrl(encodeLevel(level))
    shareField.value = url
    shareField.select()
    navigator.clipboard.writeText(url).then(
      () => {
        status.textContent = 'Share link copied.'
        announce(status.textContent)
      },
      () => {
        status.textContent = 'Copy the share link from the field below.'
        announce(status.textContent)
      },
    )
  }

  function loadCode(): void {
    const raw = codeField.value.trim()
    const code = raw.includes('#/') ? (raw.split('#/').pop() ?? '').replace(/^(l|test)\//, '') : raw
    try {
      const level = decodeLevel(code, 'custom')
      Object.assign(draft, draftFrom(level))
      nameInput.value = draft.name
      root.querySelectorAll<HTMLSelectElement>('select').forEach((sel) => {
        sel.value = String(sel.id === 'ed-width' ? draft.w : draft.h)
      })
      codeField.value = ''
      status.textContent = `Opened “${level.name}”.`
      changed(true)
    } catch (e) {
      status.textContent = e instanceof CodecError ? `That code does not work: ${e.message}.` : 'That code does not work.'
    }
    announce(status.textContent)
  }

  function clearBoard(): void {
    draft.tiles = draft.tiles.map(() => ({ t: 'empty' }))
    status.textContent = 'Board cleared.'
    changed(true)
  }

  renderControls()
  draw()

  return {
    unmount: () => {
      alive = false
      input.destroy()
      renderer.destroy()
    },
    refresh: draw,
  }
}
