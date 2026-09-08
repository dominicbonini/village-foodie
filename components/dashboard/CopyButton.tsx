'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { attemptCopy } from '@/lib/clipboard'

/**
 * ── ONE COPY BUTTON. EVERY COPY BUTTON IN THE CUSTOM-DOMAIN SCREENS IS THIS ONE. ─────────────────
 *
 * 🔴 SHARED RATHER THAN REPEATED, BECAUSE THE PREVIOUS SHAPE WAS REPEATED AND THE COPIES DRIFTED.
 * `CustomDomainSetup` rendered the same eight lines twice — once for the verified-provider rows and
 * once for the generic rows — each with its own `copied === r.label ? 'Copied ✓' : 'Copy'`. Both were
 * keyed on a LABEL, so the two record tables share a key space: a provider whose name field is called
 * "Value" and whose value field is also called "Value" would light both buttons at once.
 *
 * ── 🔴 THE SAFARI RULE, WHICH IS THE ONLY REASON THIS FILE HAS A COMMENT THIS LONG ────────────────
 * `navigator.clipboard.writeText` MUST BE CALLED SYNCHRONOUSLY INSIDE THE CLICK HANDLER. Safari ties
 * clipboard access to a live user gesture, and any `await` BEFORE the write lets the gesture expire —
 * the promise then rejects, or worse resolves having written nothing, and **the button appears to do
 * nothing at all.** No error, no console line, no visual change.
 * 🔴 SO THE HANDLER IS NOT `async`. It calls `writeText` as its first statement and attaches
 * `.then`/`.catch` to the promise it returns. `await` inside an async handler placed ON the write
 * itself is also fine — the call is evaluated before the suspension — but "not async at all" is the
 * shape that cannot be broken by someone later adding a line above it.
 * ⚠️ DO NOT ADD AN `await` ABOVE THE `writeText` LINE. Not a fetch, not a state flush, not an
 * analytics call. If something must happen first, do it after the copy.
 *
 * ── WHAT IT SIGNALS, AND WHY EACH PART ────────────────────────────────────────────────────────────
 * ⚠️ THE WIDTH IS RESERVED, so the button does not resize when the label changes. A control that
 * changes size on click reads as something having gone wrong, and it shifts everything beside it.
 * Both labels are rendered into the same grid cell; the widest one sets the width and the inactive one
 * is `invisible` — it still occupies space, so nothing moves. Measuring in JS would need a layout pass
 * and would be wrong on first paint.
 * ⚠️ IT IS NOT DISABLED AFTER COPYING. People copy twice — they paste somewhere wrong, or lose it, or
 * simply do not trust that it worked. A button that refuses the second press is a bug the operator
 * cannot diagnose.
 * ⚠️ THE ANNOUNCEMENT IS `aria-live="polite"` AND THE SIGNAL IS NEVER COLOUR ALONE. The tick and the
 * word "Copied" both carry it visually; the live region carries it to a screen reader without stealing
 * focus. `role="status"` rather than `alert` — a successful copy is not an alert.
 * 🔴 FAILURE IS VISIBLE. The clipboard API refuses in an insecure context, under a permissions policy,
 * and in some private modes — and `navigator.clipboard` can be `undefined` entirely. A silent no-op is
 * worse than having no button at all, because the operator carries on believing they hold the value.
 */

/** How long the confirmation shows. Long enough to read, short enough not to look stuck. */
const REVERT_AFTER_MS = 2000

/**
 * ── 🔴 TWO TONES, ADDED 5 SEPTEMBER 2026 SO THE COMPONENT COULD ABSORB THE LAST BESPOKE BUTTONS. ──
 * Three hand-rolled copy buttons remained after the first pass — two admin ones and the demo welcome —
 * and one of them is a full-width solid button rather than a quiet outline. Without a tone, migrating
 * it would have meant passing conflicting Tailwind colour classes through `className` and relying on
 * stylesheet order to resolve them, which is exactly the kind of "works until it doesn't" the
 * duplication was causing in the first place.
 * ⚠️ FAILURE IS RED IN BOTH TONES. The visible failure state is not a per-caller decision.
 */
type Tone = 'outline' | 'primary'

const TONE_CLASSES: Record<Tone, { idle: string; copied: string }> = {
  outline: {
    idle: 'border border-slate-200 text-slate-700 hover:bg-slate-50',
    copied: 'border border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
  },
  primary: {
    idle: 'border border-transparent bg-orange-600 text-white hover:bg-orange-700',
    copied: 'border border-transparent bg-green-600 text-white hover:bg-green-700',
  },
}

export function CopyButton({
  value,
  label = 'Copy',
  /** What the announcement names, so two buttons on one screen are distinguishable to a screen reader. */
  describedAs,
  tone = 'outline',
  className = '',
}: {
  value: string
  label?: string
  describedAs?: string
  tone?: Tone
  className?: string
}) {
  // ⚠️ `shrink-0` IS NO LONGER IN THE BASE CLASSES. It was correct for the record rows and wrong for a
  // full-width button, and a caller cannot un-set a class. The two record-row call sites pass it.
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ⚠️ CLEARED ON UNMOUNT. These rows re-render as the setup flow moves between steps, and a timer
  // firing into an unmounted component is a React warning at best.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const arm = useCallback((next: 'copied' | 'failed') => {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), REVERT_AFTER_MS)
  }, [])

  // 🔴 NOT `async`, AND `attemptCopy` IS NOT AWAITED. See the Safari rule above.
  const onClick = () => { attemptCopy(value).then(arm) }

  const failed = state === 'failed'
  const copied = state === 'copied'

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        // 🔴 NEVER `disabled`. See above.
        aria-label={describedAs ? `${label} ${describedAs}` : label}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          failed
            ? 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            : copied ? TONE_CLASSES[tone].copied : TONE_CLASSES[tone].idle
        } ${className}`}
      >
        {/* ⚠️ THE WIDTH RESERVATION. All three labels sit in ONE grid cell, so the cell is as wide as
            the widest and the button never changes size. `invisible` keeps layout, `hidden` would not. */}
        <span className="grid">
          <span className={`col-start-1 row-start-1 whitespace-nowrap ${copied || failed ? 'invisible' : ''}`}>{label}</span>
          <span className={`col-start-1 row-start-1 whitespace-nowrap ${copied ? '' : 'invisible'}`} aria-hidden={!copied}>Copied ✓</span>
          <span className={`col-start-1 row-start-1 whitespace-nowrap ${failed ? '' : 'invisible'}`} aria-hidden={!failed}>Copy failed</span>
        </span>
      </button>

      {/* 🔴 THE ANNOUNCEMENT. Empty when idle so nothing is read out on mount; `polite` so it waits for
          a pause rather than interrupting. The failure text says what to do instead, because "copy
          failed" on its own leaves the operator with no way forward. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${describedAs ?? 'Value'} copied` : ''}
        {failed ? `Could not copy ${describedAs ?? 'the value'}. Select the writing and copy it yourself.` : ''}
      </span>
    </>
  )
}
