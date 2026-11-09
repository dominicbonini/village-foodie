# meta-sdk-1: Meta's SDK sends no automatic events

*9 November 2026. Committed on main, not pushed; nothing deployed. No database read or write; no SQL run. No `.env*` file touched.*

## Summary

- **The change:** `lib/whatsapp/embedded-signup.ts` now calls `FB.init` with **`autoLogAppEvents: false`** and **`xfbml: false`**. That is the only change to the product.
  - Embedded Signup works as before: `FB.login` opens Meta's window in the operator's click, and the code arrives in its callback.
  - The manage page is untouched, as you decided (option A).
- **The proof:** a new harness, `scripts/meta-sdk-1.cjs`, passes **15/15** in Chromium and WebKit, with no network. It runs the real library on a fixture test truck's setup flow and shows:
  - the only Meta request before the click is the SDK script itself;
  - `FB.init` receives false / false;
  - no other Meta endpoint is called;
  - the click opens the Embedded Signup window while the click's user activation is live.
- **The live check:** a by-hand run against Meta's real SDK confirms the same (§4).
- **Other checks:** all five existing WhatsApp harnesses pass, and the full sweep result is in §5.
- **Meta in the privacy forms:** "Data used to track you: none" (App Store) and "not shared" (Play) can now be answered plainly. The exact lines are in §6.

## 0 · Flags

- **No span of either brief arrived garbled.**
- **One contradiction in the first brief, resolved by you.**
  - DO #2 (load the SDK only on the click) needed a change in `app/(app)/manage/[token]/page.tsx`, whose `WhatsAppSetupControl` loads the SDK on mount and opens Meta's window synchronously in the click.
  - The rules forbade touching that file, and another session had uncommitted edits in it.
  - You chose **(A) only:** the two flags, the harness and this report; (B) was dropped.
  - So **the SDK script still downloads when the WhatsApp setup panel renders** for any truck whose plan grants WhatsApp replies (§3).
- **Another session (`village-foodie-e6`) is editing the shared tree:**
  - its files: the email sender, the manage page, the dashboard and kitchen pages, the demo / setup files, messages, and `scripts/harnesses.json`;
  - I touched none of its files;
  - `scripts/harnesses.json` held its uncommitted lines too, so **my six lines were committed alone**, by applying a patch built against HEAD to the index (`git apply --cached`); its edits stay uncommitted in the working copy;
  - the sweep was run in a clean worktree of my commit, so its in-progress work couldn't affect the result.
- **Pizzeria Gusto was not used.** The manage page's own comment notes that Gusto's Settings tab loads the SDK too, because its trial grants WhatsApp. After this change it still loads but sends nothing automatically. Every test here used a fixture test truck on the render stand-in, or a local page.

## 1 · The change

| Option | Before | Now | Why |
|---|---|---|---|
| `autoLogAppEvents` | `true` | **`false`** | With `true`, Meta's SDK logs app events (a page view on initialisation) from the operator's Settings screen, without any action by the operator. Embedded Signup does not need them. |
| `xfbml` | `true` | **`false`** | XFBML makes the SDK scan the page for `<fb:…>` social-plugin markup (Like buttons, comments). **HatchGrab has none** (§3), so it only scanned the DOM. |
| `appId`, `version` | unchanged | unchanged | |

- **What the flow still needs, all unchanged:** `FB.login` with the config id, `response_type: 'code'` and the v4 `extras`; the `message` listener for the session; the code in the callback.
- **Why the comment sits beside the code:** a later reader who re-enables either flag sees why they are off, and `meta-sdk-1.cjs` fails if either flag is anything but `false`.

## 2 · Proof

**`scripts/meta-sdk-1.cjs`** (registered in the sweep; 15/15). No network: Meta's script is answered by a local stand-in that records `FB.init` and opens Meta's dialog the way `FB.login` does.

