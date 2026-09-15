// lib/outreach-snippets.ts
// ── 🔴 SNIPPETS — A NAMED VALUE DEFINED ONCE, PULLED INTO EVERY TEMPLATE THAT REFERENCES IT ─────────
//
// The `[[name]]` tier has always been "a marker the operator fills in". A SNIPPET is the same marker
// with a remembered answer, held in ONE place: `outreach_snippets`, keyed by the name itself.
//
// 🔴 WHAT THIS REPLACES, AND WHY BOTH PREDECESSORS WERE WRONG:
//   • `outreach_templates.placeholder_defaults` — per-template jsonb. 🧪 `[[my rate]]` is in four of the
//     five seeded templates, so one rate meant four edits, and changing it meant four more. That is the
//     objection this exists to answer.
//   • The localStorage global layer added on 15 September — one edit, but only in one browser, and its
//     own header said so. A library that lives in one browser is not a library.
//
// 🔴 NOTHING HERE WRITES A TEMPLATE. The snippet table is the only thing this tier writes.
//
// PURE: no React, no network, no storage. The route fetches; these functions decide.

/** A snippet as stored. `value` may legitimately be '' — see `isAskPerTruck`. */
export type Snippet = { name: string; value: string }

/** Name → value, the shape `defaultFillsOf` takes. */
export type SnippetMap = Record<string, string>

export const snippetMapOf = (rows: readonly Snippet[]): SnippetMap => {
  const out: SnippetMap = {}
  for (const r of rows) out[r.name] = r.value ?? ''
  return out
}

/**
 * 🔴 A ROW WITH AN EMPTY VALUE IS A DECISION; NO ROW AT ALL IS AN OMISSION.
 * Both prompt at compose time — the renderer cannot tell them apart and should not — but the library
 * shows them differently, because "I always type this per truck" and "nobody has looked at this yet"
 * are different things to a person deciding what to work on.
 */
export const isAskPerTruck = (rows: readonly Snippet[], name: string): boolean => {
  const r = rows.find(s => s.name === name)
  return !!r && (r.value ?? '').trim() === ''
}
export const isUnset = (rows: readonly Snippet[], name: string): boolean =>
  !rows.some(s => s.name === name)

// ── 🔴 THE BLAST RADIUS — WHICH TEMPLATES A SNIPPET REACHES ─────────────────────────────────────────
// The point of the redesign: before changing a value, see that it is about to change four emails.
//
// ⚠️ THE INPUT IS THE TEMPLATE BODIES, AND THE LIST IS ONLY AS RIGHT AS THEY ARE. This scans the text
// that is loaded; a template the route did not return is not counted, and a name typed two ways
// (`[[my rate]]` vs `[[My Rate]]`) is two snippets. That is a property of the marker being free text,
// not something this function can repair — and repairing it by normalising case would silently merge
// two markers the renderer treats as distinct, which is worse.

/** What one template contributes to the index. Structural, so a richer row satisfies it. */
export type TemplateLike = {
  id: string
  label?: string | null
  slug?: string | null
  active?: boolean | null
  subject?: string | null
  body: string
}

export type SnippetUse = {
  name: string
  /** Every template referencing it, in the order given. */
  templates: { id: string; label: string; active: boolean }[]
}

/**
 * Every distinct `[[name]]` across the templates given, each with the templates that use it.
 * 🔴 ONE ENTRY PER DISTINCT NAME — not per template and not per occurrence. A name used twice in one
 * body lists that template once.
 *
 * ⚠️ THE LABEL FALLBACK IS DELIBERATE AND ORDERED. `label` is what the operator reads, but it is free
 * text and could be blank; the slug is the stable key and always exists; the id is the last resort and
 * is never blank. A row that rendered an empty string would be a template he cannot identify, which
 * defeats the purpose of showing the list at all.
 */
export function snippetIndex(
  templates: readonly TemplateLike[],
  scan: (text: string) => string[],
): SnippetUse[] {
  const byName = new Map<string, SnippetUse>()
  for (const t of templates) {
    const label = (t.label ?? '').trim() || (t.slug ?? '').trim() || t.id
    // 🔴 SUBJECT AND BODY BOTH. A marker in a subject line is as real as one in a body, and the
    // compose window prompts for it either way — `renderWithFills` applies fills to both.
    for (const name of scan(`${t.subject ?? ''}\n${t.body}`)) {
      let e = byName.get(name)
      if (!e) { e = { name, templates: [] }; byName.set(name, e) }
      if (!e.templates.some(x => x.id === t.id)) {
        e.templates.push({ id: t.id, label, active: t.active !== false })
      }
    }
  }
  // Most-used first, then alphabetically — the ones worth setting once rise to the top.
  return [...byName.values()].sort((a, b) =>
    b.templates.length - a.templates.length || a.name.localeCompare(b.name))
}

/** Valid snippet names: the text between brackets, trimmed, non-empty, and no bracket characters. */
export const isSnippetName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 80 && !/[[\]]/.test(v)
