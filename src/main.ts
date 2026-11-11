import '@fontsource-variable/unbounded'
import '@fontsource-variable/atkinson-hyperlegible-next'
import './styles.css'
import { isMuted, setMuted } from './audio/sound.ts'
import { CodecError, decodeLevel } from './engine/codec.ts'
import { SOLVE_BUDGET } from './engine/solver.ts'
import type { Level } from './engine/types.ts'
import { CHAPTERS, levelById, nextLevel } from './levels/index.ts'
import { clear, h } from './ui/dom.ts'
import { mountEditor, saveDraft } from './ui/editor.ts'
import { mountMenu } from './ui/menu.ts'
import { mountPlay, type Screen } from './ui/play.ts'
import { solveAsync } from './ui/solve-async.ts'
import { loadProgress, saveProgress } from './ui/storage.ts'

const root = document.getElementById('screen')
const toggles = document.getElementById('toggles')
if (!root || !toggles) throw new Error('App shell is missing')

setMuted(loadProgress().muted)
let current: Screen | null = null
const colorblind = (): boolean => loadProgress().colorblind

const shareUrl = (code: string): string => `${location.origin}${import.meta.env.BASE_URL}#/l/${code}`


function renderToggles(): void {
  const p = loadProgress()
  const toggle = (label: string, pressed: boolean, onclick: () => void) =>
    h('button', { type: 'button', class: 'toggle', 'aria-pressed': String(pressed), onclick }, h('span', { class: 'dot', 'aria-hidden': 'true' }), label)
  clear(
    toggles as HTMLElement,
    toggle('Sound', !p.muted, () => {
      saveProgress({ muted: !isMuted() })
      setMuted(loadProgress().muted)
      renderToggles()
    }),
    toggle('Colour-blind mode', p.colorblind, () => {
      saveProgress({ colorblind: !loadProgress().colorblind })
      renderToggles()
      current?.refresh()
    }),
  )
}

function brokenLink(err: unknown): void {
  const reason = err instanceof CodecError ? err.message : 'Unknown error'
  clear(
    root as HTMLElement,
    h(
      'section',
      { class: 'notice' },
      h('h1', {}, 'This level link does not work'),
      h('p', {}, `${reason}. The link may have been cut off when it was copied.`),
      h('p', {}, h('a', { class: 'button primary', href: '#/' }, 'Back to the levels'), ' ', h('a', { class: 'button', href: '#/editor' }, 'Open the editor')),
    ),
  )
}

let routeId = 0

function route(): void {
  routeId++
  current?.unmount()
  current = null
  const hash = location.hash.replace(/^#\/?/, '')
  const [section = '', arg = ''] = hash.split('/')
  const el = root as HTMLElement
  window.scrollTo(0, 0)
  document.body.dataset.screen = section || 'menu'

  if (section === 'play') {
    const level = levelById(arg)
    if (level) {
      const chapter = CHAPTERS.find((c) => c.levels.includes(level))
      const next = nextLevel(level.id)
      document.title = `${level.id} ${level.name} · lumen`
      current = mountPlay(el, {
        level,
        caption: `Chapter ${chapter?.id ?? ''}, ${chapter?.name ?? ''}. Level ${level.id}`,
        par: level.par,
        solveBudget: SOLVE_BUDGET.shipped,
        campaign: true,
        colorblind,
        ...(next ? { onNext: () => (location.hash = `#/play/${next.id}`) } : {}),
      })
      return
    }
  }

  if (section === 'editor') {
    document.title = 'Level editor · lumen'
    current = mountEditor(el, { colorblind, onTest: (code) => (location.hash = `#/test/${code}`), shareUrl })
    return
  }

  if (section === 'test' || section === 'l') {
    let level: Level
    try {
      level = decodeLevel(arg, 'custom')
    } catch (err) {
      brokenLink(err)
      return
    }
    const testing = section === 'test'
    document.title = `${level.name} · lumen`
    const screen = mountPlay(el, {
      level,
      caption: testing ? 'Testing your level' : 'Shared level',
      par: 'pending',
      solveBudget: SOLVE_BUDGET.untrusted,
      campaign: false,
      colorblind,
      editLabel: testing ? 'Back to the editor' : 'Edit a copy',
      onEdit: () => {
        if (!testing) saveDraft(level)
        location.hash = '#/editor'
      },
    })
    current = screen
    // Codes carry no par: untrusted input never sets stars. Work it out after the board is up,
    // in the worker and with a small budget, so a hostile link cannot freeze the page.
    const myRoute = routeId
    void solveAsync(level, SOLVE_BUDGET.untrusted).then((r) => {
      if (myRoute === routeId) screen.setPar(r.status === 'solved' ? r.min : undefined)
    })
    // Always offer the way back, not only after solving.
    el.querySelector('.level-head')?.append(
      h('button', { type: 'button', class: 'link', onclick: () => {
        if (!testing) saveDraft(level)
        location.hash = '#/editor'
      } }, testing ? 'Back to the editor' : 'Edit a copy in the editor'),
    )
    return
  }

  document.title = 'lumen · a light-routing puzzle'
  current = mountMenu(el, colorblind)
}

renderToggles()
window.addEventListener('hashchange', route)
route()
