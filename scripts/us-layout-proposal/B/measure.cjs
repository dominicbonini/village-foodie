// scripts/us-layout-proposal/B/measure.cjs — the in-browser measurement for group B (dashboard + KDS) of the US
// layout proposal. `measure` is passed to page.evaluate as a function, so it may only use browser globals.
// Built from the audit's scripts/us-layout-audit/B-ops/measure.cjs, narrowed to what fixes 6–10 need:
//   per order card / ticket — the order number shown/needed px and the characters it shows, anything drawn over
//   it on row 1 (the Full ticket's Ready badge), row 1's overflow past the header's content box (padding) and
//   past the card (clipped), row 1/row 2 line counts, the customer name shown/needed px and characters shown,
//   the money lines' height, the card's height and whether it is fully on screen;
//   the kitchen-capacity sidebar — row heights, the time's line count and overflow, rows fully visible.
function measure() {
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const R = el => { if (!el) return null; const q = el.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) } }
  const cv = document.createElement('canvas').getContext('2d')
  const fontOf = el => { const cs = getComputedStyle(el); return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` }
  // Natural (max-content) width against the laid-out box, to the sub-pixel (WebKit draws an ellipsis when the text
  // is a fraction of a pixel too wide, which scrollWidth does not see).
  const natural = el => {
    const st = el.style; const keep = [st.width, st.flex, st.maxWidth, st.minWidth]
    const box = el.getBoundingClientRect().width
    st.width = 'max-content'; st.flex = 'none'; st.maxWidth = 'none'; st.minWidth = '0'
    const nat = el.getBoundingClientRect().width;
    [st.width, st.flex, st.maxWidth, st.minWidth] = keep
    return { box, nat, over: Math.round((nat - box) * 100) / 100 }
  }
  // How many characters a truncating element actually shows: the longest prefix that fits with its "…".
  const charsShown = (el, n) => {
    const text = (el.textContent || '').trim(); const chars = Array.from(text)
    if (n.over <= 0.05) return chars.length
    cv.font = fontOf(el)
    let k = 0; while (k < chars.length && cv.measureText(chars.slice(0, k + 1).join('') + '…').width <= n.box + 0.01) k++
    return k
  }
  // Clipping ancestors: an element is "fully on screen" when it is inside the viewport and inside every ancestor
  // that clips (overflow hidden / auto / scroll).
  const fullyVisible = el => {
    const r = el.getBoundingClientRect()
    if (r.top < -0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) return false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a); if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue
      const q = a.getBoundingClientRect(); if (r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5) return false
    }
    return true
  }
  const lines = el => {   // distinct line tops among an element's children (a wrapped flex row has 2+)
    const tops = []; for (const k of el.children) { if (!vis(k)) continue; const r = k.getBoundingClientRect(); if (!tops.some(t => r.top < t.bottom - 2 && r.bottom > t.top + 2)) tops.push({ top: r.top, bottom: r.bottom }) }
    return Math.max(1, tops.length)
  }
  const out = { vw: innerWidth, vh: innerHeight, docOverflowX: document.documentElement.scrollWidth - innerWidth, cards: [], sidebar: null }
  const NUM = /^#[A-Z]?\d+$/
  for (const c of document.querySelectorAll('div.rounded-2xl.overflow-hidden.flex-col')) {
    if (!vis(c)) continue
    const numEl = [...c.querySelectorAll('span')].find(x => NUM.test((x.textContent || '').trim())); if (!numEl) continue
    const id = numEl.textContent.trim().slice(1)
    const r = c.getBoundingClientRect()
    const hdr = [...c.children].find(k => /\bp[xy]-/.test(k.className) && /#\d/.test(k.textContent || ''))
    const row1 = hdr && hdr.children[0], row2 = hdr && hdr.children[1]
    const ne = natural(numEl)
    const nr = numEl.getBoundingClientRect(); const numInkRight = nr.left + ne.nat
    // Anything on row 1 painted over the number's natural box (the Full ticket's Ready badge / total / PAID).
    let numOverlap = 0, overBy = null
    if (row1) for (const x of row1.querySelectorAll('span')) {
      if (x === numEl || x.contains(numEl) || numEl.contains(x) || !vis(x)) continue
      const q = x.getBoundingClientRect()
      if (q.left > nr.left && q.top < nr.bottom && q.bottom > nr.top && numInkRight - q.left > numOverlap) { numOverlap = numInkRight - q.left; overBy = (x.textContent || '').trim().slice(0, 20) }
    }
    // Row 1's furthest right edge against the header's content box (padding) and the card (clip).
    let row1Right = 0, row1Tail = null
    if (row1) for (const x of row1.querySelectorAll('*')) { if (!vis(x)) continue; const q = x.getBoundingClientRect(); if (q.right > row1Right) { row1Right = q.right; row1Tail = (x.textContent || '').trim().slice(0, 20) } }
    const hcs = hdr && getComputedStyle(hdr); const hr = hdr && hdr.getBoundingClientRect()
    const contentRight = hdr ? hr.right - parseFloat(hcs.paddingRight) - parseFloat(hcs.borderRightWidth) : r.right
    const name = [...c.querySelectorAll('span.truncate')].find(x => x !== numEl && !x.closest('[aria-hidden]')); const nn = name && natural(name)
    const charge = c.querySelector('[data-charge-lines]')
    out.cards.push({
      id, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), fully: fullyVisible(c),
      hdrH: hdr ? Math.round(hr.height) : null,
      row1: row1 ? { h: Math.round(row1.getBoundingClientRect().height), lines: lines(row1), sw: row1.scrollWidth, cw: row1.clientWidth,
        spill: Math.max(0, Math.round((row1Right - contentRight) * 10) / 10), clip: Math.max(0, Math.round((row1Right - r.right) * 10) / 10), tail: row1Tail } : null,
      row2: row2 ? { h: Math.round(row2.getBoundingClientRect().height), lines: lines(row2), text: (row2.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) } : null,
      clipped: c.scrollWidth - c.clientWidth,
      num: { text: numEl.textContent.trim(), shown: Math.round(ne.box * 10) / 10, needs: Math.round(ne.nat * 10) / 10, over: ne.over, chars: charsShown(numEl, ne), of: numEl.textContent.trim().length,
        overlap: Math.round(numOverlap * 10) / 10, overlapBy: overBy },
      name: name ? { text: name.textContent, shown: Math.round(nn.box * 10) / 10, needs: Math.round(nn.nat * 10) / 10, over: nn.over, chars: charsShown(name, nn), of: Array.from(name.textContent.trim()).length } : null,
      chargeH: charge ? Math.round(charge.getBoundingClientRect().height) : 0, chargeText: charge ? (charge.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '',
      numRect: R(numEl), nameRect: R(name), chargeRect: R(charge), row1Rect: R(row1), row2Rect: R(row2), hdrRect: R(hdr),
    })
  }
  out.cardsFully = out.cards.filter(k => k.fully).length
  // The kitchen-capacity sidebar (DayLoadStrip variant="sidebar"): a scroller whose rows start with a tabular time.
  const list = [...document.querySelectorAll('div.overflow-y-auto')].find(d => vis(d) && d.previousElementSibling && d.previousElementSibling.tagName === 'P'
    && d.children.length > 2 && d.children[0].querySelector('span.tabular-nums'))
  if (list) {
    const lr = list.getBoundingClientRect()
    const rows = [...list.children].map(k => {
      const t = k.querySelector('span.tabular-nums'); const q = k.getBoundingClientRect(); const tr = t.getBoundingClientRect()
      const rg = document.createRange(); rg.selectNodeContents(t); const rects = [...rg.getClientRects()].filter(x => x.width > 0)
      const tl = new Set(rects.map(x => Math.round(x.top))).size
      const dot = t.nextElementSibling; const dr = dot && dot.getBoundingClientRect()
      return { h: Math.round(q.height), time: t.textContent, timeW: Math.round(tr.width), timeNeeds: Math.round(natural(t).nat), timeLines: tl,
        timeOverDot: dr ? Math.max(0, Math.round((Math.max(...rects.map(x => x.right)) - dr.left) * 10) / 10) : 0,
        visible: q.top >= lr.top - 0.5 && q.bottom <= lr.bottom + 0.5, rect: { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) },
        label: (k.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50) }
    })
    out.sidebar = { rect: R(list.parentElement), listRect: R(list), rows: rows.length, rowsVisible: rows.filter(x => x.visible).length,
      rowH: [...new Set(rows.map(x => x.h))], timeLines: [...new Set(rows.map(x => x.timeLines))], maxTimeOverDot: Math.max(...rows.map(x => x.timeOverDot)),
      timeW: [...new Set(rows.map(x => x.timeW))], timeNeeds: Math.max(...rows.map(x => x.timeNeeds)), sample: rows.slice(0, 3) }
  }
  return out
}
module.exports = { measure }
