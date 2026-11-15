// scripts/_disk-guard.cjs — disk-cleanup-1 (15 November 2026, docs/disk-cleanup-1-report.md): THE DISK-SPACE GUARD.
//
// WHY: on 15 November 2026 an Android emulator run hung for three hours because the Mac's disk was 98% full (10 GB free):
// the emulator could not create its data partition and the run waited forever for a device. Builds, emulators and
// screenshot harnesses all write gigabytes; this is the ONE place that decides whether they may start and when they
// must stop. The thresholds are here and nowhere else (the shell helpers call this file).
//
//   START  — refuse to start below 40 GB free (exit 3, nothing written).
//   RUN    — while running, check every 15 s; below 20 GB free, print why, run the registered clean-ups (close the
//            browser, kill the emulator…) and exit 4. A browser launched by Puppeteer / Playwright is killed by the
//            library's own exit handler, so a plain exit is already clean for a screenshot harness.
//
// USE (Node):   require('./_disk-guard.cjs').guard(__filename)            // first line after the header comment
//               const g = require('./_disk-guard.cjs').guard(__filename); g.onStop(() => browser.close())
// USE (shell):  node scripts/_disk-guard.cjs check  [label]               // exit 0 = may start, 3 = refused
//               node scripts/_disk-guard.cjs watch  <pid> [label]         // stops <pid> (SIGTERM) below 20 GB
//               scripts/guarded.sh <command…>                             // both, around any build command
//
// Off on Vercel / CI (their build machines are not this Mac and have their own limits): VERCEL or CI set → no-op.
// HG_DISK_MIN_START_GB / HG_DISK_MIN_RUN_GB change the thresholds — Dominic's decision only; agents never set them.
const fs = require('fs')
const os = require('os')
const path = require('path')

const MIN_START_GB = Number(process.env.HG_DISK_MIN_START_GB || 40)
const MIN_RUN_GB = Number(process.env.HG_DISK_MIN_RUN_GB || 20)
const EVERY_MS = 15000
const OFF = !!(process.env.VERCEL || process.env.CI)

/** Free space (GB, available to this user) on the volume that holds the home folder — the one every cache lives on. */
function freeGB(where = os.homedir()) {
  const s = fs.statfsSync(where)
  return (s.bavail * s.bsize) / 2 ** 30
}

const fmt = n => `${n.toFixed(1)} GB`
const name = label => (label ? path.basename(String(label)) : 'this run')

/** May a run start? { ok, free } — never throws (an unreadable volume is reported and allowed, not a crash). */
function canStart() {
  if (OFF) return { ok: true, free: NaN }
  try { const free = freeGB(); return { ok: free >= MIN_START_GB, free } }
  catch (e) { console.warn(`[disk-guard] free space unreadable (${e.message}) — not blocking`); return { ok: true, free: NaN } }
}

const stops = []
let timer = null

/** The start check, then the 15-second watch. Returns { onStop(fn) } to register a clean-up for a low-space stop. */
function guard(label) {
  const api = { onStop: fn => { stops.push(fn); return api } }
  if (OFF) return api
  const { ok, free } = canStart()
  if (!ok) {
    console.error(`🔴 [disk-guard] ${name(label)} refused: ${fmt(free)} free, needs ${MIN_START_GB} GB to start. ` +
      'Free space first (docs/reference-manual.md, "Disk space").')
    process.exit(3)
  }
  if (!timer) {
    timer = setInterval(async () => {
      let f; try { f = freeGB() } catch { return }
      if (f >= MIN_RUN_GB) return
      clearInterval(timer)
      console.error(`🔴 [disk-guard] ${name(label)} stopped: free space fell to ${fmt(f)} (below ${MIN_RUN_GB} GB).`)
      for (const fn of stops) { try { await fn() } catch (e) { console.error(`[disk-guard] clean-up failed: ${e.message}`) } }
      process.exit(4)
    }, EVERY_MS)
    timer.unref()   // never keeps a finished script alive
  }
  return api
}

module.exports = { guard, canStart, freeGB, MIN_START_GB, MIN_RUN_GB }

// ── CLI, for shell scripts ────────────────────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2)
  if (cmd === 'free') { console.log(fmt(freeGB())); process.exit(0) }
  if (cmd === 'check') {
    const { ok, free } = canStart()
    if (ok) process.exit(0)
    console.error(`🔴 [disk-guard] ${name(a)} refused: ${fmt(free)} free, needs ${MIN_START_GB} GB to start. ` +
      'Free space first (docs/reference-manual.md, "Disk space").')
    process.exit(3)
  }
  if (cmd === 'watch') {
    const pid = Number(a)
    if (!pid) { console.error('usage: _disk-guard.cjs watch <pid> [label]'); process.exit(2) }
    if (OFF) process.exit(0)
    const tick = () => {
      try { process.kill(pid, 0) } catch { process.exit(0) }          // the watched run has ended
      let f; try { f = freeGB() } catch { return }
      if (f >= MIN_RUN_GB) return
      console.error(`🔴 [disk-guard] ${name(b)} stopped: free space fell to ${fmt(f)} (below ${MIN_RUN_GB} GB).`)
      try { process.kill(pid, 'SIGTERM') } catch {}
      process.exit(4)
    }
    setInterval(tick, EVERY_MS); tick()
  } else {
    console.error('usage: node scripts/_disk-guard.cjs free | check [label] | watch <pid> [label]'); process.exit(2)
  }
}
