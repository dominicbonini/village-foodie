# US screenshots

These scripts make the three US images used on the landing pages:

| Image | What it shows | Size |
|---|---|---|
| `customer-order-us.png` | The customer order page on an iPhone | 1284×2778 |
| `dashboard-v4-us.png` | The operator dashboard, "Add order" tab, on an iPad | 800×551 |
| `kitchen-us.png` | The kitchen screen (KDS) on an iPad | 640×480 |

Each one is the real page, rendered from a US fixture truck (USD, en-US words, 12-hour times, US dates). It is then framed like the matching GB capture in `public/screenshots/` (`customer-order.png`, `dashboard-v4.png`, `kitchen.png`), at the same pixel size. The status bar and Safari bar are the GB capture's own pixels, with the clock repainted. The clock and date are fixed in the scripts, not taken from "now".

## Re-run

```sh
npx next build                                  # only if .next/ is missing or out of date
node scripts/screenshots/us-screens.cjs         # writes to a new temp dir, printed at the end
node scripts/screenshots/us-screens.cjs ~/Desktop/us-shots          # or to a folder you choose
node scripts/screenshots/us-screens.cjs ~/Desktop/us-shots --keep   # also keep the intermediates
```

The scripts never write into `public/` and refuse an output folder inside it. To replace a committed image, look at the new one and copy it into `public/screenshots/` yourself.

## Prerequisites

- `node_modules` installed. The scripts use Playwright's **WebKit** (install it with `npx playwright install webkit` if it is missing), `sharp` (installed with Next), and `esbuild` through `scripts/_render-kit.cjs`.
- A production build in `.next/`. The pages are painted with its compiled CSS and fonts (`.next/static`), so build after any style change.
- **No dev server needed.** Each render starts its own throwaway static server on 127.0.0.1 and closes it when done. Nothing touches a database or the network: the render kit stubs Supabase.
- The render kit caches its bundles in `node_modules/.cache/us-screens-*`.

## Files

`us-screens.cjs` runs six steps in order, each in its own Node process. The intermediates go to a temp work dir, which is deleted afterwards unless you pass `--keep`.

1. `order-us.cjs` → `order-web.png`, then `frame-order.cjs` → `customer-order-us.png`
2. `dash-us.cjs` → `dash-web.png`, then `frame-dash.cjs` → `dashboard-v4-us.png`
3. `kds-us.cjs` → `kds-web.png`, then `frame-kds.cjs` → `kitchen-us.png`

Helpers used by those steps:

- `common.cjs`: paths, the compiled CSS, and the local static server
- `compose.cjs`: the phone frame
- `frame-ipad.cjs`: the iPad frame
- `bbox.cjs`: measures the GB clock so the repainted clock matches its size and position

You can run a single step by hand: `node scripts/screenshots/<step>.cjs <workDir> [outDir]`. The frame steps need `outDir`.

## Expected differences

When you re-run, the order and kitchen images come out byte-identical to the committed ones. The dashboard image differs by a few hundred faint pixels. The cause is the pulsing orange pending-orders badge, which is caught at a different moment of its animation on each run.

## Not part of the harness sweep

These scripts are not harnesses. They are not listed in `scripts/harnesses.json` and are not run by `scripts/run-harnesses.cjs`. Being in a subfolder, they also stay out of that runner's drift check, which only scans the top level of `scripts/`.