- **The source:**
  - `FB.init` is called with `autoLogAppEvents: false, xfbml: false`, and with no other option set to true.
  - `lib/whatsapp/embedded-signup.ts` is the only browser code that loads anything from Meta. There is no Meta Pixel, `fbevents.js`, `fbq(` or `facebook.com/tr` anywhere in `app/`, `components/`, `lib/` or `public/`.
  - No XFBML markup exists anywhere.
  - `graph.facebook.com` is called only from server code.
  - The manage page still loads on mount and calls `startEmbeddedSignup` synchronously in its click (unchanged).
- **The behaviour, in Chromium and WebKit.** The real library, bundled for the browser, runs on a page that makes the manage page's two calls in its order: `loadFacebookSdk` on mount, then `startEmbeddedSignup` in the click with no await. It does this for a fixture test truck.
  - Before the click, the **only** Meta request is `connect.facebook.net/en_US/sdk.js`.
  - `FB.init` received `autoLogAppEvents: false` and `xfbml: false`, plus the app id and Graph version.
  - The click **opens the Embedded Signup window**: Meta's OAuth dialog with the config id, `response_type=code` and the v4 extras.
  - **`FB.login` runs while the click's user activation is live** (`navigator.userActivation.isActive`). That is what lets Safari open the window.
  - **No request to any other Meta endpoint** (graph.facebook.com, facebook.com/tr, …) happens before or after the click.
  - Every other request is aborted, so nothing leaves the machine.

**Why a fixture page, not the real Settings tab.** No agent holds a manage token or admin session for the test truck (manual 35.af), and the setup control is internal to the manage page, which this brief keeps closed. So the harness drives the real library exactly as that control does, and its source check proves the control still does exactly that.

## 3 · Everything that loads Meta or Facebook code (DO #3)

| Where | What | Runs in |
|---|---|---|
| `lib/whatsapp/embedded-signup.ts` | Meta's JavaScript SDK (`connect.facebook.net/en_US/sdk.js`), injected once per page. Called only from the manage page's WhatsApp setup control, which loads it **when that panel renders**, for trucks whose plan grants WhatsApp replies (the control mounts even when its button is hidden on a working connection). Now with no automatic logging and no XFBML. | the operator's browser / the app's WebView, Manage › Settings only |
| `app/api/manage/whatsapp-signup/route.ts`, `app/api/manage/route.ts`, `lib/meta-whatsapp.ts`, `lib/whatsapp/meta-admin.ts` | `graph.facebook.com`: the WhatsApp Cloud API (code exchange, subscribed apps, sending replies) | **server to server**, never the browser |
| Meta's webhooks (`app/api/webhooks/meta/whatsapp`, `…/messenger`) | inbound from Meta | server |

- **Nothing else:**
  - no Meta Pixel and no `fbq`;
  - no Facebook login, Like or share widgets;
  - no XFBML;
  - no Instagram embed;
  - nothing on the public pages, the landing, the web dashboard or the kitchen screen.
- The weekly post hands an image to the operating system's share sheet; it loads nothing from Meta.

## 4 · The real SDK, by hand: `scripts/meta-sdk-1-live.cjs`

- **Setup:** Meta's real SDK from `connect.facebook.net`, Chromium, a placeholder app id (the real one is configuration I don't read), 8 seconds of watching every request to a Meta host after `FB.init`.

| | Meta requests before any click |
|---|---|
| **ours** (`false` / `false`, the real library) | `sdk.js` and its own `bundle/sdk.js`: script files only, **no event endpoint** |
| **control** (the old `true` / `true`) | the same two files |

- **What this does and doesn't show.**
  - With a placeholder app id, Meta logged nothing in either case, so this run cannot show the difference the flag makes.
  - The proof that no automatic events are sent is the flag itself, which is Meta's documented switch for automatic app-event logging, and which `meta-sdk-1.cjs` holds at `false`.
  - The live run shows that, with our settings, the SDK fetched only its own code before the operator acted.
