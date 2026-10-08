'use client'
// components/manage/LivePoster.tsx — the poster tree, painted by the browser instead of by satori.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS IS, AND WHAT IT IS DELIBERATELY NOT (10 October 2026 · §2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ **DOMINIC:** *"when i move a box the text stays in its old position for seconds."* The stage drew
// the server's PNG, so the words trailed the outline by a debounce plus a render.
//
// 🔴 **IT IS NOT A SECOND RENDERER.** It does not know what a weekly post is, which boxes exist, what
// a date says or how text is fitted. It is handed the SAME `El[]` tree that satori is handed —
// `lib/weekly-post/draw.ts` builds it for both — and it mounts those objects as DOM. Everything that
// decides what the poster looks like happened before this component was called.
//
// ⚠️ THREE THINGS HAVE TO BE TRANSLATED, AND THEY ARE THE ONLY THREE:
//   1. **THE FAMILY NAME.** satori matches registered names as plain strings; CSS parses them, and a
//      library id (`g:lobster`) is not a legal CSS identifier. `liveFamily` is the one alias function,
//      shared with the registration in `live-fonts.ts`.
//   2. **`box-sizing`.** satori is border-box for everything; a browser is content-box by default, so
//      a bordered picture box would come out wider by its border. One CSS rule on the root fixes it.
//   3. **THE SCALE.** The tree is in the painted PNG's pixels (`renderScale`); the stage is however
//      many CSS pixels fit on screen. One `transform: scale()` on the root, so every child is in the
//      same coordinates it would be in the PNG — rather than multiplying 200 numbers.
//
// ══ ⚠️ THE KNOWN DIFFERENCES FROM THE PNG — MEASURED, SMALL, AND IN THE REPORT ═════════════════════
//   • **LINE HEIGHT.** satori derives it from the font's `hhea` ascender/descender, exactly as
//      `fit.ts` does; a browser's `normal` adds the font's line gap. A multi-line box can sit a pixel
//      or two differently. ⛔ FIXING IT WOULD MEAN PUTTING A `lineHeight` INTO THE SHARED TREE, which
//      would change every PNG this product has ever made. Not worth a pixel.
//   • **LETTER SPACING** after the last glyph of a run: the browser adds it, satori does not.
//   • **AN UPLOADED FAMILY** is never sent to a browser (see `live-fonts.ts`), so those boxes draw in
//      the fallback here and in the real font in the PNG.
//   • **A REAL ITALIC FILE** in a library family draws sheared here and italic in the PNG.
// 🔴 "👁 Preview post" IS THE ANSWER TO ALL FOUR: it shows the actual PNG, full size, on demand.

import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { liveFamily } from '@/lib/weekly-post/live-fonts'
import type { El } from '@/lib/weekly-post/draw'

/**
 * One node's style, as the browser needs it.
 *
 * ⚠️ EVERYTHING ELSE IS PASSED THROUGH UNTOUCHED — the tree is already CSS, with CSS's own units as
 * strings, because that is what satori reads. ⛔ NOTHING IS "CONVERTED": a mapper that rewrote values
 * would be the second answer to "what does this box look like" that this whole design exists to avoid.
 */
function styleFor(raw: Record<string, unknown>): CSSProperties {
  const out: Record<string, unknown> = { ...raw }
  const fam = out.fontFamily
  if (typeof fam === 'string') out.fontFamily = `"${liveFamily(fam)}"`
  return out as CSSProperties
}

/** The tree, as React nodes. ⚠️ Keys are the path, which is stable because the tree is rebuilt whole. */
function nodes(children: unknown, path: string): ReactNode {
  if (children === undefined || children === null) return null
  if (typeof children === 'string' || typeof children === 'number') return children
  if (Array.isArray(children)) {
    return children.map((c, i) => <Fragment key={`${path}.${i}`}>{nodes(c, `${path}.${i}`)}</Fragment>)
  }
  const el = children as El
  if (!el || typeof el !== 'object' || !el.type) return null
  const props = el.props ?? {}
  const style = styleFor((props.style as Record<string, unknown>) ?? {})
  if (el.type === 'img') {
    /* eslint-disable-next-line @next/next/no-img-element -- a data URI the caller already fetched. */
    return <img src={String(props.src ?? '')} alt="" style={style} />
  }
  return <div style={style}>{nodes(props.children, path)}</div>
}

