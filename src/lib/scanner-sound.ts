/** Pitido corto para feedback en puerta (Web Audio API). */
export function playScannerSound(kind: "success" | "error"): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = kind === "success" ? 920 : 180
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (kind === "success" ? 0.12 : 0.22))
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + (kind === "success" ? 0.15 : 0.25))
    ctx.resume().catch(() => {})
  } catch {
    /* sin audio */
  }
}
