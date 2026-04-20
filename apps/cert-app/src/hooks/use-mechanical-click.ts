let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return audioCtx
}

// ─── CHANGE THIS to switch sounds ───────────────────────────────────────────
export type ClickSound =
  | 'cherry-mx-blue'   // crisp loud clicky
  | 'cherry-mx-brown'  // softer tactile thud
  | 'typewriter'       // old heavy typewriter
  | 'soft-dome'        // quiet rubber dome
  | 'clack'            // deep satisfying clack
// ────────────────────────────────────────────────────────────────────────────

const ACTIVE_SOUND: ClickSound = 'clack'

function playSound(type: ClickSound) {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    if (type === 'cherry-mx-blue') {
      // Sharp high-pitched click + short thud
      const bufSize = Math.floor(ctx.sampleRate * 0.008)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2)

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const hpf = ctx.createBiquadFilter()
      hpf.type = 'highpass'
      hpf.frequency.value = 2000
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.6, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
      noise.connect(hpf); hpf.connect(g); g.connect(ctx.destination)
      noise.start()

      const osc = ctx.createOscillator()
      osc.frequency.setValueAtTime(240, now)
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.02)
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.2, now)
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
      osc.connect(og); og.connect(ctx.destination)
      osc.start(); osc.stop(now + 0.03)

    } else if (type === 'cherry-mx-brown') {
      // Softer bump, less sharp, more mid-range
      const bufSize = Math.floor(ctx.sampleRate * 0.012)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3)

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const bpf = ctx.createBiquadFilter()
      bpf.type = 'bandpass'
      bpf.frequency.value = 800
      bpf.Q.value = 1.2
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.35, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
      noise.connect(bpf); bpf.connect(g); g.connect(ctx.destination)
      noise.start()

      const osc = ctx.createOscillator()
      osc.frequency.setValueAtTime(130, now)
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.04)
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.15, now)
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
      osc.connect(og); og.connect(ctx.destination)
      osc.start(); osc.stop(now + 0.05)

    } else if (type === 'typewriter') {
      // Heavy metallic clack + loud noise burst
      const bufSize = Math.floor(ctx.sampleRate * 0.02)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15))

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.8, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      noise.connect(g); g.connect(ctx.destination)
      noise.start()

      // Metal ping
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(600, now)
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.06)
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.3, now)
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      osc.connect(og); og.connect(ctx.destination)
      osc.start(); osc.stop(now + 0.08)

    } else if (type === 'soft-dome') {
      // Quiet muted thud, almost silent
      const bufSize = Math.floor(ctx.sampleRate * 0.015)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 4)

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const lpf = ctx.createBiquadFilter()
      lpf.type = 'lowpass'
      lpf.frequency.value = 400
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.2, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
      noise.connect(lpf); lpf.connect(g); g.connect(ctx.destination)
      noise.start()

    } else if (type === 'clack') {
      // Deep satisfying bottom-out clack
      const bufSize = Math.floor(ctx.sampleRate * 0.006)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize)

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const hpf = ctx.createBiquadFilter()
      hpf.type = 'highpass'
      hpf.frequency.value = 3000
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.5, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
      noise.connect(hpf); hpf.connect(g); g.connect(ctx.destination)
      noise.start()

      const osc = ctx.createOscillator()
      osc.frequency.setValueAtTime(80, now)
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.05)
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.4, now)
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
      osc.connect(og); og.connect(ctx.destination)
      osc.start(); osc.stop(now + 0.06)
    }
  } catch {
    // silently fail if Web Audio is unavailable
  }
}

export function playMechanicalClick() {
  playSound(ACTIVE_SOUND)
}
