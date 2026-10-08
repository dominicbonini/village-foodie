// lib/weekly-post/caption-chips.ts — the caption template editor's chips, as DOM operations.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS IS ITS OWN MODULE (10 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ **THE BUG THAT MADE IT ONE.** Dominic: *"i went into edit template for weekly post. i tried to
// delete the 'list of days' from the template but it cleared all the template."* The chips are
// `contenteditable="false"` spans inside a `contenteditable` host, and `SocialPosts.tsx`'s own comment
// claimed that "every engine treats such an element as ONE character — Backspace deletes it whole".
// That is true of Chromium. **It is not true of WebKit**, which is the engine this product is used in:
// Safari selects the host, or deletes far past the element, when Backspace meets a non-editable inline
// child. The feature was written and checked in the engine that happens to do it for you.
//
// 🔴 SO THE DELETE IS OURS NOW, AND IT LIVES HERE RATHER THAN INSIDE THE COMPONENT — because a
// behaviour that differs BETWEEN ENGINES has to be driven in a real one to be believed, and a handler
// closed over a React ref cannot be. `scripts/caption-chips-render.cjs` loads this module into WebKit
// and Chromium, puts a caret against a chip, presses a real Backspace and reads the template back.
//
// ⚠️ EVERY FUNCTION HERE IS A **DOM** FUNCTION AND NOTHING ELSE. No React, no state, no fetch — it is
// handed a host element and asked a question about it, which is what makes it drivable from a fixture.
// ⛔ IT MUST NOT BE IMPORTED BY ANYTHING THAT RUNS ON THE SERVER: it touches `window.getSelection` and
// `document`. The template's own grammar — tokens, labels, parsing — is `./caption-template.ts`, which
// is pure and shared with the renderer.

import { isCaptionLabel, parseCaptionTemplate, CAPTION_LABELS, type CaptionLabelId } from './caption-template'

/** The attribute every chip carries. ⚠️ One constant, so the writer and the readers cannot drift. */
export const CHIP_ATTR = 'data-caption-chip'

/**
 * One chip's HTML.
 *
 * ⛔ THE LABEL IS THE **PRODUCT'S OWN** STRING, never anything a truck typed, so there is nothing here
 * to escape. A chip built from operator text would need escaping and would be a reason not to build
 * HTML at all.
 */
export function captionChipHtml(id: CaptionLabelId, label: string): string {
  return `<span contenteditable="false" ${CHIP_ATTR}="${id}"`
    + ` class="mx-0.5 inline-block rounded-md bg-orange-100 px-1.5 py-0.5 align-baseline`
    + ` text-[11px] font-bold text-orange-800 select-none">${label}</span>`
}

/** The editor's HTML for a stored template. ⚠️ Text is escaped; chips are the product's own markup. */
export function captionHtml(template: string): string {
  const esc = (t: string) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    /* ⚠️ NEWLINES BECOME `<br>`. A `contentEditable` div renders `\n` as a space, so a caption's own
     * line breaks would vanish on the first load and come back as one long paragraph. */
    .replace(/\n/g, '<br>')
  return parseCaptionTemplate(template).map(p => (
    p.kind === 'text'
      ? esc(p.text)
      : captionChipHtml(p.id, CAPTION_LABELS.find(l => l.id === p.id)?.label ?? p.id)
  )).join('')
}

/**
 * Read an editor (or a copied fragment) back as a stored template.
 *
 * ⛔ IT WALKS THE NODES RATHER THAN READING `innerText`, because `innerText` would give the chips'
 * LABELS ("List of days") and not their tokens — the caption would save as the words a chip displays
 * and the next load would show them as plain text. ⚠️ AND `<div>`/`<br>` BOTH MEAN A NEWLINE: WebKit
 * wraps a new line in a `<div>` and Chromium inserts a `<br>`, so a reader that knew only one would
 * lose every line break in the other engine.
 */
export function captionFromDom(host: HTMLElement): string {
  let out = ''
  /* ⚠️ `topLevel` WAS A PARAMETER AND IS GONE: both of its arms did the same thing by the time the
   * newline rule settled ("start a line, but only when something has been written"), so it was a
   * distinction the code made and never used. */
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 /* TEXT_NODE */) { out += child.textContent ?? ''; continue }
      if (!isElement(child)) continue
      const chip = child.getAttribute(CHIP_ATTR)
      if (chip && isCaptionLabel(chip)) { out += `{${chip}}`; continue }
      if (child.tagName === 'BR') { out += '\n'; continue }
      /* ⚠️ A BLOCK ELEMENT STARTS A NEW LINE — but only when something has already been written. A
       * leading newline on the first block would prepend a blank line to every caption ever edited. */
      const block = child.tagName === 'DIV' || child.tagName === 'P'
      if (block && out && !out.endsWith('\n')) out += '\n'
      walk(child)
    }
  }
  walk(host)
  return out
}

