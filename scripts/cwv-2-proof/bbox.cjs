// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
const sharp = require('sharp')
;(async () => { const [a, b, out] = process.argv.slice(2)
  const [x, y] = await Promise.all([a, b].map(f => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })))
  const W = x.info.width, H = Math.min(x.info.height, y.info.height); let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; if (x.data[k] !== y.data[k] || x.data[k + 1] !== y.data[k + 1] || x.data[k + 2] !== y.data[k + 2]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j) } }
  console.log('bbox', x0, y0, x1, y1)
  if (out && x1 >= 0) { const t = Math.max(0, y0 - 40), h = Math.min(H - t, y1 - y0 + 80)
    const [ca, cb] = await Promise.all([a, b].map(f => sharp(f).extract({ left: 0, top: t, width: W, height: h }).toBuffer()))
    await sharp({ create: { width: W * 2 + 10, height: h, channels: 4, background: '#f00' } }).composite([{ input: ca, left: 0, top: 0 }, { input: cb, left: W + 10, top: 0 }]).png().toFile(out) }
})()
