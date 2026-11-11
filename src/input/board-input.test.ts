import { describe, expect, it } from 'vitest'
import { keyIntent } from './board-input.ts'

const key = (k: string, mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
  keyIntent({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods })

describe('board keyboard intents', () => {
  it('maps arrows, Space, Enter, Delete and R', () => {
    expect(key('ArrowLeft')).toEqual({ type: 'move', dx: -1, dy: 0 })
    expect(key('ArrowDown')).toEqual({ type: 'move', dx: 0, dy: 1 })
    expect(key(' ')).toEqual({ type: 'activate' })
    expect(key('Enter')).toEqual({ type: 'activate' })
    expect(key('Backspace')).toEqual({ type: 'remove' })
    expect(key('r')).toEqual({ type: 'rotate' })
  })

  it('leaves Shift+R to the reset shortcut instead of rotating', () => {
    // With Shift held the browser reports an upper-case key.
    expect(key('R', { shiftKey: true })).toBeNull()
  })

  it('leaves modified keys to screen shortcuts', () => {
    expect(key('z', { ctrlKey: true })).toBeNull()
    expect(key('r', { metaKey: true })).toBeNull()
    expect(key(' ', { altKey: true })).toBeNull()
    expect(key('h')).toBeNull()
  })
})
