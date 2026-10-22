// The AUSTRALIA (au) and NEW ZEALAND (nz) fixtures for the landing screenshots (see README-anz.md in this folder) — and,
// canada-1 (22 October 2026), CANADA (ca): the same three steps, with its own date order and week start (month-first,
// Sunday; AU/NZ keep day-first, Monday, so their images are unchanged).
// One table per country: money, time, phone, venue, customer names and a menu priced the way a pizza truck there
// would price it. The order, dashboard and kitchen steps all read from here, so the three images agree.
//
// Every -anz step takes the country first:  node <step>-anz.cjs <au|nz> <workDir> [outDir]
// `country()` removes it from process.argv, so common.cjs's dirs() still reads <workDir> [outDir] as argv[2], argv[3].

// The menu (the same names on all three screens). Names follow the GB/IE menu, with Meat Lovers (the usual name in
// both countries) for Meat Feast, Sprite (AU) or L&P (NZ) for 7Up.
const PIZZAS = ['BBQ Chicken', 'Calzone', 'Chorizo & Pepper', 'Four Cheese', 'Garden Veggie', 'Garlic Bread', 'Goat’s Cheese', 'Ham & Mushroom', 'Hawaiian',
  'Hot Honey Pepperoni', 'Margherita', 'Marinara', 'Meat Lovers', 'Nduja & Honey', 'Pepperoni', 'Pesto Chicken', 'Spicy Chicken', 'Spicy Salami', 'Supreme',
  'Tandoori Chicken', 'Truffle Mushroom']
const DESSERTS = ['Tiramisu', 'Brownie', 'Cookie']

const C = {
  au: {
    cc: 'AU', locale: 'en-AU', currency: 'AUD', timeZone: 'Australia/Sydney', utcOffset: 10,   // AEST in September (daylight saving starts 4 Oct 2026)
    phone: { phoneCountry: 'AU', short_name: 'Australia', phone_example: '0412 345 678', phoneCheck: 'length' },
    venue: 'Riverside Park', town: 'Parramatta', staff: 'mel@pizzakitchen.example', can: '375ml can.',
    drinks: ['Coke', 'Sprite', 'Fanta', 'Water'],
    // A$: pizzas 22–26, sides 10, drinks 4.50
    price: { 'Margherita': 22, 'Marinara': 22, 'Four Cheese': 23, 'Garden Veggie': 23, 'Ham & Mushroom': 24, 'Hawaiian': 24, 'Calzone': 25, 'BBQ Chicken': 25,
      'Spicy Chicken': 25, 'Chorizo & Pepper': 25, 'Pepperoni': 25, 'Tandoori Chicken': 25, 'Pesto Chicken': 25, 'Spicy Salami': 25, 'Goat’s Cheese': 25,
      'Supreme': 26, 'Meat Lovers': 26, 'Hot Honey Pepperoni': 26, 'Nduja & Honey': 26, 'Truffle Mushroom': 26, 'Garlic Bread': 10,
      'Coke': 4.5, 'Sprite': 4.5, 'Fanta': 4.5, 'Water': 4, 'Tiramisu': 11, 'Brownie': 9, 'Cookie': 5 },
    dashQueue: ['Liam', 'Olivia', 'Jack'], dashName: 'Charlotte',
    kdsNames: ['Liam', 'Olivia', 'Jack', 'Charlotte', 'Noah', 'Mia', 'Lachlan', 'Chloe', 'Isla', 'Cooper', 'Matilda', 'Harrison', 'Ruby', 'Archie', 'Zoe',
      'Hamish', 'Sienna', 'Angus', 'Evie', 'Mitchell'],
  },
  ca: {
    cc: 'CA', locale: 'en-CA', currency: 'CAD', timeZone: 'America/Toronto', utcOffset: -4,   // EDT in September (standard time from 1 Nov 2026)
    dateOrder: 'mdy', weekStart: 'sunday', eventDate: { date: '09/01/2026', friendly: 'Tuesday, September 1' },
    phone: { phoneCountry: 'CA', short_name: 'Canada', phone_example: '416-555-0123', phoneCheck: 'length' },
    venue: 'Trinity Bellwoods Park', town: 'Toronto', staff: 'jess@pizzakitchen.example', can: '355 mL can.',
    drinks: ['Coke', 'Canada Dry', 'Fanta', 'Water'],
    // C$: pizzas 18–22, sides 9, drinks 3 (prices before tax — HST is added at checkout in Ontario)
    price: { 'Margherita': 18, 'Marinara': 18, 'Four Cheese': 19, 'Garden Veggie': 19, 'Ham & Mushroom': 20, 'Hawaiian': 20, 'Calzone': 21, 'BBQ Chicken': 21,
      'Spicy Chicken': 21, 'Chorizo & Pepper': 21, 'Pepperoni': 21, 'Tandoori Chicken': 21, 'Pesto Chicken': 21, 'Spicy Salami': 21, 'Goat’s Cheese': 21,
      'Supreme': 22, 'Meat Lovers': 22, 'Hot Honey Pepperoni': 22, 'Nduja & Honey': 22, 'Truffle Mushroom': 22, 'Garlic Bread': 9,
      'Coke': 3, 'Canada Dry': 3, 'Fanta': 3, 'Water': 2.5, 'Tiramisu': 9, 'Brownie': 7, 'Cookie': 4 },
    dashQueue: ['Liam', 'Priya', 'Noah'], dashName: 'Chloé',
    kdsNames: ['Liam', 'Olivia', 'Noah', 'Chloé', 'Arjun', 'Priya', 'Mateo', 'Zoe', 'Lucas', 'Mei', 'Owen', 'Nadia', 'Félix', 'Ava', 'Hassan', 'Grace',
      'Daniel', 'Aaliyah', 'Ethan', 'Amelia'],
  },
  nz: {
    cc: 'NZ', locale: 'en-NZ', currency: 'NZD', timeZone: 'Pacific/Auckland', utcOffset: 12,   // NZST in early September (daylight saving starts 27 Sep 2026)
    phone: { phoneCountry: 'NZ', short_name: 'New Zealand', phone_example: '021 123 4567', phoneCheck: 'length' },
    venue: 'Frank Kitts Park', town: 'Wellington', staff: 'hana@pizzakitchen.example', can: '330ml can.',
    drinks: ['Coke', 'L&P', 'Fanta', 'Water'],
    // NZ$: pizzas 24–28, sides 11, drinks 5
    price: { 'Margherita': 24, 'Marinara': 24, 'Four Cheese': 25, 'Garden Veggie': 25, 'Ham & Mushroom': 26, 'Hawaiian': 26, 'Calzone': 27, 'BBQ Chicken': 27,
      'Spicy Chicken': 27, 'Chorizo & Pepper': 27, 'Pepperoni': 27, 'Tandoori Chicken': 27, 'Pesto Chicken': 27, 'Spicy Salami': 27, 'Goat’s Cheese': 27,
      'Supreme': 28, 'Meat Lovers': 28, 'Hot Honey Pepperoni': 28, 'Nduja & Honey': 28, 'Truffle Mushroom': 28, 'Garlic Bread': 11,
      'Coke': 5, 'L&P': 5, 'Fanta': 5, 'Water': 4.5, 'Tiramisu': 12, 'Brownie': 10, 'Cookie': 6 },
    dashQueue: ['Aroha', 'Hēmi', 'Ngaio'], dashName: 'Māia',
    kdsNames: ['Aroha', 'Wiremu', 'Māia', 'Tāne', 'Hēmi', 'Ngaio', 'Olivia', 'Rāwiri', 'Isla', 'Jack', 'Mere', 'Oliver', 'Tama', 'Kiri', 'Nīkau', 'Ruby',
      'Manaia', 'George', 'Anahera', 'Charlotte'],
  },
}