export interface LivePosterProps {
  /** The tree, from `weeklyTree` / `eventTree`. ⚠️ The same objects satori is given.
   *  ⛔ IT IS NOT CALLED `children`: a prop by that name read as JSX children to `react/no-children-prop`
   *  and these are data, not a subtree the caller wrote. */
  tree: El[]
  /** The painted size the tree's coordinates are in. */
  W: number
  H: number
  /**
   * ══ 🔴 **THE ONE CONVERSION FROM POSTER PIXELS TO SCREEN PIXELS** ════════════════════════════════
   *
   * ⛔ **IT USED TO BE `shownW`, AND THAT WAS A SECOND CONVERSION.** This component divided it by `W`
   * to get a scale, while the editor positioned every box outline with a scale of its own
   * (`stageW / background.width`, from a `ResizeObserver`). Two numbers for one job, derived from
   * different measurements of the same element — and the operator's instruction after the bug was
   * exact: *"live text and boxes use ONE shared conversion from poster pixels to screen pixels, so
   * they can never separate again."*
   * 🔴 SO THE EDITOR'S OWN `scale` IS PASSED IN. There is nothing left to disagree.
   */
  scale: number
  /**
   * The design's own width in its own pixels — `background.width`, the number `scale` is relative to.
   *
   * ⚠️ **IT IS TAKEN BECAUSE `renderScale` EXISTS, AND IT CANCELS IT.** `weeklyTree` caps the painted
   * longest side at 2160px, so for an oversized blank the tree's coordinates are in a SMALLER space
   * than the design's: `W = designW × renderScale`. The factor that maps the tree onto the stage is
   * therefore `scale × designW / W`, which for every design under 2160px is exactly `scale`.
   * ⛔ BOTH NUMBERS COME FROM THE EDITOR, and they are the two the box outlines already use. Nothing
   * here measures anything, so there is nothing to disagree with.
   */
  designW: number
}

/**
 * ⚠️ `pointer-events-none` ON THE WHOLE THING. The editor's own outlines, handles and hit tests sit on
 * top of this; a text run that swallowed a press would make a box un-draggable wherever a word was.
 */
export function LivePoster({ tree, W, H, scale, designW }: LivePosterProps) {
  if (!(W > 0) || !(H > 0) || !(scale > 0) || !(designW > 0)) return null
  /* 🔴 ONE LINE, AND IT IS THE WHOLE CONVERSION. A tree coordinate is `x × renderScale`; it must land
   * at `x × scale`; and `renderScale` is `W / designW`. So `k = scale × designW / W` — which is
   * `scale` itself for every design whose longest side is under 2160px. */
  const k = (scale * designW) / W
  return (
    <div data-live-poster
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width: `${W}px`,
        height: `${H}px`,
        transform: `scale(${k})`,
        /* ══ 🔴 **INLINE, AND THIS IS THE BUG THAT PUT IT HERE** ═══════════════════════════════════
         *
         * ⛔ IT WAS THE TAILWIND CLASS `origin-top-left`, AND THE CLASS WAS NOT IN THE STYLESHEET THE
         * PAGE WAS HOLDING. Tailwind emits only the utilities it finds in the source *at build time*,
         * and `origin-top-left` is used by exactly one file in this repository — this one, created the
         * same day. The dev server rescanned and emitted it; **every compiled chunk under
         * `.next/static` has no such rule at all.**
         * 🔴 WITH NO RULE, `transform-origin` FALLS BACK TO ITS DEFAULT — the element's CENTRE. Scaling
         * a 1080×1350 layer about its centre instead of its corner throws its contents towards the
         * bottom-right and pushes the lower rows outside the stage's `overflow-hidden`. Which is
         * precisely what was reported: *"the box is at the TOP-LEFT but its words are drawn at the
         * BOTTOM-RIGHT, cut off at the poster's edge"*, and *"all seven rows show NO words at all"*.
         * Measured: the heading's words land at (540, 464) in a 460×575 stage, and row 7's at (361,
         * 916) — 341px below the bottom edge.
         * ⛔ **SO A LOAD-BEARING GEOMETRIC PROPERTY DOES NOT GO IN A CLASS.** A colour that goes missing
         * is a cosmetic regression; a `transform-origin` that goes missing moves every word on the
         * poster. It belongs in the same place as the `transform` it governs, where nothing can decide
         * not to emit it. */
        transformOrigin: 'top left',
        /* 🔴 EVERY DESCENDANT IS BORDER-BOX, BECAUSE SATORI IS. See the header: without this a picture
         * box with a border is drawn wider here than in the PNG. */
        boxSizing: 'border-box',
      }}>
      {/* ⚠️ A SCOPED RULE RATHER THAN A CLASS ON EVERY NODE: the nodes come from the shared tree and
        * this component must not start adding classes to them. */}
      <style>{`[data-live-poster] *{box-sizing:border-box;margin:0;padding:0}`}</style>
      {nodes(tree, 'r')}
    </div>
  )
}
