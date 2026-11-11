// Prints solver results for every shipped level: minimum pieces, search size and one solution.
// Run with `npm run levels [id-prefix]` (Node 24 strips the types natively).
import { CHAPTERS } from '../src/levels/index.ts'
import { solve } from '../src/engine/solver.ts'
import { totalInventory } from '../src/engine/game.ts'
import type { Level, Piece, Placement, Tile } from '../src/engine/types.ts'

function pieceGlyph(p: Piece): string {
  if (p.kind === 'mirror') return p.orient ? 'M\\' : 'M/'
  if (p.kind === 'splitter') return p.orient ? 'S\\' : 'S/'
  return `${p.kind.charAt(0).toUpperCase()}${p.color || ''}`
}

function tileGlyph(t: Tile | undefined): string {
  switch (t?.t) {
    case undefined:
      return '?'
    case 'empty':
      return '.'
    case 'wall':
      return '#'
    case 'glass':
      return '~'
    case 'sensor':
      return 'x'
    case 'emitter':
      return `E${t.color}`
    case 'receiver':
      return `R${t.color}`
    case 'fixed':
      return 'F'
  }
}

function show(level: Level, solution: readonly Placement[]): string {
  const at = new Map(solution.map((s) => [s.cell, pieceGlyph(s.piece)]))
  const rows: string[] = []
  for (let y = 0; y < level.h; y++) {
    const row: string[] = []
    for (let x = 0; x < level.w; x++) {
      const c = y * level.w + x
      row.push((at.get(c) ?? tileGlyph(level.tiles[c])).padEnd(3))
    }
    rows.push(`    ${row.join('')}`)
  }
  return rows.join('\n')
}

const only = process.argv[2]
let failed = false
for (const ch of CHAPTERS) {
  for (const level of ch.levels) {
    if (only && !level.id.startsWith(only)) continue
    const t0 = performance.now()
    const r = solve(level, { maxNodes: 2_000_000 })
    const ms = (performance.now() - t0).toFixed(0)
    const min = r.status === 'solved' ? String(r.min) : '-'
    const flag = r.status !== 'solved' ? `  <-- ${r.status}` : r.min !== level.par ? `  <-- par is ${String(level.par)}` : ''
    if (flag) failed = true
    console.log(`${level.id.padEnd(5)} ${level.name.padEnd(22)} min=${min} tray=${totalInventory(level)} nodes=${r.nodes} ${ms}ms${flag}`)
    if (r.status === 'solved' && (only || flag)) console.log(show(level, r.solution))
  }
}
process.exitCode = failed ? 1 : 0
