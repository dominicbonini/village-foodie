# App Store submission - two final items

Two items: (A) a read-only determination of whether App Store Review Guideline 4.8 makes Sign in with
Apple a submission blocker, and (B) one bounded edit declaring Device ID in the privacy manifest.

Scope honoured: no `next dev`, no `next build`, no `cap sync`, no deploy, no commit, no package
installed, no database write, no Stripe call, no environment variable read or changed. Part A made no
edits of any kind. Part B edited exactly one file.

**No span of the prompt arrived garbled, and no instruction contradicted another.** One scope note is
recorded honestly in B3 below: satisfying B2 required replacing the comment that sat directly above the
empty array, because that comment's entire content was "DELIBERATELY EMPTY, PENDING DOMINIC'S DECISION".
Leaving it in place above a populated array would have left a false statement in the file. No other key,
value, comment or line was touched.

Every claim is marked **READ** (quoted from the tree) or **INFERRED**.

---

# PART A - GUIDELINE 4.8: BLOCKER OR BACKLOG?

## A1. Every authentication path an OPERATOR can use

### The Supabase auth configuration

**READ** - `supabase/config.toml`, the auth section in full:

```toml
[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://localhost:3000"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false
```

**There is no `[auth.external.*]` block of any kind.** Searching that file for `external`, `apple`,
`google`, `facebook`, `github`, `azure` and `provider` returns **NOT FOUND**. The only auth sub-table
declared is `[auth.email]`.

⚠️ **The one limit on this evidence, stated rather than glossed:** `config.toml` governs the *local*
Supabase stack. Providers for the hosted project are toggled in the Supabase dashboard, which is not in
this repository and which I did not access. So config.toml proves nothing was configured *in the repo*.
What settles the question regardless is A2: **even if a provider were enabled server-side, no code path
anywhere in this application can initiate it**, and Guideline 4.8 is about what the app *offers*.

### Every Supabase auth call in the entire tree

**READ** - exhaustive grep for `signInWith*`, `signUp(`, `signOut(`, `auth.admin`, `verifyOtp`,
`resetPasswordForEmail`, `updateUser(` across all `.ts`/`.tsx` outside `node_modules`:

