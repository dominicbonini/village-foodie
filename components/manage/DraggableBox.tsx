'use client'
// components/manage/DraggableBox.tsx — the dashed outline you drag, and the only one.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY IT HAS ITS OWN FILE NOW (6 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// It lived in `components/manage/WeeklyPost.tsx` and was imported out of there by the event screen —
// which worked, and meant that a file about the weekly post exported the drag surface for every design
// screen in the product. With ONE shared editor replacing both screens, the outline is no longer any
// one screen's property. ⛔ AND THERE IS STILL EXACTLY ONE OF IT: its pointer handling took three
// fixes to get right on touch (pointer capture, the clamp to the image, the `data-mode` rule that
// avoids a ref inside a per-handle closure) and a second copy would have to be fixed again.
//
// 🔴 POINTER EVENTS, NOT MOUSE EVENTS. One set of handlers covers mouse, trackpad, pen and touch, and
// `setPointerCapture` keeps the drag attached to this element even when the finger leaves it — which
// on a small box is most of the drag. Mouse handlers plus a separate touch path would be two
// implementations of the same gesture, and the touch one is the one that gets tested last.
//
// ⚠️ `touch-action: none` ON THE STAGE is what stops the browser treating a drag as a page scroll. A
// `preventDefault` in the handler is too late: by then the gesture has been claimed.
//
// ⚠️ THE BOX IS CLAMPED TO THE IMAGE. The validator refuses a box that reaches outside, so letting one
// be dragged there would produce a design that cannot be saved and an error at the end of the work.

import { useRef } from 'react'
import type { BoxRect } from '@/lib/weekly-post/layout'

/** Which centre lines the box is currently snapped to. `null` on either axis = not snapped. */
export interface SnapGuides {
  /** The vertical centre line, in native pixels, when the box is snapped across. */
  v: number | null
  /** The horizontal centre line, in native pixels, when the box is snapped up and down. */
  h: number | null
}

export const NO_GUIDES: SnapGuides = { v: null, h: null }

/**
 * ══ 🔴 SNAP TO THE MIDDLE OF THE PICTURE ══════════════════════════════════════════════════════════
 *
 * ⛔ THE THRESHOLD IS IN **NATIVE** PIXELS AND SCALED BY THE DISPLAY FACTOR, which is the whole
 * subtlety. A fixed 8 native pixels is an 8px pull on a 1080px blank shown at full size and a 2px pull
 * on the same blank shown at a quarter size — so on a phone the snap would be unreachable, and on a
 * 2160px poster it would be a twitch. The threshold the operator FEELS has to be constant on SCREEN,
 * so it is defined on screen and converted in.
 */
const SNAP_SCREEN_PX = 7

/* ⚠️ ONE LIST PER KIND OF HANDLE, so a handle cannot be drawn without being handled — the four side
 * handles below are `.map`ped from `SIDES`, and `move` switches on the same strings. */
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const
const SIDES = ['n', 'e', 's', 'w'] as const
export type DragMode = 'move' | (typeof CORNERS)[number] | (typeof SIDES)[number]
const isSide = (m: DragMode): boolean => (SIDES as readonly string[]).includes(m)

/**
 * ══ 🔴 WHAT A DRAG WAS — THE EDITOR NEEDS TO KNOW, AND ONLY THIS FILE DOES (10 October 2026) ═══════
 *
 * ⛔ A CORNER AND A SIDE ARE TWO DIFFERENT INSTRUCTIONS: a corner makes the WORDS bigger or smaller, a
 * side makes the BOX wider or taller with the words unchanged. The editor has to apply the first to
 * `fontSize` (and, on "The 7 days", to every part inside it) — and it cannot work out which happened
 * from the patch, because a corner drag and a side drag can both produce "w and h changed".
 * 🔴 `factor` IS MEASURED FROM THE **GESTURE'S START**, not from the last frame. Multiplying a factor
 * per frame compounds the rounding — fifty frames of ×1.02 is not ×2.7 — so the editor is handed the
 * ratio against the box the drag began on and applies it to the size the drag began with.
 * ⚠️ THE FACTOR IS THE **HEIGHT'S**. A font size is a vertical measure — it is what decides whether a
 * line still fits — which is the same reasoning `scaleEventLayout` uses to scale sizes by `fy`.
 */
export interface DragInfo {
  kind: 'move' | 'corner' | 'side'
  /** newH / startH, for a corner drag. 1 for everything else. */
  factor: number
}

