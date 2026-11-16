// scripts/money-sweep-parity-usd.cjs — money-sweep-parity's --usd mode as a sweep entry (US polish batch, 19 October
// 2026). The runner (scripts/run-harnesses.cjs) passes no arguments, so this adds the flag and runs the same harness:
// the same fixtures as a US truck's orders — no £ anywhere, two-decimal $ amounts, and each screen the GB one with
// only its symbol (and the named differences) changed.
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
process.argv.push('--usd')
require('./money-sweep-parity.cjs')