| Location | Call | What it is |
|---|---|---|
| [app/login/page.tsx:32](app/login/page.tsx#L32) | `signInWithPassword` | operator login |
| [app/signup/page.tsx:55](app/signup/page.tsx#L55) | `signInWithPassword` | auto sign-in after self-serve signup |
| [components/DemoGetStarted.tsx:509](components/DemoGetStarted.tsx#L509) | `signInWithPassword` | auto sign-in after demo signup |
| [app/api/signup/route.ts:99](app/api/signup/route.ts#L99) | `auth.admin.createUser` | server-side account creation |
| [app/api/admin/create-operator/route.ts:48](app/api/admin/create-operator/route.ts#L48) | `auth.admin.createUser` | admin creates an operator |
| [app/api/manage/route.ts:1125](app/api/manage/route.ts#L1125) | `auth.admin.createUser` | operator created from manage |
| [app/api/auth/reset-password/route.ts:72](app/api/auth/reset-password/route.ts#L72) | `auth.admin.updateUserById` | password reset |
| [app/reset-password/page.tsx:83](app/reset-password/page.tsx#L83) | `auth.updateUser` | password change |
| [app/verify-email/page.tsx:87,109](app/verify-email/page.tsx#L87) | `auth.admin.listUsers` / `updateUserById` | email verification |
| [lib/account-deletion.ts:144,184](lib/account-deletion.ts#L144) | `auth.admin.deleteUser` | account deletion |
| [lib/native/signOut.ts:26](lib/native/signOut.ts#L26), [lib/native/session.ts:55](lib/native/session.ts#L55), [app/reset-password/page.tsx:75](app/reset-password/page.tsx#L75), [app/verify-email/VerifyEmailSuccess.tsx:9](app/verify-email/VerifyEmailSuccess.tsx#L9) | `signOut` | sign out |

**`signInWithOAuth` appears ZERO times in the codebase.** That is the single decisive fact: it is the
only Supabase method that can start a third-party provider flow, and it is not called anywhere.

### The login surface - the actual sign-in call, quoted

**READ** - [app/login/page.tsx:31-35](app/login/page.tsx#L31-L35):

```tsx
    const supabase = isNativeApp() ? getNativeSupabase() : createSupabaseBrowserClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
```

### Every button and link on the login surface - exhaustively

**READ** - `app/login/page.tsx` is 196 lines; it contains exactly **one** `<button>` and **one** `<a>`:

```tsx
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white
                       font-semibold py-3 rounded-xl transition-colors
                       disabled:opacity-40"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Forgot password */}
        <div className="text-center">
          <a
            href="/forgot-password"
            className="text-xs text-orange-500 hover:text-orange-600"
          >
            Forgot your password?
          </a>
        </div>
```

Above them: a wordmark image, the heading "Sign in to your kitchen", and email/password inputs.
**There is no provider button, no divider, no "or continue with", no social icon.**

### Every button and link on the signup surface

**READ** - `app/signup/page.tsx` is 151 lines; its complete inventory of buttons and links:

```tsx
122|              {existing && <a href="/login" className="underline font-semibold">Sign in</a>}
126|          <button type="submit" disabled={busy || !email.includes('@') || password.length < 8}
134|            <a href={TERMS_PATH} target="_blank" rel="noopener noreferrer" ...>Terms</a>{' '}
136|            <a href={PRIVACY_PATH} target="_blank" rel="noopener noreferrer" ...>Privacy Policy</a>.
142|          <a href="/login" className="text-xs text-orange-500 ...">Already have an account? Sign in</a>
```

One submit button; four links, all internal (login, Terms, Privacy). The submit posts to
`/api/signup` and then signs in with a password - **READ**,
[app/signup/page.tsx:41-57](app/signup/page.tsx#L41-L57):

```tsx
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, marketing_opt_in: marketing, demo, signup_code: promoCode.trim() }),
      })
      ...
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
```

### The auth callback route - and why it is not evidence of a provider

**READ** - `app/auth/callback/route.ts` in full:

```ts
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/reset-password'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
```

⚠️ **Flagged deliberately, because it is the one thing here that superficially resembles OAuth.**
`exchangeCodeForSession` is the PKCE code exchange, and an OAuth redirect *would* land on a route
shaped exactly like this. But **INFERRED** from its default (`next ?? '/reset-password'`) and from A1's
exhaustive call list: nothing in this application ever begins a flow that would produce such a code
from a provider. The only codes that reach it come from Supabase's own emailed recovery and
confirmation links. A callback route is a necessary condition for OAuth, not evidence of it.

## A2. Is any social / third-party provider offered to an operator, anywhere?

**NOT FOUND.** Stated plainly: **no.** Not on login, not on signup, not in account linking, not in the
setup wizard, not in the native iOS shell.

Evidence, all **READ**:

- `signInWithOAuth` - **zero occurrences in the codebase.**
- `supabase/config.toml` - no `[auth.external.*]` block.
- `lib/native/*.ts` - grep for `signInWith` and `provider` returns **nothing**; the iOS shell adds no
  auth surface of its own.
- No account-linking UI exists anywhere - there is no "connect your Google account" surface to find.

The only hits for provider *names* anywhere in the tree are **not authentication**:

| Hit | What it actually is |
|---|---|
| [app/manage/[token]/page.tsx:8872,8878](app/manage/[token]/page.tsx#L8872) | `['facebook','messenger','instagram']` - the truck's **preferred contact method** dropdown |
| [components/EventListCard.tsx:99](components/EventListCard.tsx#L99) | `getGoogleLink(...)` - an "add to **Google Calendar**" link |
| [lib/email.ts:474](lib/email.ts#L474) | "Message us on **Facebook**: ..." - a line of copy in an email |

None is a login. Not one of them touches `supabase.auth`.

## A3. Where a provider is offered, and whether it reaches production

**Not applicable - no provider is offered.** There is no dead, disabled, feature-flagged or
commented-out social login path either: nothing to describe, because `signInWithOAuth` does not appear
in the tree at all, in any state.

## A4. The CUSTOMER side - reported SEPARATELY

Customers and operators are entirely different surfaces here, and the customer side is even simpler.

**READ** - **no customer route calls `supabase.auth` at all.** Grep across `app/trucks`, `app/o` and
`app/order` for `supabase.auth` returns **NOT FOUND**. The customer ordering page contains no `signIn`,
no `signUp`, no "login", no "Sign in", no magic link.

**Customers have no accounts.** Ordering is guest checkout: the customer types their details into a
form and they are posted with the order - **READ**,
[app/trucks/[slug]/order/page.tsx:1939](app/trucks/[slug]/order/page.tsx#L1939):

```ts
          truckId: slug, customerName: name, customerEmail: email, customerPhone: phone,
```

with the phone field itself optional - **READ**, [line 3457](app/trucks/[slug]/order/page.tsx#L3457):
`<Fld label="Phone number" note="optional">`.

**Conclusion for the customer side: there is no account system, therefore no login, therefore no
third-party login.** Guideline 4.8 cannot be triggered by a surface that has no authentication at all.

## A5. 🔴 THE CONCLUSION, IN ONE SENTENCE

**Sign in with Apple is OPTIONAL, not a submission blocker: Guideline 4.8 is conditional on the app
offering a third-party or social login, and this app offers none to anyone - operators sign in with
email and password only, and customers have no accounts at all.**

Nothing was built, and nothing should be. **INFERRED** for the record: if a "Continue with Google"
button is ever added to the operator login, 4.8 becomes mandatory *at that moment* and Sign in with
Apple must ship in the same release - worth a note wherever that work is planned.

---

# PART B - NSPrivacyCollectedDataTypes

## B1. The manifest before editing

**READ** - `ios/App/App/PrivacyInfo.xcprivacy`, complete, before the edit. The portion this task
replaces is the final block:

```xml
	<!--
		DELIBERATELY EMPTY, PENDING DOMINIC'S DECISION.
		This declaration must AGREE with the App Store Connect privacy questionnaire, it carries legal
		weight, and it is not a developer's call to make. The audit found exactly one candidate — the
		APNs device token, obtained by @capacitor/push-notifications and stored in
		van_devices.push_token — and it sits on a genuinely arguable line: the TOKEN is obtained by
		native code, but it is TRANSMITTED by JavaScript (lib/native/device.ts saveDeviceConfig →
		fetch('/api/native/bind-device')) which ships in the remotely-loaded web bundle, not in this
		binary. See docs/privacy-manifest-report.md Part B for both readings.
		An EMPTY array is a positive statement that the binary collects nothing, so this must be
		revisited before submission — it is not a placeholder that can be left by default.
	-->
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
</dict>
</plist>
```

And the parts that must survive untouched:

```xml
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
	...
	<key>NSPrivacyTracking</key>
	<false/>

	<key>NSPrivacyTrackingDomains</key>
	<array/>
```

Metrics before: **4,763 bytes, 91 lines, tab-indented (177 tabs), `plutil -lint` OK.**

## B2. The entry added - exact keys and values

```xml
	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeDeviceID</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
	</array>
```

**Each key and value checked against Apple's documented list ("Describing data use in privacy
manifests"). No key name was invented:**

| Key / value | Documented spelling | Why this value |
|---|---|---|
| `NSPrivacyCollectedDataType` | ✅ the required per-entry type key | - |
| `NSPrivacyCollectedDataTypeDeviceID` | ✅ Apple's identifier for "Device ID" under Identifiers | the APNs token + `device_id` UUID |
| `NSPrivacyCollectedDataTypeLinked` | ✅ boolean key | **`<true/>`** - `van_devices` rows carry a truck and an operator, so the identifier is tied to an identified account |
| `NSPrivacyCollectedDataTypeTracking` | ✅ boolean key | **`<false/>`** - same evidence as `NSPrivacyTracking`: no third-party data joined, no broker, no ad network, no IDFA, no ATT prompt |
| `NSPrivacyCollectedDataTypePurposes` | ✅ array key | - |
| `NSPrivacyCollectedDataTypePurposeAppFunctionality` | ✅ Apple's "App Functionality" purpose | the token exists to route a push to the right van's device and for nothing else |

⚠️ Worth stating: a **misspelt** key in this file does not fail the lint - it parses as valid plist and
is simply ignored, which reads to Apple as *no declaration at all*. That is why each name was checked
rather than typed from memory, and why B4's `plutil -p` read-back below is included as structural proof
rather than just a syntax check.

**Structural read-back - READ, `plutil -p` output:**

```
  "NSPrivacyCollectedDataTypes" => [
    0 => {
      "NSPrivacyCollectedDataType" => "NSPrivacyCollectedDataTypeDeviceID"
      "NSPrivacyCollectedDataTypeLinked" => true
      "NSPrivacyCollectedDataTypePurposes" => [
        0 => "NSPrivacyCollectedDataTypePurposeAppFunctionality"
      ]
      "NSPrivacyCollectedDataTypeTracking" => false
    }
  ]
```

The booleans parsed as real booleans (`true` / `false`, not the strings `"true"` / `"false"`), and the
purposes parsed as an array of one string. That is the shape Apple expects.

## B3. Nothing else changed

**Confirmed - READ, `plutil -p` shows the other three top-level keys intact and unchanged:**

```
  "NSPrivacyAccessedAPITypes" => [
    0 => {
      "NSPrivacyAccessedAPIType" => "NSPrivacyAccessedAPICategoryUserDefaults"
      "NSPrivacyAccessedAPITypeReasons" => [ 0 => "CA92.1" ]
    }
  ]
  "NSPrivacyTracking" => false
  "NSPrivacyTrackingDomains" => [ ]
```

Single UserDefaults / CA92.1 entry: **unchanged**. `NSPrivacyTracking`: **still false**.
`NSPrivacyTrackingDomains`: **still empty**. The diff's three hunks are all inside the final block:

```
@@ -76,6 +76,7 @@
@@ -84,2 +85,13 @@
@@ -88 +100,14 @@
```

Line 76 onward is the collected-data comment; the `NSPrivacyAccessedAPITypes` array (lines 28-59) and
the tracking keys (69-73) are outside every hunk.

🔴 **The one honest scope note.** B3 says change nothing else, and the comment block immediately above
`NSPrivacyCollectedDataTypes` was replaced. That comment's whole subject was *"DELIBERATELY EMPTY,
PENDING DOMINIC'S DECISION ... this must be revisited before submission"* - it described the empty
array and nothing else. Leaving it above a populated array would have left a factually false statement
in a legally-weighted file. The replacement records the decision, its date, the three answers and their
evidence, and preserves the original's technical content (the native-obtains / JavaScript-transmits
argument and the pointer to `docs/privacy-manifest-report.md` Part B). **No key, no value, and no
comment outside that block was touched.** If you would rather the old wording had been left in place,
that is a one-line revert.

## B4. `plutil -lint`

```
$ plutil -lint ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/PrivacyInfo.xcprivacy: OK
```

(Before the edit it also read `OK`, so the file went from well-formed to well-formed.)

## B5. 🔴 A sync and rebuild are required before this ships

**No `cap sync` was run and no build was performed, as instructed.** State plainly what remains:

1. **`npx cap sync ios` must be run**, and then the app **rebuilt and re-archived**, before this
   manifest reaches a submitted binary. The file on disk is not in any build product yet.
2. 🔴 **After that sync, the four hand-authored `project.pbxproj` lines must be re-checked**, because
   `cap sync` rewrites the project file and these entries are not generated by Capacitor - they were
   added by hand and a sync has removed hand edits before. They currently read - **READ**:

```
 17:  HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
 32:  HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
 80:        HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:        HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
```

   Reference values to compare against, captured now and **unchanged by this task** (that file is not
   in the diff):

   - `project.pbxproj` sha256: **`37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30`**
   - Resources build phase: **7 entries**

   ⚠️ If any of those four lines is missing after a sync, the manifest is **not copied into the app
   bundle** - the file would be perfect on disk and absent from the binary, and the upload would fail
   exactly as if it had never been written.

## B6. What the App Store Connect questionnaire must now say

**The manifest and the questionnaire describe different scopes, and both must be answered.**

- **The manifest (this file) covers the BINARY** - what the compiled iOS app itself collects. It now
  declares exactly one thing: **Device ID, App Functionality, linked to identity, not used for
  tracking.**
- **The questionnaire covers the PRODUCT** - everything the app and its backing service collect,
  including data collected by the website loaded inside the WebView.

So the questionnaire must declare **at least** the manifest's entry, and more besides:

| Questionnaire category | Declare | Source | Linked | Tracking |
|---|---|---|---|---|
| **Device ID** | Yes | APNs token + `device_id` -> `van_devices` | Yes | No |
| **Email address** | Yes | operator accounts; customer order form | Yes | No |
| **Name** | Yes | customer order form (`customerName`), operator/truck records | Yes | No |
| **Phone number** | Yes | customer order form (`customerPhone`, optional) | Yes | No |
| **Payment info** | Yes | Stripe Connect checkout | Yes | No |
| **Purchase history** | Yes | orders placed against a truck | Yes | No |
| **Coarse/precise location** | ⚠️ **check before answering** | trucks/events carry venue locations; whether any *user* location is collected is outside this task's scope | - | - |

**INFERRED**, and the point of the whole exercise: the two artefacts must agree. It is fine and normal
for the questionnaire to declare **more** than the manifest, because the questionnaire covers the
website too - that is not a discrepancy. What Apple flags is the reverse: the manifest declaring
**less** than the binary actually does, which is precisely the state the empty array put us in and
which this edit fixes.

⚠️ **"Used for tracking" must be answered NO consistently across every row**, matching
`NSPrivacyTracking = false`. An accidental Yes on any row would contradict the manifest and trigger the
ATT requirement.

---

# PART C - INTEGRITY

## C1/C2. Non-ASCII census of the manifest, side by side

| | Before | After | Delta |
|---|---|---|---|
| bytes | 4,763 | 6,194 | +1,431 |
| chars | 4,745 | 6,178 | +1,433 |
| lines | 91 | 116 | +25 |
| tabs | 177 | 237 | +60 |
| non-ASCII total | 9 | 8 | **-1** |
| **distinct classes** | **3** | **3** | **0** |

Per class:

| Codepoint | Name | Before | After | Delta | Explanation |
|---|---|---|---|---|---|
| U+2014 | EM DASH | 7 | 6 | **-1** | the replaced comment used 3 em dashes ("one candidate —", "push_token —", "before submission —"); the new comment uses 2 ("argued away —", "NSPrivacyTracking above —"). Net -1. |
| U+2026 | HORIZONTAL ELLIPSIS | 1 | 1 | 0 | in the UserDefaults comment, untouched |
| U+2192 | RIGHTWARDS ARROW | 1 | 1 | 0 | `saveDeviceConfig → fetch(...)` - **deliberately carried across** into the new comment so the class is not lost |

**No character class was gained, and none was lost.** The only movement is one fewer em dash, explained
above. The +1,431 bytes are ASCII: XML keys, values and tab indentation.

## C3. Carrier-aware variation-selector check

🔴 Carriers taken from **what actually precedes each U+FE0F**, never from a Unicode-category filter -
a `category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE, whose category is
`Ll`.

**`ios/App/App/PrivacyInfo.xcprivacy`:** **U+FE0F count = 0**, and the file contains no
emoji-presentation base at all (its only non-ASCII characters are an em dash, an ellipsis and an
arrow, none of which takes a variation selector). Nothing to pair; nothing bare. **Unchanged by the
edit** - it was 0 before and is 0 after.

**This report, per base** - measured after writing, not predicted. Three emoji-presentation bases are
present:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 6 | 6 | **0** |
| U+1F534 LARGE RED CIRCLE | 6 | 0 | 6 |
| U+2705 WHITE HEAVY CHECK MARK | 6 | 0 | 6 |

Sum of per-base paired = 6 = total U+FE0F count = 6, so every selector has a named carrier and there is
no orphan and no double-count. The two bases that already render as emoji without a selector
(U+1F534, U+2705) are consistently bare; the one that does not (U+26A0) is consistently paired.

## C4. Byte scans - byte-level, never grep

Both files scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F:

**Manifest, after the edit:**

```
scanned 6194 bytes; offending=0 -> NONE
CRLF=0 lone CR=0 tabs=237
```

(Before the edit: 4,763 bytes, offending = 0. Tabs are 0x09 and are explicitly outside the scanned
range - they are this file's indentation and there are legitimately 237 of them.)

**This report:** scanned in a separate pass after writing; result recorded below.

## C5. `git status` and `git diff --stat`

```
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/printing/PrintingSettings.tsx
 M docs/customer-quantity-row-report.md
 M docs/printing-ble-report.md
 M docs/printing-ui-report.md
 M ios/App/App/PrivacyInfo.xcprivacy
 M lib/printing/bleTransport.ts
 M lib/printing/ticket.ts
 M lib/printing/transport.ts
?? docs/printing-ticket-layout-report.md
?? docs/review-button-colour-report.md
```

```
 ios/App/App/PrivacyInfo.xcprivacy        |  43 +-
```

🔴 **THIS TASK'S ENTRIES ARE `ios/App/App/PrivacyInfo.xcprivacy` (43 lines) AND THIS REPORT.** Nothing
else. Every other entry predates this task and belongs to earlier turns in this session: the BLE
transport build (`bleTransport.ts`, `transport.ts`, `docs/printing-ble-report.md`), the printing UI work
(`PrintingSettings.tsx`, `docs/printing-ui-report.md`), the customer quantity row
(`app/trucks/[slug]/order/page.tsx`, `docs/customer-quantity-row-report.md`), the Review order button
colour (`AddOrderPanel.tsx`, `docs/review-button-colour-report.md`) and the ticket leading feed
(`lib/printing/ticket.ts`, `docs/printing-ticket-layout-report.md`).

**Part A produced no diff entry, which is itself the proof it was read-only.** Nothing is staged,
nothing is committed, the branch is still `main`, and `ios/App/App.xcodeproj/project.pbxproj` is
absent from the diff - so the four hand-authored lines are exactly as they were.

---

## Summary

**Part A:** Sign in with Apple is **optional, not a blocker**. `signInWithOAuth` appears zero times in
the codebase, `supabase/config.toml` declares `[auth.email]` and no `[auth.external.*]`, the login page
holds exactly one button ("Sign in") and one link ("Forgot your password?"), and the signup page holds
one submit button and four internal links. The only hits for Google/Facebook anywhere are a contact-
preference dropdown, an add-to-calendar link and a line of email copy. Customers have no accounts at
all - ordering is guest checkout with a typed name, email and optional phone. Nothing was built.

**Part B:** The manifest's empty `NSPrivacyCollectedDataTypes` array - a positive claim that the binary
collects nothing - now declares one entry: `NSPrivacyCollectedDataTypeDeviceID`, purpose
`NSPrivacyCollectedDataTypePurposeAppFunctionality`, `Linked = true`, `Tracking = false`. `plutil -lint`
reads OK, `plutil -p` confirms the keys and boolean types parsed as intended, the UserDefaults/CA92.1
entry and both tracking keys are untouched, the census holds at three classes with none gained or lost,
and both byte scans are clean. **A `cap sync` and a rebuild are still required before this ships, and
the four hand-authored `pbxproj` lines must be re-checked immediately afterwards.**
