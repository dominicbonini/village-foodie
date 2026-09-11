// lib/safe-href.ts
// 🔴 ONE DEFINITION OF "TURN AN UNTRUSTED STORED URL INTO AN href, OR REFUSE".
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────
// MOVED, NOT REWRITTEN, on 12 September 2026. The body below is BYTE-IDENTICAL to the `safeHref` that
// lived in components/admin/OutreachPanel.tsx — the only edit is the `export` keyword in front of it.
// 🔴 THE REASON IT WAS MOVED RATHER THAN RE-IMPLEMENTED is recorded at §51.7 of the reference manual:
// a previous "reuse" turned out to be a fourth independent implementation of something the repo already
// had, and nobody noticed because both versions looked plausible. This repo already carries THREE
// overlapping URL helpers — this one, `hrefFromStoredUrl` (lib/url-normalise.ts) and a hand-written
// inline prefix in components/EventListCard.tsx. A fourth would be the same mistake.
//
// ── WHAT IT IS FOR, AND WHAT IT IS NOT ──────────────────────────────────────────────────────────────
// It guards columns the SCRAPER writes and anon can read — `discovery_trucks.order_url`, `menu_url`,
// `website`, `schedule_url`, `venues.website`. Those values come from pages we do not control.
// ⚠️ IT IS NOT INTERCHANGEABLE WITH `hrefFromStoredUrl`. That one never refuses, by design, because it
// renders operator-entered values on customer-facing pages where dropping a link the customer used to
// see is worse than the odd broken one. This one REFUSES, because a refused link on a public page is
// correct and a `data:` URL in an href is not. Read lib/url-normalise.ts's own header before merging
// them: the difference is deliberate.
//
// ⚠️ REACT 19 IS NOT THE GUARD. 🧪 react-dom 19.2.3 blocks `javascript:` in an href by rewriting it to a
// throwing stub — but it passes `data:` and `vbscript:` through VERBATIM, and it is a dependency
// version, not our code. This function is what refuses those.

export function safeHref(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  // 🔴 A RELATIVE PATH IS NOT A WEBSITE. Prefixing "https://" onto "/foo/bar" invents the host
  // `https://foo/bar`, which is worse than doing nothing — it looks like a working link.
  if (v.startsWith('/')) return null
  // 🔴 http(s) ONLY. These columns are written by the scraper and are anon-readable, so the value is
  // untrusted input: `javascript:alert(1)` in an <a href> executes on click. Caught by testing edge
  // cases rather than the 231 live rows, every one of which is already http(s).
  const ok = (u: URL) => (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null
  try { return ok(new URL(v)) } catch { /* fall through */ }
  // No scheme: try it as https, and only use it if THAT parses to an http(s) URL.
  try { return ok(new URL(`https://${v}`)) } catch { return null }
}
