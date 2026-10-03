// lib/weekly-post/backgrounds.ts — which picture a single-event post is drawn on, and what may be one.
//
// ── 🔴 THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────────────────────────
// A truck places three boxes ONCE, on their default picture, and from then on every event post uses
// those coordinates. So a place picture or a one-off picture must be **the same shape** as the default,
// or the boxes land somewhere else entirely — over a face, off the edge, across the logo — with no
// error anywhere, because a box at (x, y) is perfectly valid on any canvas.
//
// Two rules follow, and they are the whole of this file:
//   1. **ONE ORDER OF PREFERENCE**, decided in one place: a picture for THIS event beats a picture for
//      THIS PLACE beats the default.
//   2. **THE SHAPE MUST MATCH**, within 1%, and the picture is then drawn at the default's exact size.
//
// ⚠️ PURE. It takes rows the caller already has and returns a decision; no database, no network, no
// image decoding. The harness drives every branch with plain objects.

/** A stored picture: a path in the private `post-designs` bucket, and its pixel size. */
export interface StoredImage {
  path: string
  width: number | null
  height: number | null
}

export type BackgroundSource = 'event' | 'place' | 'default'

export interface BackgroundChoice {
  source: BackgroundSource
  path: string
  /** The size the picture is stored at. */
  width: number | null
  height: number | null
}

export interface ResolveBackgroundInput {
  /** The design's default picture. Required — there is no event post without one. */
  fallback: StoredImage
  /** This place's own picture, if it has one. */
  place?: StoredImage | null
  /** A picture uploaded for this one event, if there is one. */
  event?: StoredImage | null
}

const usable = (i: StoredImage | null | undefined): i is StoredImage =>
  !!i && typeof i.path === 'string' && i.path.trim().length > 0

/**
 * Which picture this post is drawn on.
 *
 * 🔴 ONE-OFF > PLACE > DEFAULT, and the order is the point. It reads as "the most specific thing
 * anyone said about this post wins": an upload made *for this event* is the most deliberate act
 * available, so nothing may override it; a place picture is a standing instruction about one venue; the
 * default is what is true when nobody has said anything else.
 *
 * ⚠️ IT RETURNS THE CHOICE, NOT THE BYTES, and names the source — so the modal can show which one is
 * selected without re-deriving the rule, and the two can never disagree about what is on screen.
 */
export function resolveBackground(input: ResolveBackgroundInput): BackgroundChoice {
  if (usable(input.event)) return { source: 'event', ...input.event }
  if (usable(input.place)) return { source: 'place', ...input.place }
  return { source: 'default', ...input.fallback }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHAPE RULE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** How far a picture's aspect ratio may differ from the default's. The brief's number. */
export const ASPECT_TOLERANCE = 0.01

export type AspectCheck =
  | { ok: true; ratio: number; defaultRatio: number }
  | { ok: false; error: string; ratio: number; defaultRatio: number }

/**
 * Does this picture match the default's shape?
 *
 * 🔴 COMPARED AS A RATIO, NOT AS PIXELS, so a truck may export at any resolution — 1080×1350 and
 * 2160×2700 are the same poster — and the picture is then scaled to the default's exact size so the
 * boxes land identically. Requiring the same pixel dimensions would reject a correct export for being
 * sharper.
 *
 * ⚠️ THE TOLERANCE IS RELATIVE, NOT ABSOLUTE. 1% of 0.8 is 0.008, and 1% of 1.78 is 0.0178 — a fixed
 * ±0.01 would be strict on portrait and loose on landscape. Dividing by the default's own ratio makes
 * "within 1%" mean the same thing on any shape.
 *
 * ⚠️ THE MESSAGE NAMES THE DEFAULT'S SIZE, because "export it at the same size" is only actionable if
 * the truck is told which size that is. It is the brief's wording.
 */
export function checkAspect(
  width: number,
  height: number,
  defaultWidth: number,
  defaultHeight: number,
): AspectCheck {
  const ratio = width / height
  const defaultRatio = defaultWidth / defaultHeight
  if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(defaultRatio) || defaultRatio <= 0) {
    return { ok: false, ratio, defaultRatio, error: 'That picture’s size could not be read.' }
  }
  const drift = Math.abs(ratio - defaultRatio) / defaultRatio
  if (drift > ASPECT_TOLERANCE) {
    return {
      ok: false, ratio, defaultRatio,
      error: `This picture is a different shape from your default (${defaultWidth}×${defaultHeight}). Export it at the same size.`,
    }
  }
  return { ok: true, ratio, defaultRatio }
}

/**
 * Which of a truck's place pictures stopped fitting when the default was replaced.
 *
 * 🔴 THEY ARE KEPT, NOT DELETED — the brief's rule, and the right one: a truck who re-exports their
 * default in a new shape has not asked to throw away the per-place artwork they made, and deleting it
 * on their behalf is not recoverable. They are reported by name and skipped until replaced, so a post
 * is never drawn on a picture whose boxes would land in the wrong place.
 */
export function placePicturesThatNoLongerFit(
  places: readonly { id: string; name: string; image: StoredImage | null }[],
  defaultWidth: number,
  defaultHeight: number,
): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = []
  for (const p of places) {
    const img = p.image
    if (!usable(img) || !img.width || !img.height) continue
    if (!checkAspect(img.width, img.height, defaultWidth, defaultHeight).ok) {
      out.push({ id: p.id, name: p.name })
    }
  }
  return out
}

/**
 * Is this stored picture safe to draw on?
 *
 * ⚠️ A PICTURE WITH NO RECORDED SIZE IS NOT USED. Size is what proves the shape matches; without it
 * the only honest answer is to fall back to the default, which is always the right shape by definition.
 */
export function fitsDefault(img: StoredImage | null | undefined, defaultWidth: number, defaultHeight: number): boolean {
  if (!usable(img) || !img.width || !img.height) return false
  return checkAspect(img.width, img.height, defaultWidth, defaultHeight).ok
}
