#!/usr/bin/env node
// scripts/competitor-check/run.mjs — bundles scripts/competitor-check/main.ts with the repo's own esbuild (so the "@/"
// imports and TypeScript resolve without tsx), then runs it with the same arguments. competitor-check-1, 25 October 2026.
// `server-only` is answered with an empty module: this is a server process, not a browser bundle.
// competitor-check-2: a first argument ending in .ts is the entry instead (scripts/data-import/main.ts, the importer).
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'competitor-check-')), 'main.cjs')
const args = process.argv.slice(2)
const entry = args[0]?.endsWith('.ts') ? args.shift() : 'scripts/competitor-check/main.ts'
await build({
  entryPoints: [path.join(repo, entry)], outfile: out, bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  alias: { '@': repo }, logLevel: 'error', packages: 'external',
  plugins: [{ name: 'server-only', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' })); b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' })) } }],
  nodePaths: [path.join(repo, 'node_modules')],
})
const r = spawnSync(process.execPath, [out, ...args], { stdio: 'inherit', cwd: repo, env: { ...process.env, NODE_PATH: path.join(repo, 'node_modules') } })
process.exit(r.status ?? 1)