- **The click opened Meta's real dialog.** Here it was Meta's "invalid app id" page, which is enough to prove the window opens from the click. The requests after the click (`impression.php`, `ajax/bz`, Meta's cookie-notice images) came from Meta's own page inside that window, which the operator opened.
- Listed in `harnesses.json`'s by-hand group: it uses the network, so the sweep never runs it.

## 5 · Checks

- **`meta-sdk-1`:** 15/15.
- **The five WhatsApp harnesses, all green:**

| Harness | Result |
|---|---|
| `whatsapp-setup-machine-harness` | 30/30 |
| `whatsapp-settings-row-harness` | 131/131 |
| `whatsapp-connection-view-harness` | 87/87 |
| `whatsapp-golive-parity-harness` | 25/25 |
| `whatsapp-background-jobs-harness` | 48/48 |

- **No other harness pins the old flags.**
- **Lint:** `embedded-signup.ts` shows 3 `no-explicit-any` errors. All three were already there before this change (the same 3 at the previous commit). The two new scripts are clean.
- **Full sweep** (`node scripts/run-harnesses.cjs`), run in a **clean worktree of `25340ca5`**: **207 harnesses, 206 passed, 1 failed.** The failure is `event-types-render`, the dashboard measurement that was already failing before these briefs. `meta-sdk-1` and all five WhatsApp harnesses pass in it.

## 6 · Meta in the privacy forms, on this basis

**Since this change, Meta receives no app events and no identifier from HatchGrab's code.** What Meta can still see is:
- **When the WhatsApp setup panel renders** (Manage › Settings, trucks with WhatsApp replies on): the ordinary HTTP request for its script files. That carries the device's IP address and user agent, and the page's origin as referrer, as for any CDN file. No account id, no event and no truck data are sent.
- **When the operator taps "Set up" and signs in to Meta in Meta's own window:** whatever the operator gives Meta there, between the operator and Meta. We receive the one-time code and ids in the callback.

**App Store, App Privacy (App Store Connect › App Privacy):**

| Question | Answer for Meta |
|---|---|
| **Data used to track you** | **None.** Meta receives no app events, no device or advertising identifier, and no data linked to the operator from our code. HatchGrab has no IDFA or ATT, `NSPrivacyTracking` is false, and nothing is combined with third-party data for advertising. |
| Third-party partners in your app | Meta's SDK does not collect any of Apple's data types on our behalf now. The only thing it receives without the operator acting is the request for its script. |
| **Data linked to you** | **No new row for Meta.** The WhatsApp connection the operator makes is the operator's own action, and the data it uses is already declared under App Functionality. |
| Recommended note (internal) | "Meta's SDK is loaded only on the WhatsApp setup panel, with automatic event logging off; it is used solely for the operator-initiated WhatsApp Business connection (Embedded Signup)." |

**Google Play, Data safety (Play Console › App content › Data safety):**

| Question | Answer for Meta |
|---|---|
| **Is data shared with third parties?** | **No, for Meta.** The only transfer is user-initiated: the operator taps "Set up" and signs in to Meta in Meta's window, which Google's form exempts from "shared". Meta's SDK sends no app activity or identifiers. The WhatsApp Cloud API calls run on our server, with Meta acting as the service provider for the WhatsApp feature the operator switched on, which is also exempt. |
| Data types to add for Meta | **None.** Not app activity, not device IDs, not personal info: none of these reaches Meta from our code. |
| Approximate location / IP | Not declared for Meta. The script request carries an IP address as any web request does. Nothing in our code sends location. |

**One residual fact, so the answers stay accurate.** Because option (B) was dropped, the SDK's script still downloads on the WhatsApp setup panel before any tap. That is a request for Meta's code, with no events, and it doesn't change the answers above. If you later want Meta contacted only after the tap, that is (B): a change to the manage page's setup control, with a two-tap flow for Safari.

## 7 · Commits (main, by path, not pushed)

- `25340ca5`: `lib/whatsapp/embedded-signup.ts`, `scripts/meta-sdk-1.cjs`, `scripts/meta-sdk-1-live.cjs`, and `scripts/harnesses.json` (only my six lines, applied to the index from a patch against HEAD).
- The report commit: this file.

## SQL

None was run in this workstream.
