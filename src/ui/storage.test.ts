import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROGRESS, loadProgress, mergeProgress, recordSolve, sanitize, saveProgress } from './storage.ts'

describe('progress merge', () => {
  it('keeps the better score per level and unions tutorials', () => {
    const stored = { ...DEFAULT_PROGRESS, best: { '1-1': 1, '1-2': 4 }, seenTutorials: ['1-1'] }
    const merged = mergeProgress(stored, { best: { '1-2': 2, '2-1': 3 }, seenTutorials: ['2-1', '1-1'] })
    expect(merged.best).toEqual({ '1-1': 1, '1-2': 2, '2-1': 3 })
    expect(merged.seenTutorials).toEqual(['1-1', '2-1'])
  })

  it('never lets a worse score replace a better one', () => {
    const merged = mergeProgress({ ...DEFAULT_PROGRESS, best: { '1-3': 2 } }, { best: { '1-3': 5 } })
    expect(merged.best['1-3']).toBe(2)
  })

  it('treats settings and the draft as last-write-wins', () => {
    const merged = mergeProgress({ ...DEFAULT_PROGRESS, muted: true, draft: 'a' }, { muted: false, draft: 'b' })
    expect(merged).toMatchObject({ muted: false, draft: 'b' })
  })

  it('sanitizes junk read back from storage', () => {
    expect(sanitize({ best: { '1-1': 'x', '1-2': 2.5, '1-3': 3 }, seenTutorials: [1, '1-1'], muted: 'yes' })).toEqual({
      ...DEFAULT_PROGRESS,
      best: { '1-3': 3 },
      seenTutorials: ['1-1'],
    })
  })
})

describe('saving with two tabs open', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not overwrite progress another tab saved after this one loaded', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    loadProgress() // this tab caches progress now
    // The other tab solves 2-1 and writes straight to storage.
    store.set('lumen:v1', JSON.stringify({ best: { '2-1': 3 }, seenTutorials: ['2-1'] }))
    recordSolve('1-1', 1)
    saveProgress({ muted: true })
    const saved = sanitize(JSON.parse(store.get('lumen:v1') ?? 'null'))
    expect(saved.best).toEqual({ '1-1': 1, '2-1': 3 })
    expect(saved.seenTutorials).toEqual(['2-1'])
    expect(saved.muted).toBe(true)
  })
})