/** Takes <au|nz> off process.argv (argv[2]) and returns that country's fixture, with its derived settings. */
function country() {
  const key = String(process.argv[2] || '').toLowerCase()
  if (!C[key]) { console.error(`usage: node ${require('path').basename(process.argv[1])} <au|nz> <workDir> [outDir]  (or run anz-screens.cjs)`); process.exit(2) }
  process.argv.splice(2, 1)
  const c = C[key]
  const money = { currency: c.currency, locale: c.locale }
  const time = { timeZone: c.timeZone, locale: c.locale, timeFormat: '12h', dateOrder: c.dateOrder ?? 'dmy', weekStart: c.weekStart ?? 'monday' }
  return { key, ...c, eventDate: c.eventDate ?? { date: '01/09/2026', friendly: 'Tuesday 1 September' }, money, time, settings: { money: { ...money, localeByCountry: { [c.cc]: c.locale } }, currency: c.currency, country: c.cc, time, phone: c.phone } }
}

/** The UTC instant of a wall-clock time in the country on a given day — checked against Intl, so a wrong offset fails loudly. */
function instant(c, ymd, hhmm) {
  const [y, mo, d] = ymd.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number)
  const t = new Date(Date.UTC(y, mo - 1, d, h - c.utcOffset, mi))
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: c.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(t).map(x => [x.type, x.value]))
  if (`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` !== `${ymd} ${hhmm}`) throw new Error(`${c.timeZone} is not UTC+${c.utcOffset} on ${ymd} — fix utcOffset`)
  return t.toISOString()
}

/** The status-bar clocks, in the country's 12-hour form. The phone's bar shows the time alone ("4:31"); the iPad's adds
 *  the day period and the date in day-month order ("10:21 pm  Tue 1 Sep"). The time comes from Intl in the country's
 *  locale; the date keeps the GB capture's "Sep" (the app's own short-month rule — Intl's en-AU/en-NZ short form is "Sept"). */
function clock(c, iso) {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d)
  const hm = parts.filter(x => x.type === 'hour' || x.type === 'minute' || (x.type === 'literal' && x.value === ':')).map(x => x.value).join('')
  const full = parts.map(x => x.value).join('').replace(/[  ]/g, ' ')
  const wd = new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone, weekday: 'short' }).format(d)
  const day = new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone, day: 'numeric' }).format(d)
  const mon = new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone, month: 'long' }).format(d).slice(0, 3)
  return { phone: hm, ipad: c.dateOrder === 'mdy' ? `${full}  ${wd} ${mon} ${day}` : `${full}  ${wd} ${day} ${mon}` }
}

module.exports = { country, instant, clock, PIZZAS, DESSERTS }
