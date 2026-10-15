// lib/i18n/merge.ts — the one deep merge (Language Phase 0; split out in Language Phase 1b so the client registry
// can use it without importing the whole catalogue). Pure, no imports.
export type Tree = { [k: string]: string | Tree }

const isBranch = (x: unknown): x is Tree => typeof x === 'object' && x !== null && !Array.isArray(x)

/** `over` laid onto `base`, branch by branch. A string in `over` replaces the base's; anything `over` lacks stays. */
export function deepMerge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = out[k]
    // An ARRAY is a leaf: with the build's message precompile (Language Phase 1a) a message can be a compiled
    // array rather than a string, and merging two of those index by index would corrupt both.
    out[k] = isBranch(v) && isBranch(b) ? deepMerge(b, v) : v
  }
  return out
}
