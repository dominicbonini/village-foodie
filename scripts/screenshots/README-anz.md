# Australia (AU) and New Zealand (NZ) screenshots

These scripts make the three landing-page images for Australia and for New Zealand. One set of scripts does both countries: you pass `au` or `nz`. They are the AU/NZ twins of the US scripts (`README.md`) and the IE scripts (`README-ie.md`), and they leave those untouched.

| Image | What it shows | Size |
|---|---|---|
| `customer-order-<au\|nz>.png` | The customer order page on an iPhone | 1284×2778 |
| `dashboard-v4-<au\|nz>.png` | The operator dashboard, "Add order" tab, on an iPad | 800×551 |
| `kitchen-<au\|nz>.png` | The kitchen screen (KDS) on an iPad | 640×480 |

Each one is the real page, rendered from a fixture truck called Pizza Kitchen. The fixtures are in `anz-fixtures.cjs`:

| | Australia | New Zealand |
|---|---|---|
| Money | AUD, `en-AU` | NZD, `en-NZ` |
| Time | Australia/Sydney, 12-hour, day-month-year, week starts Monday | Pacific/Auckland, 12-hour, day-month-year, week starts Monday |
| Phone | `0412 345 678` | `021 123 4567` |
| Venue | Riverside Park, Parramatta | Frank Kitts Park, Wellington |
| Prices | pizzas $22–26, garlic bread $10, drinks $4.50 | pizzas $24–28, garlic bread $11, drinks $5 |
| Names | Liam, Olivia, Charlotte, Lachlan, Matilda… | Aroha, Māia, Hēmi, Tāne, Rāwiri, Nīkau… |

The words come from the app's own `en-AU` and `en-NZ` catalogues. The app prints the money, the times and the dates itself. The scripts write no currency symbols or times by hand.

## The clock is repainted in 12-hour form

The GB captures show a 24-hour clock. Australia and New Zealand use the 12-hour clock, so the frames repaint it the way the US frames do. The pages are rendered at the GB capture's own times, in local time, on Tue 1 Sep 2026 (Sydney UTC+10, Auckland UTC+12):

- the order page shows `4:31` (the iPhone's status bar has no am/pm)
- the dashboard shows `10:21 pm  Tue 1 Sep`
- the kitchen screen shows `9:08 pm  Tue 1 Sep`

The time comes from Intl in the country's locale. The date keeps the GB capture's "Sep", which is also the app's own short-month rule (Intl's en-AU/en-NZ short form is "Sept").

## Re-run

```sh
node scripts/screenshots/anz-screens.cjs au                       # writes to a new temp dir, printed at the end
node scripts/screenshots/anz-screens.cjs nz docs/anz-1 --keep     # or to a folder you choose, keeping the intermediates
```

The prerequisites are the same as for the US scripts: a `.next/` build, Playwright WebKit and `sharp`. The scripts need no dev server and never touch a database or the network. They never write into `public/`. To replace a committed image, check the new one and copy it in yourself. The bundles are cached in `node_modules/.cache/anz-screens-*`.

## Files

`anz-screens.cjs <au|nz>` runs six steps, each in its own Node process, and each takes the country as its first argument:

1. `order-anz.cjs` → `order-web-<cc>.png`, then `frame-order-anz.cjs` → `customer-order-<cc>.png`
2. `dash-anz.cjs` → `dash-web-<cc>.png`, then `frame-dash-anz.cjs` → `dashboard-v4-<cc>.png`
3. `kds-anz.cjs` → `kds-web-<cc>.png`, then `frame-kds-anz.cjs` → `kitchen-<cc>.png`

You can run a single step by hand: `node scripts/screenshots/<step>.cjs <au|nz> <workDir> [outDir]`. They reuse `common.cjs`, `compose.cjs`, `frame-ipad.cjs` and `bbox.cjs` without changing them. The dashboard and kitchen fixtures start from the GB fixture in `scripts/_lp1b-fixtures.cjs` (`country('GB')`), with the country's money, time and phone settings laid over it.

## Known differences between AU and NZ

- `en-AU` says "pickup" ("Pay at the truck at pickup", "Mark paid & picked up"). `en-NZ` has no override for these words yet, so it falls back to en-GB's "collection" ("Pay at the truck on collection", "Mark paid & collected").
- These pages use the system font stack (`ui-sans-serif`). WebKit draws the Māori macrons (ā ē ī) in that font, with no fallback.
- The dashboard image differs by a few faint pixels between runs, because of the pulsing pending-orders badge (the same as for the US and IE images).