export function DraggableBox({ label, box, scale, active, bounds, onSelect, onChange, onGuides, locked, tint, onTap, minH = 8 }: {
  label: string
  box: BoxRect
  scale: number
  active: boolean
  bounds: { w: number; h: number }
  onSelect: () => void
  onChange: (patch: Partial<BoxRect>, done: boolean, info?: DragInfo) => void
  /**
   * ══ 🔴 A PRESS THAT DID NOT MOVE — "The 7 days" NEEDS IT (10 October 2026) ═══════════════════════
   *
   * ⛔ THE SEVEN DAYS ARE **ONE** DRAGGABLE BOX WITH TWENTY-EIGHT CLICKABLE CELLS INSIDE IT, and those
   * two requirements fight: cells that take pointer events leave almost nowhere to grab the block, and
   * cells that do not take them cannot be clicked. 🔴 SO THE CELLS ARE DRAWN `pointer-events-none` AND
   * THE **BOX** REPORTS WHERE IT WAS TAPPED — the editor hit-tests the same `dayCells` the renderer
   * draws from, so the part the operator clicks is the part the PNG puts there.
   * ⚠️ "DID NOT MOVE" IS 4 CSS PIXELS, not zero: a tap on a touch screen always moves a little, and a
   * threshold of zero would make this fire for a mouse and never for a finger.
   */
  onTap?: (nativeX: number, nativeY: number) => void
  /** Reported on every move so the stage can draw the thin guide. ⚠️ Cleared on release. */
  onGuides?: (g: SnapGuides) => void
  /** A place on Standard's positions: shown, not moved. */
  locked?: boolean
  /**
   * ══ 🔴 §B5 · THE EDITOR-ONLY TINT BEHIND A TEXT BOX (10 October 2026) ═════════════════════════════
   *
   * ⛔ WHITE WRITING ON A WHITE PICTURE WAS INVISIBLE **WHILE EDITING**. The renderer's readability rule
   * adds a shadow where it is needed, but an operator placing a box on a pale photograph could not see
   * the words they were placing at all — so they were dragging an empty rectangle.
   * 🔴 A LIGHT DARK WASH BEHIND THE BOX (rgba(15,23,42,.28)) MAKES EVERY COLOUR LEGIBLE while the
   * design is open, and it is **never** in the PNG: the renderer knows nothing about it, and this file
   * is not imported by it. ⚠️ TEXT BOXES ONLY — a picture box tinted would misrepresent the picture.
   */
  tint?: boolean
  /**
   * ══ 🔴 THE SMALLEST THIS BOX MAY BE (10 October 2026) ═════════════════════════════════════════════
   *
   * ⛔ **8px IS THE VALIDATOR'S FLOOR FOR A BOX AND IS THE WRONG FLOOR FOR "The 7 days".** That block
   * holds SEVEN rows, and `parseDays` requires each of them to clear the same 8px — so a block dragged
   * to 8px tall would look saveable, and the save would be refused after the work. ⚠️ A DRAG MUST NOT
   * BE ABLE TO PRODUCE A LAYOUT THE VALIDATOR REFUSES; that rule is older than this prop and is why the
   * clamp to the picture exists at all.
   */
  minH?: number
}) {
  const start = useRef<{
    px: number; py: number; box: BoxRect; mode: DragMode
    /** Where in the box the press landed, in native pixels — for `onTap`. */
    tapX: number; tapY: number
    /** Set once the pointer has travelled far enough to be a drag rather than a tap. */
    moved: boolean
  } | null>(null)
  /** ⚠️ CSS pixels, not native: a tap is a thing the finger does, so the threshold is on screen. */
  const TAP_SLOP = 4

  /* ⚠️ THE MODE COMES OFF `data-mode`, NOT FROM A CLOSURE PER HANDLE. Writing
   * `onPointerDown={e => begin(e, m)}` inside the handles' `.map()` creates a new function per handle
   * per render that reaches a ref — which React Compiler's lint rejects ("Passing a ref to a function
   * may read its value during render"). One handler reading the attribute has no closure to capture,
   * and it is also what makes all five pointer handlers below identical. */
  const begin = (e: React.PointerEvent) => {
    if (locked) return
    e.stopPropagation()
    onSelect()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const mode = (el.dataset.mode as DragMode) || 'move'
    /* ⚠️ MEASURED AGAINST THE **BOX**, not the handle, so a press on the box and a press on a handle
     * produce the same coordinate space. A handle press can never be a tap anyway — it is a resize —
     * but a coordinate that means two things depending on what was pressed is a trap for the next
     * reader. */
    const r = (e.currentTarget as HTMLElement).closest('[data-box-outline]')?.getBoundingClientRect()
    start.current = {
      px: e.clientX, py: e.clientY, box, mode, moved: false,
      tapX: box.x + (r ? (e.clientX - r.left) / Math.max(scale, 0.0001) : 0),
      tapY: box.y + (r ? (e.clientY - r.top) / Math.max(scale, 0.0001) : 0),
    }
  }

  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    if (Math.abs(e.clientX - s.px) > TAP_SLOP || Math.abs(e.clientY - s.py) > TAP_SLOP) s.moved = true
    const dx = (e.clientX - s.px) / scale
    const dy = (e.clientY - s.py) / scale
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))
    if (s.mode === 'move') {
      let x = clamp(s.box.x + dx, 0, bounds.w - s.box.w)
      let y = clamp(s.box.y + dy, 0, bounds.h - s.box.h)
      /* 🔴 SNAPPING IS ONLY APPLIED WHILE MOVING, NEVER WHILE RESIZING. A corner drag changes two
       * edges at once; pulling one of them to the centre line would move the OPPOSITE edge as a side
       * effect, so the box would appear to resize from the wrong corner. */
      const tol = SNAP_SCREEN_PX / Math.max(scale, 0.0001)
      const cx = bounds.w / 2, cy = bounds.h / 2
      const wantX = Math.round(cx - s.box.w / 2)
      const wantY = Math.round(cy - s.box.h / 2)
      const snappedX = Math.abs(x - wantX) <= tol
      const snappedY = Math.abs(y - wantY) <= tol
      if (snappedX) x = clamp(wantX, 0, bounds.w - s.box.w)
      if (snappedY) y = clamp(wantY, 0, bounds.h - s.box.h)
      onGuides?.({ v: snappedX ? cx : null, h: snappedY ? cy : null })
      onChange({ x, y }, false, { kind: 'move', factor: 1 })
      return
    }
    /* ⚠️ A MINIMUM OF 8px EACH WAY, matching the validator's floor. A box dragged to zero would be
     * saveable-looking and then rejected. */
    const MIN = 8
    const MIN_H = Math.max(MIN, Math.round(minH))
    let { x, y, w, h } = s.box
    const east = () => { w = clamp(s.box.w + dx, MIN, bounds.w - x) }
    const south = () => { h = clamp(s.box.h + dy, MIN_H, bounds.h - y) }
    const west = () => { const nx = clamp(s.box.x + dx, 0, s.box.x + s.box.w - MIN); w = s.box.x + s.box.w - nx; x = nx }
    const north = () => { const ny = clamp(s.box.y + dy, 0, s.box.y + s.box.h - MIN_H); h = s.box.y + s.box.h - ny; y = ny }
    /* ⚠️ THE CORNERS ARE THE TWO SIDES THEY ARE MADE OF, and are written that way rather than as four
     * more formulas — four copies of "clamp the far edge" is four places for the same off-by-one. */
    if (s.mode === 'se') { east(); south() }
    if (s.mode === 'sw') { west(); south() }
    if (s.mode === 'ne') { east(); north() }
    if (s.mode === 'nw') { west(); north() }
    if (s.mode === 'e') east()
    if (s.mode === 'w') west()
    if (s.mode === 's') south()
    if (s.mode === 'n') north()
    onChange({ x, y, w, h }, false, {
      kind: isSide(s.mode) ? 'side' : 'corner',
      /* 🔴 AGAINST THE GESTURE'S START BOX. See `DragInfo`. ⚠️ A zero-height start box cannot happen —
       * the validator's floor is 8 — but the guard costs nothing and `Infinity` reaching a font size
       * would be a poster-sized bug. */
      factor: s.box.h > 0 ? h / s.box.h : 1,
    })
  }

  /* 🔴 THE BACKGROUND IS RE-SAMPLED ON RELEASE, NOT ON EVERY MOVE. Sampling is a canvas draw and a
   * `getImageData` per frame otherwise, and the answer only matters once the box has stopped. */
  const end = () => {
    const s = start.current
    if (!s) return
    start.current = null
    onGuides?.(NO_GUIDES)
    /* 🔴 A TAP IS NOT A DRAG, AND MUST NOT CLOSE ONE. `onChange({}, true)` is what re-samples the
     * background and ends the history step; a press that never moved opened neither, so reporting it
     * as a finished drag would push an undo step for standing still. */
    if (!s.moved && s.mode === 'move' && onTap) { onTap(s.tapX, s.tapY); return }
    onChange({}, true)
  }

  /* ⛔ TOMBSTONE · `hidden` — ADDED 9 OCTOBER 2026, REMOVED 10 OCTOBER. It returned `null` for the
   * editor's "👁 Preview" MODE, which is gone: the finished post opens over the top as an overlay now,
   * so there is no state the poster can be left in and nothing to hide. The reasoning that `null` beats
   * `display: none` for "not there" still stands and is worth keeping if a mode ever returns. */

  if (locked) {
    /* A read-only outline: the positions come from Standard and are shown, not moved. */
    return (
      <div className="absolute border border-dashed border-slate-400/70 rounded pointer-events-none"
        style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }} />
    )
  }

  const HANDLE = 'absolute w-6 h-6 -m-3 rounded-full bg-white border-2 border-orange-500 shadow touch-none'
  /* ⚠️ A SIDE HANDLE IS A **BAR**, NOT A CIRCLE, and that is the whole affordance: a round handle at a
   * corner says "both ways", a bar in the middle of an edge says "this way". */
  const SIDE_HANDLE = 'absolute rounded bg-white border-2 border-orange-500 shadow touch-none'
  const rect = { left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }

  /* ══ 🔴 ONLY THE SELECTED BOX IS DRAWN LOUDLY (9 October 2026) ════════════════════════════════════
   *
   * ⛔ EVERY BOX HAD A 2px DASHED `white/70` OUTLINE AND A PERMANENT BLACK NAME LABEL. On a weekly
   * design that is eleven outlines and eleven labels over the truck's own artwork — **a second design
   * on top of their design**, and the operator could not see what they were making. The labels were the
   * worse half: they are opaque, they sit outside their box, and on a 1080px-wide poster scaled to
   * 440px they overlap each other.
   * 🔴 SO: THE SELECTED BOX KEEPS ITS SOLID ORANGE OUTLINE, ITS HANDLES AND ITS LABEL. Every other box
   * is a 1px dashed `white/25` hairline with **no label** — enough to find, not enough to read the
   * poster through. ⚠️ HOVER BRINGS ITS NAME BACK, which is what makes a hairline usable: you can still
   * identify a box without selecting it.
   * ⚠️ `group` / `group-hover` RATHER THAN `useState`, deliberately: eleven boxes each holding a hover
   * flag is eleven re-renders during a mouse sweep across the poster, and the answer is purely visual.
   */
  return (
    <div
      data-mode="move"
      data-box-outline={active ? 'selected' : 'faint'}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      /* ══ 🔴 §B5 · A TWO-TONE DASHED OUTLINE, SO IT IS VISIBLE ON ANY PICTURE ═══════════════════════
        * ⛔ A WHITE HAIRLINE DISAPPEARS ON A WHITE PICTURE AND A DARK ONE DISAPPEARS ON A DARK ONE —
        * and a truck's artwork is reliably one or the other. The border is white and dashed; the
        * `outline` is a thin dark edge OUTSIDE it, drawn by the browser rather than by a second
        * element, so the pair is legible on both and costs no extra node. */
      className={`group absolute touch-none cursor-move outline outline-1 ${active
        ? 'border-2 border-orange-500 outline-slate-900/40'
        : 'border border-dashed border-white/70 outline-slate-900/50 hover:border-white'}`}
      style={{ ...rect, ...(tint ? { backgroundColor: 'rgba(15,23,42,.28)' } : {}) }}
      data-box-tint={tint ? 'on' : undefined}
    >
      {/* ⚠️ THE LABEL IS ALWAYS IN THE TREE and is `hidden` until hover on an unselected box, so a
        * hover does not cause a React render. ⛔ `pointer-events-none` ON IT, or the label — which sits
        * OUTSIDE its box — would swallow a drag aimed at the box above. */}
      <span data-box-label
        className={`pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-bold ${active
          ? 'bg-orange-500 text-white'
          : 'hidden bg-black/50 text-white group-hover:block'}`}>{label}</span>
      {active && CORNERS.map(m => (
        <span key={m} className={HANDLE} data-mode={m} data-handle={m}
          style={{
            left: m === 'nw' || m === 'sw' ? 0 : '100%',
            top: m === 'nw' || m === 'ne' ? 0 : '100%',
          }}
          onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      ))}
      {/* ══ 🔴 §B6 · FOUR SIDE HANDLES — "wider or taller, words unchanged" ════════════════════════
        * ⛔ THERE WERE ONLY CORNERS, so the only way to make a box wider was to make it taller too —
        * and on a box whose text is centred, that moved the words. A long venue name needs a WIDER
        * box; that was not a thing the editor could do. */}
      {active && SIDES.map(m => {
        const vertical = m === 'n' || m === 's'
        return (
          <span key={m} className={SIDE_HANDLE} data-mode={m} data-handle={m}
            style={{
              left: m === 'w' ? 0 : m === 'e' ? '100%' : '50%',
              top: m === 'n' ? 0 : m === 's' ? '100%' : '50%',
              width: vertical ? 22 : 8,
              height: vertical ? 8 : 22,
              marginLeft: vertical ? -11 : -4,
              marginTop: vertical ? -4 : -11,
              cursor: vertical ? 'ns-resize' : 'ew-resize',
            }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        )
      })}
    </div>
  )
}
