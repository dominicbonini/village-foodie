/**
 * ══ 🔴 §1 · THE SUB-TAB ROW'S SCROLLER ════════════════════════════════════════════════════════════
 *
 * ⛔ **THE BUG THIS EXISTS TO FIX:** *"on a phone the Auto-replies section can't be seen."* Measured in
 * WebKit at 390px, Settings' eight pills come to **951px inside a 390px bar**. The row scrolls, so a
 * pill that is already selected can be hundreds of pixels past the right edge when the screen opens —
 * 'Auto-replies' sat 400px past it and 'Account deletion' 545px.
 *
 * ⚠️ **IT IS ITS OWN MODULE SO IT CAN BE MEASURED.** `SubTabBar` in app/manage/[token]/page.tsx is the
 * only caller, and that file imports half the product — bundling it to put a bar in a browser is not a
 * check anybody would run twice. The arithmetic here is the part that can be wrong, and
 * `scripts/subtab-row.cjs` drives this exact function against a real layout engine. ⛔ IT IS NOT A
 * SECOND COPY: the component calls this and nothing else.
 *
 * ══ ⛔ THE EDGE FADES WERE HERE AND ARE GONE — 10 October 2026, ON REQUEST ═════════════════════════
 * This module also wrote a `data-fade` attribute (`none`/`left`/`right`/`both`) on every scroll and
 * resize, and app/globals.css lit a soft gradient at whichever edge still had pills behind it. Dominic
 * asked for it off. ⚠️ EVERYTHING THAT SUPPORTED IT WENT WITH IT — the scroll listener, the
 * `ResizeObserver` and the fade spans in the component — because a listener that paints nothing is a
 * listener that runs on every frame of every swipe for no reason.
 * ⚠️ WHAT STILL ANSWERS THE ORIGINAL BUG: the selected pill is brought into view below, and the bar
 * snaps to pills so a swipe lands square (`snap-x snap-proximity` + `scroll-pl-4`, in the component).
 */

/** How much of the pill is kept clear of the bar's edge when it is scrolled into view. */
const PAD = 16

/**
 * Bring the selected pill inside the bar's own scrollport.
 *
 * 🔴 **ONLY THE BAR'S OWN `scrollLeft` IS TOUCHED — NEVER AN ANCESTOR.** Scrolling an ancestor to bring
 * a pill into view is what caused the "needs a double-click" bug recorded on Settings' jump effect: the
 * jump scrolled the page to a section, this scrolled the page back to the pill, and the two cancelled.
 * One axis, one element, nothing above it can move.
 *
 * ⚠️ IT IS A NO-OP WHEN THE PILL IS ALREADY IN VIEW, so opening a tab whose first pill is selected does
 * not jolt the row.
 */
export function scrollActiveIntoView(bar: HTMLElement): void {
  const on = bar.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (!on) return
  const right = on.offsetLeft + on.offsetWidth + PAD
  if (on.offsetLeft - PAD < bar.scrollLeft) bar.scrollLeft = Math.max(0, on.offsetLeft - PAD)
  else if (right > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = right - bar.clientWidth
}

/**
 * Attach to one bar. Returns the teardown.
 *
 * ⚠️ **IT RUNS ONCE AND LISTENS TO NOTHING**, which is the whole shape of it since the fades went: the
 * only thing a bar needs on open is its current pill in view, and nothing after that depends on where
 * the operator scrolls to. The teardown is kept so the component's callback ref has one shape whether
 * this grows a listener again or not.
 */
export function attachSubTabScroller(bar: HTMLElement): () => void {
  scrollActiveIntoView(bar)
  return () => {}
}
