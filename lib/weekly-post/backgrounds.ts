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
  /* 🔴 DELEGATES TO `resolveDesign` so the order of preference exists exactly once. Stage 2b made the
   * same decision about text positions as well; if this kept its own three lines, the picture and the
   * positions could be chosen by two rules that drifted apart. The layout is passed as null and
   * discarded — a caller of this function is asking only "which picture". */
  const r = resolveDesign({
    standard: { image: input.fallback, layout: null },
    place: usable(input.place) ? { placeId: '', image: input.place, layout: null } : null,
    oneOff: input.event ?? null,
  })
  return { source: r.source, path: r.image.path, width: r.image.width, height: r.image.height }
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2b · ONE RESOLVER FOR THE PICTURE **AND** THE TEXT POSITIONS
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ── 🔴 WHY THIS REPLACES `resolveBackground` RATHER THAN SITTING BESIDE IT ─────────────────────────
// Stage 2 chose a picture and always used Standard's text positions. That fails for a truck like
// Kezmet, whose picture for each venue already has the venue name printed on it and is laid out
// differently — so the positions have to travel WITH the picture, and anything that chose one without
// the other could pair a Lavenham background with Sudbury's box positions.
//
// `resolveBackground` is kept as the picture-only answer for callers that genuinely only want that,
// and is now implemented in terms of this one, so the order of preference exists in a single place.

/** A place's own design: its picture, and optionally its own text positions. */
export interface PlaceDesign {
  placeId: string
  image: StoredImage | null
  /** 🔴 NULL MEANS "same text positions as Standard" — today's behaviour, unchanged. */
  layout: unknown | null
}

export interface ResolveDesignInput {
  /** The Standard design: its picture and its layout. Required — there is no event post without one. */
  standard: { image: StoredImage; layout: unknown }
  /** This event's place, if it has a design at all. */
  place?: PlaceDesign | null
  /** A picture uploaded for this one event. Never carries its own positions. */
  oneOff?: StoredImage | null
  /** The truck forced a source in the modal. */
  force?: BackgroundSource | null
}

export interface ResolvedDesign {
  source: BackgroundSource
  /** The picture to draw on. */
  image: StoredImage
  /** The layout to draw with — Standard's, or the place's own. */
  layout: unknown
  /** Which design the POSITIONS came from, which is not always where the picture came from. */
  layoutSource: 'standard' | 'place'
}

/**
 * The picture and the positions, decided together.
 *
 * 🔴 ONE-OFF > PLACE > STANDARD, as stage 2, and the positions follow:
 *   • a PLACE with its own layout brings its picture **and** its positions;
 *   • a PLACE with no layout brings its picture and uses Standard's positions (today's behaviour);
 *   • a ONE-OFF upload brings only a picture, and uses whichever positions it would otherwise have
 *     had — the place's if the place has its own, else Standard's. That is why the upload must match
 *     that design's shape, not always the default's.
 *
 * 🔴 FORCING "standard" IN THE MODAL TAKES STANDARD'S PICTURE **AND** ITS POSITIONS. Taking Standard's
 * picture with a place's positions would put text where that place's artwork has room and Standard's
 * does not — which is the whole failure this feature exists to prevent.
 */
export function resolveDesign(input: ResolveDesignInput): ResolvedDesign {
  const placeLayout = input.place && input.place.layout ? input.place.layout : null
  const placeImage = usable(input.place?.image) ? (input.place!.image as StoredImage) : null

  /* ⚠️ THE POSITIONS THE EVENT WOULD USE WITHOUT A ONE-OFF. Computed first, because a one-off inherits
   * them — it replaces the picture, never the design. */
  const inheritedLayout = placeLayout ?? input.standard.layout
  const inheritedSource: 'standard' | 'place' = placeLayout ? 'place' : 'standard'

  if (input.force === 'default') {
    return { source: 'default', image: input.standard.image, layout: input.standard.layout, layoutSource: 'standard' }
  }
  if (input.force === 'place' && placeImage) {
    return { source: 'place', image: placeImage, layout: inheritedLayout, layoutSource: inheritedSource }
  }

  if (usable(input.oneOff) && (input.force === 'event' || !input.force)) {
    return { source: 'event', image: input.oneOff as StoredImage, layout: inheritedLayout, layoutSource: inheritedSource }
  }
  if (placeImage) {
    return { source: 'place', image: placeImage, layout: inheritedLayout, layoutSource: inheritedSource }
  }
  /* ⚠️ A PLACE CAN HAVE ITS OWN POSITIONS AND NO PICTURE OF ITS OWN — the truck set the boxes up and
   * then removed the picture. The positions still apply, over Standard's picture, because that is what
   * they asked for and the alternative is silently ignoring half their design. */
  return { source: 'default', image: input.standard.image, layout: inheritedLayout, layoutSource: inheritedSource }
}

/**
 * Which design a one-off upload for this event must match the shape of.
 *
 * 🔴 NOT ALWAYS THE DEFAULT. If the place has its own positions, the one-off takes those positions, so
 * it must be the shape of THAT design's picture. Checking it against Standard would accept a picture
 * whose boxes then land in the wrong place — the exact bug the shape rule exists to prevent.
 */
export function oneOffMustMatch(input: {
  standard: StoredImage
  place?: PlaceDesign | null
}): StoredImage {
  const hasOwnPositions = !!(input.place && input.place.layout)
  const placeImage = usable(input.place?.image) ? (input.place!.image as StoredImage) : null
  return hasOwnPositions && placeImage ? placeImage : input.standard
}

/**
 * Does a picture for this PLACE need to match the default's shape?
 *
 * 🔴 ONLY WHEN THE PLACE USES STANDARD'S POSITIONS. A place with its own positions may use a picture of
 * any shape — that is the point of stage 2b — and is bounded only by the ≥600px short side every
 * upload has. A place on Standard's positions keeps stage 2's 1% rule exactly.
 */
export function placePictureNeedsDefaultShape(place: { layout: unknown | null } | null | undefined): boolean {
  return !(place && place.layout)
}
