/** Progress and settings persisted in localStorage. Everything read back is validated. */
export interface Progress {
  /** Fewest pieces used per solved level id. */
  readonly best: Readonly<Record<string, number>>
  readonly seenTutorials: readonly string[]
  readonly muted: boolean
  readonly colorblind: boolean
  /** Editor draft as a share code. */
  readonly draft: string | null
}

const KEY = 'lumen:v1'

export const DEFAULT_PROGRESS: Progress = { best: {}, seenTutorials: [], muted: false, colorblind: false, draft: null }

export function sanitize(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PROGRESS
  const r = raw as Record<string, unknown>
  const best: Record<string, number> = {}
  if (typeof r.best === 'object' && r.best !== null) {
    for (const [k, v] of Object.entries(r.best)) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100 && k.length < 16) best[k] = v
    }
  }
  return {
    best,
    seenTutorials: Array.isArray(r.seenTutorials) ? r.seenTutorials.filter((x): x is string => typeof x === 'string') : [],
    muted: r.muted === true,
    colorblind: r.colorblind === true,
    draft: typeof r.draft === 'string' && r.draft.length < 2048 ? r.draft : null,
  }
}

/**
 * Applies a change on top of what is stored now. Progress only ever improves: `best` keeps
 * the lower piece count per level and tutorials stay seen, so two open tabs never undo each
 * other's progress. Settings and the draft are last-write-wins.
 */
export function mergeProgress(stored: Progress, patch: Partial<Progress>): Progress {
  const best: Record<string, number> = { ...stored.best }
  for (const [id, n] of Object.entries(patch.best ?? {})) best[id] = Math.min(n, best[id] ?? n)
  return {
    ...stored,
    ...patch,
    best,
    seenTutorials: [...new Set([...stored.seenTutorials, ...(patch.seenTutorials ?? [])])],
  }
}

function readStored(): Progress {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return DEFAULT_PROGRESS
  }
}

let cache: Progress | null = null

// Another tab wrote progress: forget the cached copy.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) cache = null
  })
}

export function loadProgress(): Progress {
  cache ??= readStored()
  return cache
}

export function saveProgress(patch: Partial<Progress>): Progress {
  // Re-read storage so a stale cache never overwrites another tab's progress.
  cache = mergeProgress(readStored(), patch)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Private mode or full storage: progress just lasts for this session.
  }
  return cache
}

export function recordSolve(id: string, used: number): void {
  saveProgress({ best: { [id]: used } })
}

export function markTutorialSeen(id: string): void {
  saveProgress({ seenTutorials: [id] })
}
