// scripts/_longer-intervals-order-page.cjs — the edits the collection-time work of 12 November 2026 made to the customer
// order page — longer-intervals (45 and 60) and collection-anchor-1 (the grid counted from the event's start; the backup
// picker built from generateCollectionTimes; the "Around" estimate on that grid) — as exact text: NEW (what the page holds
// now) and OLD (what it held at ae7ff8b4, the commit before the first of them). Read by harnesses that pin the order page to
// an older tree (costs-accounts-1, cwv-2): they put OLD back in place of NEW and require the file to be exactly ae7ff8b4's —
// so only these edits are excused, and any other change to the page still fails. Generated from git (`git diff ae7ff8b4`).
const FILE = "app/(app)/trucks/[slug]/order/page.tsx"
const BASE = 'ae7ff8b4'
const HUNKS = [
 [
  "import { toggleWithGroupRules, validateModifierSelection, minRequiredForGroup, sortGroupsRequiredFirst, groupRuleLabel } from '@/lib/modifier-rules';\nimport { generateCollectionTimes, firstGridTimeAtOrAfter } from '@/lib/slot-generation'\nimport { currencySymbol as currencySymbolOf, formatMajorOrBare, formatMinorOrBare, type MoneyFormat } from '@/lib/money-format'\n",
  "import { toggleWithGroupRules, validateModifierSelection, minRequiredForGroup, sortGroupsRequiredFirst, groupRuleLabel } from '@/lib/modifier-rules';\nimport { clockGridMinutes } from '@/lib/slot-generation'\nimport { currencySymbol as currencySymbolOf, formatMajorOrBare, formatMinorOrBare, type MoneyFormat } from '@/lib/money-format'\n"
 ],
 [
  "const HOURS = Array.from({ length: 13 }, (_, i) => String(i + 9).padStart(2, '0'))\n// \ud83d\udd34 THE HARDCODED MINUTE LIST IS GONE (16 September 2026). The fallback picker's times now come from\n// `generateCollectionTimes` in lib/slot-generation.ts \u2014 the SAME function the server's grid uses (start-anchored\n// since collection-anchor-1) \u2014 so the two cannot disagree at any interval. (`MINUTES` had no reader besides its own definition.)\nconst cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)\n",
  "const HOURS = Array.from({ length: 13 }, (_, i) => String(i + 9).padStart(2, '0'))\n// \ud83d\udd34 THE HARDCODED MINUTE LIST IS GONE (16 September 2026). The fallback picker's minutes now come from\n// `clockGridMinutes(interval)` in lib/slot-generation.ts \u2014 the SAME rule the server's grid uses \u2014 so the\n// two cannot disagree at any interval. The old list agreed with the server only because the server was\n// start-anchored and every start was a 5-minute mark. (`MINUTES` had no reader besides its own definition.)\nconst cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)\n"
 ],
 [
  "\n  // \ud83d\udd34 THE BACKUP PICKER'S TIMES \u2014 straight from the ONE grid function the server uses (generateCollectionTimes,\n  // lib/slot-generation.ts): the event's start, start + interval, \u2026 to its end, at the SELECTED EVENT'S interval\n  // (a two-van truck offers a different grid per event). Used only when /api/slots has no list. collection-anchor-1\n  // (12 November 2026): this replaced the hour \u00d7 minute lists (and their hour-by-hour workaround for 45), so this\n  // picker and the server cannot disagree at any interval or start time. No event times: 10:00\u201323:59, as before.\n  const backupTimes = useMemo(() => {\n    const iv = event?.collection_interval_mins ?? 5\n    const [from, to] = event?.start_time && event?.end_time ? [event.start_time, event.end_time] : ['10:00', '23:59']\n    return generateCollectionTimes(from, to, iv, iv, 0).map(r => r.collection_time)\n  }, [event])\n",
  "\n  // Calculate available hours from event times (customer-facing only)\n  const availableHours = useMemo(() => {\n    if (!event?.start_time || !event?.end_time) {\n      // Fallback if no event hours: 10:00-23:00\n      return Array.from({length:14}, (_,i) => String(i+10).padStart(2,'0'))\n    }\n    \n    const [startH] = event.start_time.split(':').map(Number)\n    const [endH] = event.end_time.split(':').map(Number)\n    \n    const hours: string[] = []\n    // \ud83d\udd34 AN EVENT THAT RUNS PAST MIDNIGHT (lib/event-window.ts): its end hour is the next day's, so the walk runs on\n    // through 23 and wraps (20 \u2026 23, 00). Any other event: the loop below, unchanged.\n    if (crossesMidnight(event.start_time, event.end_time)) {\n      for (let h = startH; h <= endH + 24; h++) {\n        const hh = String(h % 24).padStart(2, '0')\n        if (!hours.includes(hh)) hours.push(hh)\n      }\n      return hours\n    }\n    for (let h = startH; h <= endH; h++) {\n      hours.push(String(h).padStart(2, '0'))\n    }\n    return hours\n  }, [event])\n"
 ],
 [
  "  }, [event])\n\n",
  "  }, [event])\n\n  // Filter minutes based on first/last hour of event\n  const availableMinutes = useMemo(() => {\n    // \ud83d\udd34 FROM THE SHARED RULE, NOT A LOCAL LIST. At 5 this is exactly the twelve entries this used to\n    // hard-code; at 15 it is :00/:15/:30/:45 \u2014 the same clock-anchored multiples /api/slots generates.\n    // \ud83d\udd34 THE SELECTED EVENT'S interval, not the truck's \u2014 a two-van truck offers a different grid per\n    // event, and this picker is only ever used for the event being ordered against.\n    const allMinutes = clockGridMinutes(event?.collection_interval_mins ?? 5)\n    \n    if (!event?.start_time || !event?.end_time || !slotHour) {\n      return allMinutes\n    }\n    \n    const [startH, startM] = event.start_time.split(':').map(Number)\n    const [endH, endM] = event.end_time.split(':').map(Number)\n    const selectedH = parseInt(slotHour)\n    \n    // First hour: filter out minutes before start\n    if (selectedH === startH) {\n      return allMinutes.filter(m => parseInt(m) >= startM)\n    }\n    \n    // Last hour: filter out minutes after end\n    if (selectedH === endH) {\n      return allMinutes.filter(m => parseInt(m) <= endM)\n    }\n    \n    // Middle hours: all minutes available\n    return allMinutes\n  }, [event, slotHour])\n\n"
 ],
 [
  "\n    // ceil-to-grid: the first time ON THE EVENT'S GRID (start-anchored, collection-anchor-1) at or after the floor \u2014 never\n    // rounded DOWN below it. At interval 5 on a 5-minute-mark start this is the old next-5-minute rounding exactly.\n    const roundedMins = onClock(firstGridTimeAtOrAfter(eventStartMins, asapMins, event.collection_interval_mins ?? 5))\n    const h = Math.floor(roundedMins / 60)\n",
  "\n    const roundedMins = onClock(Math.ceil(asapMins / 5) * 5) // ceil-to-grid (next 5-min slot), never round DOWN below the floor\n    const h = Math.floor(roundedMins / 60)\n"
 ],
 [
  "                    // derive from the one prep floor. (Was: estimate ahead of asapSlot \u2192 the divergence.)\n                    const asapTime = backwardAsap || asapSlot || customerAsapTime || backupTimes[0] || null\n                    const isSelected = asapChosen\n",
  "                    // derive from the one prep floor. (Was: estimate ahead of asapSlot \u2192 the divergence.)\n                    const asapTime = backwardAsap || asapSlot || customerAsapTime || (availableHours.length > 0\n                      ? `${availableHours[0]}:${availableMinutes[0] || '00'}`\n                      : null)\n                    const isSelected = asapChosen\n"
 ],
 [
  "                      // customerAsapTime ESTIMATE, so the picker floor == the displayed ASAP.\n                      const asapTime = backwardAsap || asapSlot || customerAsapTime || backupTimes[0] || null\n                      const hasChosenTime = !asapChosen && selectedSlot\n",
  "                      // customerAsapTime ESTIMATE, so the picker floor == the displayed ASAP.\n                      const asapTime = backwardAsap || asapSlot || customerAsapTime || (availableHours.length > 0 ? `${availableHours[0]}:${availableMinutes[0] || '00'}` : null)\n                      const hasChosenTime = !asapChosen && selectedSlot\n"
 ],
 [
  "                                  ))\n                              : backupTimes\n                                  // the event's own grid (start-anchored, the server's rule), from the ASAP time on\n                                  .filter(time => !asapTime || evMins(time) >= evMins(asapTime))\n                                  .map(time => <option key={time} value={time}>{formatSlot(time, pageTs)}</option>)\n                            }\n",
  "                                  ))\n                              : availableHours.flatMap(h =>\n                                  availableMinutes\n                                    .filter(m => {\n                                      const time = `${h}:${m}`\n                                      if (!asapTime) return true\n                                      return evMins(time) >= evMins(asapTime)\n                                    })\n                                    .map(m => {\n                                      const time = `${h}:${m}`\n                                      return <option key={time} value={time}>{formatSlot(time, pageTs)}</option>\n                                    })\n                                )\n                            }\n"
 ]
]
/** The page's text with these edits undone, or null when a NEW is not there exactly once. */
function undo(text) {
  let t = text
  for (const [n, o] of HUNKS) { if (t.split(n).length !== 2) return null; t = t.replace(n, o) }
  return t
}
module.exports = { FILE, BASE, HUNKS, undo }