/** ⚠️ `instanceof HTMLElement` IS NOT USED: a fixture may build nodes in another realm. */
const isElement = (n: Node): n is HTMLElement => n.nodeType === 1

const chipOf = (n: Node | null): HTMLElement | null =>
  n && isElement(n) && n.hasAttribute(CHIP_ATTR) ? n : null

/**
 * The chip a delete key would act on, or null.
 *
 * 🔴 IT WORKS ON **NODES**, NOT ON TEXT. "What is immediately before the caret" is a DOM question, and
 * answering it over the serialised template would mean guessing where the caret was.
 * ⚠️ THREE SHAPES, AND ALL THREE ARE ORDINARY: the caret can sit at the edge of a text node, between
 * two children of an element, or the operator can have SELECTED the chip — which is what clicking one
 * does in WebKit.
 */
export function chipBeside(host: HTMLElement, dir: 'back' | 'forward'): HTMLElement | null {
  const sel = host.ownerDocument.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!host.contains(range.startContainer)) return null

  if (!range.collapsed) {
    /* ⚠️ EXACTLY ONE CHIP AND NOTHING ELSE. A selection that spans a chip AND some words is an
     * ordinary delete, and the browser is better at those than we are. */
    const kids = Array.from(range.cloneContents().childNodes)
    const onlyChip = kids.length === 1 && chipOf(kids[0])
    if (!onlyChip) return null
    return Array.from(host.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}]`))
      .find(el => range.intersectsNode(el)) ?? null
  }

  const node = range.startContainer
  const off = range.startOffset
  let before: Node | null = null
  let after: Node | null = null
  if (node.nodeType === 3) {
    if (off === 0) before = node.previousSibling
    if (off === (node.textContent ?? '').length) after = node.nextSibling
  } else {
    before = node.childNodes[off - 1] ?? null
    after = node.childNodes[off] ?? null
  }
  return chipOf(dir === 'back' ? before : after)
}

/**
 * Handle one Backspace/Delete. Returns true when it removed a chip and the caller must `preventDefault`.
 *
 * ⛔ **ONLY THE CHIP CASE.** Every other press — a letter, a selected run of words, a line break — is
 * handed straight back to the browser, which is still the thing that should be doing it. A handler that
 * took over editing entirely would be the rich-text editor this feature exists to avoid.
 * ⚠️ THE CARET IS PUT WHERE THE CHIP WAS, so a second press deletes the next thing along — which is
 * what "deletes like a character" means.
 */
export function handleChipDeleteKey(host: HTMLElement, key: string): boolean {
  if (key !== 'Backspace' && key !== 'Delete') return false
  const chip = chipBeside(host, key === 'Backspace' ? 'back' : 'forward')
  if (!chip) return false
  const parent = chip.parentNode
  const index = parent ? Array.from(parent.childNodes).indexOf(chip) : -1
  chip.remove()
  if (parent && index >= 0) {
    const view = host.ownerDocument.defaultView
    const sel = view?.getSelection()
    const range = host.ownerDocument.createRange()
    range.setStart(parent, Math.min(index, parent.childNodes.length))
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  return true
}

/**
 * What is selected, as a stored template — so the clipboard carries `{day-list}` and not "List of days".
 *
 * ⛔ **THIS IS HOW A CHIP MOVES.** Without it the clipboard took the chip's LABEL, because that is the
 * text the span displays: cutting a chip and pasting it two lines down replaced a token with three
 * ordinary words, and the caption quietly stopped filling that part in. ⚠️ Paste turns tokens back into
 * chips (`captionHtml`), so cut-and-paste is a move and a template pasted from an email arrives whole.
 */
export function selectionAsTemplate(host: HTMLElement): string {
  const sel = host.ownerDocument.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const holder = host.ownerDocument.createElement('div')
  holder.appendChild(sel.getRangeAt(0).cloneContents())
  return captionFromDom(holder)
}

/** Does this pasted text contain a token the editor should draw as a chip? */
export const hasCaptionToken = (text: string): boolean =>
  parseCaptionTemplate(text).some(p => p.kind === 'label')
