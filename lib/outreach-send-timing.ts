// lib/outreach-send-timing.ts — where a Send's time goes, step by step. OFF BY DEFAULT.
//
// Set OUTREACH_SEND_TIMING=1 (e.g. in .env.local) and every send logs one line, `[send-timing] {…}`,
// with the milliseconds each step took, and the JSON answer carries the same object as `timing`.
// Unset, it does nothing and adds nothing to the answer. docs/outreach-instant-send-report.md §1.
export interface SendTimer { mark(step: string): void; read(): Record<string, number> | null; log(extra?: string): void }

export function sendTimer(on: boolean = process.env.OUTREACH_SEND_TIMING === '1'): SendTimer {
  if (!on) return { mark() {}, read: () => null, log() {} }
  const t0 = performance.now()
  let last = t0
  const steps: Record<string, number> = {}
  return {
    mark(step) { const now = performance.now(); steps[step] = (steps[step] ?? 0) + Math.round(now - last); last = now },
    read() { return { ...steps, total: Math.round(performance.now() - t0) } },
    log(extra) { console.info(`[send-timing]${extra ? ` ${extra}` : ''}`, JSON.stringify(this.read())) },
  }
}
