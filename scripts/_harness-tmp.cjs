// scripts/_harness-tmp.cjs — tmp-cleanup-1 (16 November 2026, docs/tmp-cleanup-1-report.md): EVERY HARNESS'S TEMP GOES
// UNDER ONE PARENT AND IS REMOVED WHEN THE HARNESS ENDS — passed, failed, crashed or interrupted.
//
// WHY: harnesses made folders with mkdtemp in $TMPDIR (build copies for each broken variant, render bundles, browser
// profiles, screenshots) and never removed them: 90 GB / 14,465 folders by 16 November, ~30–45 GB per full sweep.
//
// HOW (load it FIRST: `require('./_harness-tmp.cjs')` is the first statement after the disk guard; the sweep runner also
// preloads it with `node --require`):
//   • os.tmpdir() is redirected to   $TMPDIR/hatchgrab-harness/<run-id>/<pid>/
//     so every mkdtemp, every Puppeteer / Playwright profile and anything else a script or library puts in "the temp
//     folder" lands there. <run-id> is the sweep's (HG_HARNESS_RUN) or, run by hand, the process's own.
//   • Child node processes inherit it (NODE_OPTIONS --require + HG_HARNESS_TMP_DIR) and write into the SAME folder; only
//     the process that created the folder removes it. Non-node children (Chrome, esbuild) keep the real $TMPDIR — Chrome's
//     socket paths must stay short — and clean up after themselves.
//   • Removal: on 'exit' (normal end, process.exit, an uncaught exception, an unhandled rejection) and on SIGINT / SIGTERM
//     / SIGHUP. Only SIGKILL escapes; the sweep runner removes and reports any such leftover, and each sweep starts by
//     removing runs older than 24 hours (scripts/harness-tmp-clean.cjs).
//   • Under the sweep, the bytes each harness used are appended to <run-id>/.usage for the runner's temp report.
//   • HG_KEEP_TMP=1 keeps the folder (and prints where it is) — for debugging a harness by hand.
// Nothing here throws: a temp problem never fails a harness.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ROOT, realTmp } = require('./_harness-tmp-paths.cjs')

if (!global.__hgHarnessTmp) {
  const state = global.__hgHarnessTmp = { dir: null, owner: false, runDir: null, ownRun: false }
  const inherited = process.env.HG_HARNESS_TMP_DIR
  try {
    if (inherited && fs.existsSync(inherited)) {
      state.dir = inherited                                                    // a child: share the parent's folder
    } else {
      const run = process.env.HG_HARNESS_RUN || `${Date.now().toString(36)}-${process.pid}`
      state.ownRun = !process.env.HG_HARNESS_RUN
      state.runDir = path.join(ROOT, run)
      state.dir = path.join(state.runDir, String(process.pid))
      fs.mkdirSync(state.dir, { recursive: true })
      state.owner = true
      process.env.HG_REAL_TMPDIR = realTmp()
      process.env.HG_HARNESS_TMP_DIR = state.dir
      const self = `--require=${__filename}`
      if (!(process.env.NODE_OPTIONS || '').includes(self)) process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${self}`.trim()
    }
    os.tmpdir = () => state.dir
    try { require('module').syncBuiltinESMExports() } catch {}
  } catch (e) {
    state.dir = null                                                            // leave os.tmpdir() alone; never fail
  }

  function sizeOf(p) {
    let total = 0; const stack = [p]
    while (stack.length) {
      const cur = stack.pop(); let st
      try { st = fs.lstatSync(cur) } catch { continue }
      if (st.isDirectory()) { let es = []; try { es = fs.readdirSync(cur) } catch {} for (const e of es) stack.push(path.join(cur, e)) }
      else total += st.blocks ? st.blocks * 512 : st.size
    }
    return total
  }
  let done = false
  function cleanup() {
    if (done || !state.owner || !state.dir) return
    done = true
    if (process.env.HG_KEEP_TMP === '1') { try { process.stderr.write(`[harness-tmp] kept ${state.dir} (HG_KEEP_TMP=1)\n`) } catch {} return }
    try {
      if (process.env.HG_HARNESS_RUN) {
        const bytes = sizeOf(state.dir)
        fs.appendFileSync(path.join(state.runDir, '.usage'), `${path.basename(process.argv[1] || 'node')}\t${process.pid}\t${bytes}\n`)
      }
    } catch {}
    try { fs.rmSync(state.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch {}
    if (state.ownRun) { try { fs.rmSync(path.join(state.runDir, '.usage'), { force: true }); fs.rmdirSync(state.runDir) } catch {} }
  }
  if (state.owner) {
    process.on('exit', cleanup)
    for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
      process.once(sig, () => { cleanup(); process.exit(128 + n) })
    }
  }
}

module.exports = { tmpDir: () => global.__hgHarnessTmp && global.__hgHarnessTmp.dir }
