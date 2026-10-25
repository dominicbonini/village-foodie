// lib/comparison-decisions.ts — decisions a comparison page waits on before it can go live (compare-de-1, 25 October 2026).
// NOT COPY: these are Dominic's own records, read by the page's admin checklist (lib/comparison.ts), never shown publicly.
//
// IMPRESSUM: a German page aimed at a German audience may need an Impressum (DDG §5). Write the decision here — one plain
// line, for example "Not needed: …" or "Added at /impressum on …" — and the checklist item turns green. null = not decided.
export const IMPRESSUM_DECISION: Readonly<Record<string, string | null>> = {
  DE: null,
}
