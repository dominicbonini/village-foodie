// scripts/_harness-tmp-paths.cjs — tmp-cleanup-1: where harness temp lives. Shared by _harness-tmp.cjs (each run),
// harness-tmp-clean.cjs (the clean-up) and _disk-guard.cjs (the sweep's temp report). No side effects.
//
//   $TMPDIR/hatchgrab-harness/<run-id>/<pid>/    one folder per harness process; <run-id> is the sweep's (or the
//                                                 process's own when run by hand)
const os = require('os')
const path = require('path')

/** The system temp folder, never the redirected one (_harness-tmp.cjs patches os.tmpdir(), not $TMPDIR). */
function realTmp() { return (process.env.HG_REAL_TMPDIR || process.env.TMPDIR || os.tmpdir()).replace(/\/+$/, '') }
const ROOT = path.join(realTmp(), 'hatchgrab-harness')

module.exports = { ROOT, realTmp }
