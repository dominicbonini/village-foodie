// scripts/revalidate-pages.cjs — perf-1 (5 November 2026, docs/perf-1-report.md): TELL THE SITE ITS MARKETING DATA CHANGED. A MODULE,
// used by scripts/db-migrate.cjs (after a migration) and scripts/faq-translate/main.ts (after a run that wrote). NOT a harness.
//
//   await revalidatePages(['marketing-faq'], { why: 'faq-translate', log: console.log })
//
// POSTs {"tags": [...]} to <REVALIDATE_BASE_URL, default https://www.hatchgrab.com>/api/revalidate with the header
// x-revalidate-secret: <REVALIDATE_SECRET>. Both are read from process.env ONLY (never a .env file).
// 🔴 IT NEVER FAILS THE CALLER: a missing secret, an unreachable site, a refusal or a timeout prints one clear WARNING and returns
// false. A migration or a translation run must never fail because the pages could not be told.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS module, like every scripts/*.cjs */
'use strict'

const TAGS = ['marketing-countries', 'marketing-plans', 'marketing-faq']   // lib/marketing-tags.ts MARKETING_TAG_LIST (checked by scripts/perf-1.cjs)
const DEFAULT_BASE = 'https://www.hatchgrab.com'
const TIMEOUT_MS = 10_000

/** @returns {Promise<boolean>} true when the site answered 200; never throws. */
async function revalidatePages(tags = TAGS, { why = 'a script', log = console.log } = {}) {
  // vercel-cost-1 (23 November 2026): the pages have no timer any more, so an untold change stays hidden until someone refreshes them.
  const warn = msg => log(`WARNING (pages not told — they keep showing the old data until refreshed: REVALIDATE_SECRET=… node scripts/revalidate-pages.cjs): ${msg}`)
  try {
    const secret = process.env.REVALIDATE_SECRET
    const base = (process.env.REVALIDATE_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')
    if (!secret) { warn(`REVALIDATE_SECRET is not set, so ${why} could not ask ${base} to refresh ${tags.join(', ')}.`); return false }
    const res = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status !== 200) { warn(`${base}/api/revalidate answered ${res.status} for ${why}.`); return false }
    log(`revalidate: ${base} refreshed ${tags.join(', ')} (${why}).`)
    return true
  } catch (e) {
    warn(`${why} could not reach the site: ${e && e.message ? e.message : e}`)
    return false
  }
}

module.exports = { revalidatePages, TAGS, DEFAULT_BASE }

// vercel-cost-1 (23 November 2026, docs/vercel-cost-1-report.md): RUN DIRECTLY, it refreshes EVERY marketing page — the one command after
// a migration run any other way, or a Supabase dashboard edit:
//   REVALIDATE_SECRET='<the secret>' node scripts/revalidate-pages.cjs            (every tag)
//   REVALIDATE_SECRET='<the secret>' node scripts/revalidate-pages.cjs marketing-plans   (only the tags named)
// Exit 0 when the site answered 200, else 1 (the warning says why). Required as a module (db-migrate.cjs, faq-translate), it does nothing.
if (require.main === module) {
  const named = process.argv.slice(2)
  revalidatePages(named.length ? named : TAGS, { why: 'scripts/revalidate-pages.cjs (by hand)' }).then(ok => process.exit(ok ? 0 : 1))
}
