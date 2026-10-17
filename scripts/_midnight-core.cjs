// scripts/_midnight-core.cjs — area "core" of scripts/midnight-events.cjs: the shared primitives the rule changed
// (lib/slot-generation generateCollectionTimes, lib/slot-utils isSlotPast/getAsapSlot, lib/prep-utils resolveCollectionTime,
// lib/time-utils pickDefaultEventByTime/hasValidEventTimes). A MODULE. Views call the REAL modules on both codes (BEFORE
// has no lib/event-window.ts; extra arguments are ignored there).
const STUBS = { '@/lib/van-category-settings': 'export async function readVanCategorySettings() { return {} }\nexport function resolveCategories() { return [] }' }

async function views({ kit, FIX }) {
  const M = await kit.bundle('midnight-core', [
    "export { generateCollectionTimes } from '@/lib/slot-generation'",
    "export { isSlotPast, getAsapSlot } from '@/lib/slot-utils'",
    "export { resolveCollectionTime } from '@/lib/prep-utils'",
    "export { pickDefaultEventByTime, hasValidEventTimes } from '@/lib/time-utils'",
  ].join('\n'), { stubs: STUBS })
  const out = {}
  const safe = (id, f) => { try { out[id] = f() } catch (e) { out[id] = 'ERROR ' + String(e && e.message || e).slice(0, 200) } }
  for (const [kind, ev, moments] of [['normal', FIX.NORMAL, FIX.NORMAL_MOMENTS], ['midnight', FIX.MIDNIGHT, FIX.MIDNIGHT_MOMENTS]]) {
    const grid = M.generateCollectionTimes(ev.start_time.slice(0, 5), ev.end_time.slice(0, 5), 15, 15, 30)
    for (const cc of ['GB', 'US']) {
      const tz = FIX.COUNTRIES[cc].tz
      kit.setDeviceTz(tz)
      safe(`${kind}|${cc}|-|grid`, () => grid)
      for (const [label, ymd, hhmm] of moments) {
        kit.setNow(FIX.utcOf(cc, ymd, hhmm))
        const p = `${kind}|${cc}|${label}`
        const slots = grid.map(r => ({ collection_time: r.collection_time, available: true, is_grace: false }))
        const evArg = { start_time: ev.start_time, end_time: ev.end_time }
        safe(`${p}|past`, () => grid.map(r => [r.collection_time, M.isSlotPast(r, tz, FIX.EVENT_DATE, evArg)]))
        safe(`${p}|asap`, () => (M.getAsapSlot(slots, FIX.EVENT_DATE, tz, evArg) || {}).collection_time || null)
        const slot = kind === 'normal' ? '12:45' : '00:15'
        safe(`${p}|resolve`, () => { const d = M.resolveCollectionTime({ slot, event_date: FIX.EVENT_DATE }, { event_date: FIX.EVENT_DATE, ...evArg }, tz); return d && d.toISOString() })
        const other = { event_date: FIX.NEXT_DATE, start_time: '12:00:00', end_time: '15:00:00', id: 'next' }
        safe(`${p}|default`, () => { const e = M.pickDefaultEventByTime([{ event_date: FIX.EVENT_DATE, ...evArg, id: 'this' }, other], tz); return e && e.id })
      }
      safe(`${kind}|${cc}|-|valid`, () => M.hasValidEventTimes(ev.start_time.slice(0, 5), ev.end_time.slice(0, 5)))
    }
  }
  out['normal|GB|-|valid-equal'] = M.hasValidEventTimes('20:00', '20:00')
  out['normal|GB|-|valid-missing'] = M.hasValidEventTimes('20:00', null)
  return out
}

function checks(t, A) {
  const g = A['midnight|GB|-|grid'] || []
  const times = Array.isArray(g) ? g.map(r => r.collection_time) : []
  t('core: the 20:00–00:30 grid runs 20:00 … 23:45, 00:00 … 00:30, then the 30-min grace (canonical "HH:MM", in order)',
    times[0] === '20:00' && times.includes('23:45') && times.indexOf('00:00') === times.indexOf('23:45') + 1 && times.includes('00:30') && times.every(x => /^\d{2}:\d{2}$/.test(x) && x < '24'), times.join(' '))
  t('core: production slots are canonical and follow their collection times', Array.isArray(g) && g.every(r => /^\d{2}:\d{2}$/.test(r.production_slot)))
  for (const cc of ['GB', 'US']) {
    const past = m => Object.fromEntries(A[`midnight|${cc}|${m}|past`] || [])
    t(`core ${cc}: at 19:00 nothing is past`, Object.values(past('19:00')).every(v => v === false))
    t(`core ${cc}: at 23:50 20:00–23:45 are past; 00:00–00:30 are not`, past('23:50')['23:45'] === true && past('23:50')['00:00'] === false && past('23:50')['00:15'] === false)
    t(`core ${cc}: at 00:15 (next day) 00:00 is past, 00:15 and 00:30 are not`, past('00:15')['00:00'] === true && past('00:15')['00:15'] === false && past('00:15')['00:30'] === false)
    t(`core ${cc}: at 00:31 every slot up to 00:30 is past`, ['20:00', '23:45', '00:15', '00:30'].every(s => past('00:31')[s] === true))
    t(`core ${cc}: ASAP at 23:50 is 00:00 (the first slot not past); at 00:15 it is 00:15`, A[`midnight|${cc}|23:50|asap`] === '00:00' && A[`midnight|${cc}|00:15|asap`] === '00:15', [A[`midnight|${cc}|23:50|asap`], A[`midnight|${cc}|00:15|asap`]])
    const want = FIX_utc(cc, '2026-10-01', '00:15')
    t(`core ${cc}: a 00:15 order resolves to 00:15 on the NEXT day in the truck's zone`, A[`midnight|${cc}|23:50|resolve`] === want, [A[`midnight|${cc}|23:50|resolve`], want])
    t(`core ${cc}: the default event is this one while it runs (23:50, 00:15), the next one after it ends (00:31)`,
      A[`midnight|${cc}|23:50|default`] === 'this' && A[`midnight|${cc}|00:15|default`] === 'this' && A[`midnight|${cc}|00:31|default`] === 'next',
      ['19:00', '23:50', '00:15', '00:31'].map(m => A[`midnight|${cc}|${m}|default`]))
    t(`core ${cc}: 20:00–00:30 is a valid event now`, A[`midnight|${cc}|-|valid`] === true)
  }
  t('core: an end EQUAL to the start is still refused (kept as before; a decision for Dominic)', A['normal|GB|-|valid-equal'] === false)
}
function FIX_utc(cc, ymd, hhmm) { return require('./_midnight-fixtures.cjs').utcOf(cc, ymd, hhmm).replace(/\.\d{3}Z$/, '.000Z') }

module.exports = { views, checks }
