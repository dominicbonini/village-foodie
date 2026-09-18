// Shared by the scripts/slot-interval-*.cjs harnesses. Compiles the given TS entry files from ROOT into
// a temp dir with the repo's tsc, and returns a require() bound to that tree (the `@/` alias mapped).
// ROOT may be the working tree OR a clean `git worktree` of HEAD — that is how byte-identity is proved.
const { execFileSync } = require('child_process')
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
function compile(root, files, tag, extraCompilerOptions) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `slot-${tag}-`))
  const cfg = path.join(out, 'tsconfig.json')
  fs.writeFileSync(cfg, JSON.stringify({
    compilerOptions: { module: 'commonjs', target: 'es2020', outDir: out, rootDir: root, skipLibCheck: true,
      esModuleInterop: true, moduleResolution: 'node', baseUrl: root, paths: { '@/*': ['./*'] },
      types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
      // Optional per-harness additions — e.g. { jsx: 'react-jsx' } so a component can be RENDERED in a
      // harness rather than only grepped. Nothing is overridden unless a caller asks.
      ...(extraCompilerOptions || {}) },
    files: files.map(f => path.join(root, f)),
  }))
  try { execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' }) }
  catch (e) { console.log(`🔴 COMPILE FAILED (${tag}):\n` + (e.stdout ? e.stdout.toString() : e.message)); process.exit(1) }
  const Module = require('module')
  const req = (rel) => {
    const real = Module._resolveFilename
    Module._resolveFilename = function (r, ...rest) {
      if (r.startsWith('@/')) return real.call(this, path.join(out, r.slice(2)), ...rest)
      return real.call(this, r, ...rest)
    }
    try { return require(path.join(out, rel)) } finally { Module._resolveFilename = real }
  }
  return { out, req }
}
/** A clean checkout of HEAD, for "before" compilation. Caller removes it. */
function headWorktree(tag) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), `slot-head-${tag}-`))
  execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], { cwd: REPO, stdio: 'pipe' })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'))
  return { wt, remove: () => { try { execFileSync('git', ['worktree', 'remove', wt, '--force'], { cwd: REPO, stdio: 'pipe' }) } catch {} } }
}
module.exports = { compile, headWorktree, REPO }
