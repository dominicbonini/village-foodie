// lib/clipboard.ts
//
// ── THE CLIPBOARD WRITE. ONE FUNCTION, FRAMEWORK-FREE, AND EXECUTABLE ON ITS OWN. ────────────────
//
// 🔴 IT LIVES HERE RATHER THAN INSIDE THE BUTTON SO ITS FAILURE PATH CAN BE RUN. It began as four
// lines inside a click handler, which meant the only way to check the failure branch was to READ it —
// and the whole reason this module exists is that two buttons elsewhere reported success they had
// never checked. A guard nobody can execute is the same class of claim as the bug it guards against.
// ⚠️ A .ts file, not .tsx, deliberately: it imports no React and can therefore be executed directly.

/**
 * ── 🔴 THE WRITE, AS A SEPARATE FUNCTION SO THE FAILURE PATH CAN BE EXECUTED. ────────────────────
 *
 * Extracted 5 September 2026. It was four lines inside the click handler, which meant **the only way
 * to check the failure branch was to read it** — and the point of this whole change is that two
 * buttons elsewhere reported success they had never checked. A guard nobody can execute is the same
 * class of claim.
 *
 * 🔴 IT IS NOT `async`, AND THAT IS LOAD-BEARING FOR SAFARI. `navigator.clipboard.writeText` is called
 * as the first statement, in the same tick as the click, before any promise is awaited anywhere.
 * Safari ties clipboard access to a live user gesture and an `await` **before** the write lets that
 * gesture expire — the copy then fails with no error and no visible change.
 * ⚠️ DO NOT MAKE THIS `async`. Do not add a line above the `writeText` call. If something must happen
 * first, do it in `.then`.
 *
 * ⚠️ IT NEVER REJECTS. Every outcome is a resolved `'copied' | 'failed'`, so the caller has no error
 * path to forget. The three ways to fail are all folded in: a rejected promise (permissions policy,
 * some private modes), a missing API (`navigator.clipboard` is `undefined` on an insecure origin), and
 * a synchronous throw from a blocked accessor.
 */
export function attemptCopy(value: string): Promise<'copied' | 'failed'> {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (!clipboard?.writeText) return Promise.resolve('failed')
    return clipboard.writeText(value).then(() => 'copied' as const, () => 'failed' as const)
  } catch {
    return Promise.resolve('failed')
  }
}

