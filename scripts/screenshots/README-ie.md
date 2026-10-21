# Ireland (IE) screenshots

These scripts make the three Irish images for the landing pages. They are the IE twins of the US scripts (see `README.md`), which they leave untouched.

| Image | What it shows | Size |
|---|---|---|
| `customer-order-ie.png` | The customer order page on an iPhone | 1284×2778 |
| `dashboard-v4-ie.png` | The operator dashboard, "Add order" tab, on an iPad | 800×551 |
| `kitchen-ie.png` | The kitchen screen (KDS) on an iPad | 640×480 |

Each one is the real page, rendered from an IE fixture truck. The truck uses EUR, the `en-IE` locale (its words fall back to en-GB today), Europe/Dublin time, a 24-hour clock, day-month-year dates and Irish phone settings (`085 123 4567`). The content is Irish: euro prices, British/Irish spelling, Irish customer names (Aoife, Ciarán, Róisín and so on) and People's Park, Limerick as the venue.

## The clock is kept as captured

The GB captures in `public/screenshots/` already show a 24-hour clock with the date in day-month order:

- the order page shows 16:31
- the dashboard shows 22:21, Tue 1 Sep
- the kitchen screen shows 21:08, Tue 1 Sep

The IE renders are set to those same times in Dublin on Tue 1 Sep 2026 (Irish Summer Time, UTC+1). Nothing is repainted:

- **Phone:** `frame-order-ie.cjs` keeps the GB status bar exactly as captured, and fails if the clock pixels differ.
- **iPad:** `frame-dash-ie.cjs` and `frame-kds-ie.cjs` draw no clock. Instead they lay the GB file's own clock pixels over the status bar, the same way the icons on the right are copied.

## Re-run

```sh
node scripts/screenshots/ie-screens.cjs                        # writes to a new temp dir, printed at the end
node scripts/screenshots/ie-screens.cjs docs/ireland-1 --keep  # or to a folder you choose, keeping the intermediates
```

The prerequisites are the same as for the US scripts: a `.next/` build, Playwright WebKit and `sharp`. The scripts do not need a dev server and never touch a database or the network. They never write into `public/`, so to replace a committed image, check the new one and copy it in yourself. The bundles are cached in `node_modules/.cache/ie-screens-*`.

## Files

`ie-screens.cjs` runs six steps, each in its own Node process:

1. `order-ie.cjs` → `order-web-ie.png`, then `frame-order-ie.cjs` → `customer-order-ie.png`
2. `dash-ie.cjs` → `dash-web-ie.png`, then `frame-dash-ie.cjs` → `dashboard-v4-ie.png`
3. `kds-ie.cjs` → `kds-web-ie.png`, then `frame-kds-ie.cjs` → `kitchen-ie.png`

They reuse `common.cjs`, `compose.cjs`, `frame-ipad.cjs` and `bbox.cjs` without changing them. The dashboard and kitchen fixtures start from the GB fixture in `scripts/_lp1b-fixtures.cjs` (`country('GB')`), with Ireland's money, time and phone settings laid over it.

## Expected differences

- The order and kitchen images come out byte-identical on every run.
- The dashboard image differs by a few faint pixels between runs, because of the pulsing pending-orders badge (the same as for the US image).
