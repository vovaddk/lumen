/**
 * Synthesised sound effects (WebAudio oscillators only, no audio files).
 * The context is created lazily on the first user gesture, as browsers require.
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

export function setMuted(value: boolean): void {
  muted = value
  if (master) master.gain.value = muted ? 0 : 0.5
}

export const isMuted = (): boolean => muted

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return master ? { ctx, out: master } : null
}

interface Tone {
  freq: number
  to?: number
  dur: number
  type?: OscillatorType
  gain?: number
  delay?: number
}

function tone({ freq, to, dur, type = 'sine', gain = 0.2, delay = 0 }: Tone): void {
  const a = audio()
  if (!a) return
  const t0 = a.ctx.currentTime + delay
  const osc = a.ctx.createOscillator()
  const env = a.ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(env).connect(a.out)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Each light channel has its own pitch so mixed colours sound like chords. */
const CHANNEL_HZ: Readonly<Record<number, number>> = { 1: 523.25, 2: 659.25, 4: 783.99 }

export const sfx = {
  place: (): void => {
    tone({ freq: 340, to: 520, dur: 0.09, type: 'triangle', gain: 0.16 })
  },
  rotate: (): void => {
    tone({ freq: 620, to: 700, dur: 0.05, type: 'square', gain: 0.04 })
  },
  remove: (): void => {
    tone({ freq: 420, to: 220, dur: 0.1, type: 'triangle', gain: 0.13 })
  },
  deny: (): void => {
    tone({ freq: 150, to: 110, dur: 0.12, type: 'sawtooth', gain: 0.05 })
  },
  lit: (mask: number): void => {
    let i = 0
    for (const ch of [1, 2, 4]) {
      if (mask & ch) tone({ freq: CHANNEL_HZ[ch] ?? 440, dur: 0.5, gain: 0.08, delay: 0.03 * i++ })
    }
  },
  solved: (): void => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ freq: f, dur: 0.7, type: 'sine', gain: 0.1, delay: i * 0.09 })
      tone({ freq: f * 2, dur: 0.35, type: 'triangle', gain: 0.025, delay: i * 0.09 })
    })
  },
}
