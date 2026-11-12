// scripts/_longer-intervals-order-page.cjs — the ONE edit "longer collection times" (12 November 2026) made to the customer
// order page, as exact text: NEW (what the page holds now) and OLD (what it held at ae7ff8b4, the commit before the edit).
// Read by harnesses that pin the order page to an older tree: they put OLD back in place of NEW and require the file to
// be exactly ae7ff8b4's — so only this edit is excused, and any other change to the page still fails. Generated once from
// git (the two hunks of `git diff ae7ff8b4 -- 'app/(app)/trucks/[slug]/order/page.tsx'`); proven by the round trip in undo().
const FILE = "app/(app)/trucks/[slug]/order/page.tsx"
const BASE = 'ae7ff8b4'
const HUNKS = [
 [
  "  // The minutes one HOUR offers, filtered to the event's first/last hour.\n  // 🔴 FROM THE SHARED RULE, NOT A LOCAL LIST. At 5 this is exactly the twelve entries this used to\n  // hard-code; at 15 it is :00/:15/:30/:45 — the same clock-anchored multiples /api/slots generates.\n  // 🔴 THE SELECTED EVENT'S interval, not the truck's — a two-van truck offers a different grid per\n  // event, and this picker is only ever used for the event being ordered against.\n  // 🔴 PER HOUR (12 November 2026): at 45 minutes the grid's minutes differ hour to hour (18:00, 18:45,\n  // 19:30…), so the fallback list asks this for EACH hour instead of reusing one hour's minutes for all.\n  const minutesForHour = useCallback((hh: string | null | undefined): string[] => {\n    const allMinutes = clockGridMinutes(event?.collection_interval_mins ?? 5, hh ? parseInt(hh) : null)\n    if (!event?.start_time || !event?.end_time || !hh) return allMinutes\n    const [startH, startM] = event.start_time.split(':').map(Number)\n    const [endH, endM] = event.end_time.split(':').map(Number)\n    const h = parseInt(hh)\n    if (h === startH) return allMinutes.filter(m => parseInt(m) >= startM)   // first hour: not before start\n    if (h === endH) return allMinutes.filter(m => parseInt(m) <= endM)       // last hour: not after end\n    return allMinutes                                                         // middle hours: all\n  }, [event])\n\n  // The selected hour's minutes (every on-grid minute while no hour is chosen).\n  const availableMinutes = useMemo(() => minutesForHour(slotHour), [minutesForHour, slotHour])\n\n",
  "  // Filter minutes based on first/last hour of event\n  const availableMinutes = useMemo(() => {\n    // 🔴 FROM THE SHARED RULE, NOT A LOCAL LIST. At 5 this is exactly the twelve entries this used to\n    // hard-code; at 15 it is :00/:15/:30/:45 — the same clock-anchored multiples /api/slots generates.\n    // 🔴 THE SELECTED EVENT'S interval, not the truck's — a two-van truck offers a different grid per\n    // event, and this picker is only ever used for the event being ordered against.\n    const allMinutes = clockGridMinutes(event?.collection_interval_mins ?? 5)\n    \n    if (!event?.start_time || !event?.end_time || !slotHour) {\n      return allMinutes\n    }\n    \n    const [startH, startM] = event.start_time.split(':').map(Number)\n    const [endH, endM] = event.end_time.split(':').map(Number)\n    const selectedH = parseInt(slotHour)\n    \n    // First hour: filter out minutes before start\n    if (selectedH === startH) {\n      return allMinutes.filter(m => parseInt(m) >= startM)\n    }\n    \n    // Last hour: filter out minutes after end\n    if (selectedH === endH) {\n      return allMinutes.filter(m => parseInt(m) <= endM)\n    }\n    \n    // Middle hours: all minutes available\n    return allMinutes\n  }, [event, slotHour])\n\n"
 ],
 [
  "                              : availableHours.flatMap(h =>\n                                  // 🔴 45 ONLY asks each hour for its own minutes (they differ hour to hour); every interval\n                                  // that divides an hour keeps the list it always had, byte for byte.\n                                  (60 % (event?.collection_interval_mins ?? 5) === 0 ? availableMinutes : minutesForHour(h))\n",
  "                              : availableHours.flatMap(h =>\n                                  availableMinutes\n"
 ]
]
/** The page's text with this edit undone, or null when NEW is not there exactly once. */
function undo(text) {
  let t = text
  for (const [n, o] of HUNKS) { if (t.split(n).length !== 2) return null; t = t.replace(n, o) }
  return t
}
module.exports = { FILE, BASE, HUNKS, undo }
