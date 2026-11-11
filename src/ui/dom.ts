type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown>

/**
 * Tiny element factory. `onclick`-style keys become event listeners, `class` maps to
 * className, `true` booleans become empty attributes and `false`/nullish ones are skipped.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener)
    } else if (key === 'class') {
      el.className = value as string
    } else {
      el.setAttribute(key, value === true ? '' : (value as string))
    }
  }
  append(el, children)
  return el
}

export function append(el: Element, children: readonly Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    el.append(typeof c === 'number' ? String(c) : c)
  }
}

export function clear(el: Element, ...children: Child[]): void {
  el.replaceChildren()
  append(el, children)
}

/** True when a keyboard shortcut should not fire because the user is typing. */
export const isTyping = (e: KeyboardEvent): boolean => {
  const t = e.target
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
}

/** Screen-reader announcements through a shared polite live region. */
export function announce(message: string): void {
  const region = document.getElementById('announcer')
  if (!region) return
  // Clearing first makes repeated identical messages announce again.
  region.textContent = ''
  window.setTimeout(() => {
    region.textContent = message
  }, 30)
}
