# Where the two setup wizards are mounted

**WHICH OF THE THREE I PERFORMED: A PARSE.** No typecheck, no execution. This is a read: every claim
below is a quotation from a file on disk. **Nothing was run, nothing was rendered, and no file was
changed except this report.**

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

🔴 **THE HEADLINE.** Both wizards are mounted **once each, on adjacent lines, in the same block** —
`app/dashboard/[token]/page.tsx:4485` and `:4486`. Neither appears in `app/manage/[token]/page.tsx` at
all. They are inside the **dashboard's** Settings tab, which is a **per-event** surface; the manual
records that distinction explicitly, and these two are truck-wide settings sitting on it.

---

## 1. WHERE EACH IS MOUNTED

### The complete mount inventory — repo-wide

`grep -rn "EmbedWizard\|CustomDomainSetup" app components lib` returns **six** lines, and only two are
mounts:

```
app/dashboard/[token]/page.tsx:93    import EmbedWizard from '@/components/dashboard/EmbedWizard'
app/dashboard/[token]/page.tsx:94    import CustomDomainSetup from '@/components/dashboard/CustomDomainSetup'
app/dashboard/[token]/page.tsx:4485  <CustomDomainSetup … />      ← MOUNT
app/dashboard/[token]/page.tsx:4486  <EmbedWizard … />            ← MOUNT
app/api/manage/route.ts:1243         (a comment citing CustomDomainSetup.tsx:278)
components/dashboard/EmbedWizard.tsx:44        export default function EmbedWizard(props: Props)
components/dashboard/CustomDomainSetup.tsx:46  export default function CustomDomainSetup(props: Props)
```

✅ **NEITHER IS MOUNTED IN MORE THAN ONE PLACE.** One import and one JSX usage each, in one file.

| | Custom domain | Embed |
|---|---|---|
| **Component** | `components/dashboard/CustomDomainSetup.tsx` | `components/dashboard/EmbedWizard.tsx` |
| **Route** | `/dashboard/[token]` | `/dashboard/[token]` |
| **Parent** | `app/dashboard/[token]/page.tsx` | `app/dashboard/[token]/page.tsx` |
| **Mounted at** | line **4485** | line **4486** |
| **Mounted more than once?** | **No** | **No** |

### The point in the parent's tree

Both sit inside the dashboard's **Settings tab body**, which opens at `:3873`:

```tsx
        {activeTab==='settings'&&(
```

…and closes at `:4489-4490`. They are the **third- and second-from-last** children of that block:

```
  4485   {…&&<CustomDomainSetup …/>}      ← custom domain
  4486   {…&&<EmbedWizard …/>}            ← embed
  4487   {!isDemo&&truck&&<PrintingSettings …/>}
  4488   {!isDemo&&<NotificationSettings token={token}/>}
  4489            </div>
  4490          )}
```

The tab itself is one of four, `app/dashboard/[token]/page.tsx:107`:

```ts
const TAB_VALUES = ['orders','add','stock','settings'] as const
```

🔴 **AND THE SCREEN THEY ARE ON HAS A DOCUMENTED SCOPE THAT IS NOT THEIRS.** Ninety lines above the
mounts, at `:4082-4086`, the same file states:

> 🔴 **DO NOT ADD PER-EVENT SCOPE WORDING TO THESE ROWS.** SCOPE IS A PROPERTY OF THE SCREEN, NOT OF EACH
> SETTING. **Dashboard → Settings is PER-EVENT; Manage → Settings is TRUCK-WIDE.** That holds for EVERY
> option on this tab…

**Both wizards write truck-wide state** — `trucks.embed_enabled`, `trucks.custom_domain` — on the screen
that file declares per-event. Recorded as an observation; the decision is yours.

⚠️ **A small inconsistency in the comments, noted since you are reading this area.** The two explanatory
comments are stacked ahead of both mounts and are in the opposite order to the code: the **embed**
comment (`:4477-4480`) comes first and says *"it sits above the iPad-only block below"*, then the
**domain** comment (`:4481-4484`) says *"the same gating as the embed card immediately below"* — but the
domain component is rendered first, at `:4485`, and the embed second, at `:4486`. The comments are
correct about gating and wrong about order.

---

## 2. WHAT GATES EACH — every condition between page load and the wizard appearing

### Shared, in the parent, quoted in full

Both mount lines open with the **identical** three-part guard:

```tsx
{!isDemo&&truck&&(userRole==='owner'||userRole==='manager')&&<CustomDomainSetup …/>}   // :4485
{!isDemo&&truck&&(userRole==='owner'||userRole==='manager')&&<EmbedWizard …/>}          // :4486
```

Each term, traced to its source in the same file:

| Term | Source | Line |
|---|---|---|
| `!isDemo` | `const isDemo=token.startsWith('demo-')` | `:186` |
| `truck` | `const[truck,setTruck]=useState<TruckData\|null>(null)` — null until the fetch lands | `:212` |
| `userRole` | `const[userRole,setUserRole]=useState<'owner'\|'manager'\|'staff'\|null>(null)`, set at `:1008` from `data.userRole` | `:606`, `:1008` |

And enclosing both, the tab gate at `:3873`: `{activeTab==='settings'&&(` — where `activeTab` is seeded
from the URL at `:291-293` and defaults to `'orders'`, so **the operator must select the Settings tab
before either wizard exists in the tree at all.**

### Internal, inside each component

**`CustomDomainSetup`** — two conditions:

```tsx
  const allowed = canAccess(plan, 'embed_schedule', featureOverrides ?? {}, trialExpiresAt)   // :48
  …
  if (!allowed) return null                                                                    // :96
```

**`EmbedWizard`** — three conditions:

```tsx
  const allowed = canAccess(plan, 'embed_schedule', featureOverrides ?? {}, trialExpiresAt)   // :50
  …
  if (!allowed) return null                                                                    // :104
  if (!slug) return null                                                                       // :105
```

🔴 **BOTH CHECK THE SAME FEATURE, `'embed_schedule'`, WITH THE SAME FOUR ARGUMENTS.** There is no
`custom_domain` feature. `EmbedWizard` additionally requires a non-null `slug`.

### The full chain, in order

```
  page load
    → activeTab === 'settings'                    (:3873, user must pick the tab)
    → !isDemo                                     (:186, token prefix)
    → truck !== null                              (:212, fetch has landed)
    → userRole is 'owner' or 'manager'            (:606/:1008)
    → canAccess(plan,'embed_schedule',…)          (CustomDomainSetup:48 / EmbedWizard:50)
    → [EmbedWizard only] slug !== null            (EmbedWizard:105)
    → the wizard renders
```

---

## 3. WHERE EXISTING SETTINGS SURFACES LIVE

### The container

| | |
|---|---|
| **Container** | `SettingsTab`, a function component **local to the manage page** |
| **Defined at** | `app/manage/[token]/page.tsx:8585`, spanning **8585-10727** (2,142 lines) |
| **Route** | `/manage/[token]` |
| **Mounted at** | `app/manage/[token]/page.tsx:761` |

```tsx
{activeTab === 'settings'  && <SettingsTab  userRole={userRole} truck={truck} token={token} api={api}
  reload={load} showToast={showToast} onVerifySuccess={handleVerifiedEvents} onSwitchTab={setActiveTab}
  categories={categories} items={items} subcategories={subcategories}
  onTruckUpdate={partial => setTruck(prev => prev ? { ...prev, ...partial } : prev)}
  onItemsPatch={…} onCategoriesPatch={…} onOpenWalkthrough={openWalkthrough} />}
```

The tab is declared at `:556` and is **already role-gated to exactly the two roles the wizards check**:

```tsx
    { id: 'settings',  label: 'Settings',  icon: '🔧', roles: ['owner', 'manager'] },
```

…filtered at `:567` by `return t.roles.includes(userRole)`.

### How a section is added — two established patterns

**PATTERN A — an inline sub-panel.** The dominant shape: a `pt-3 border-t` divider, a `bg-slate-50`
rounded panel, a `SUBCARD_HEADING` title with a one-line description, then rows. `SUBCARD_HEADING` is
imported at `:55` from `@/lib/ui-tokens`. **One existing example in full**, the Notifications panel at
`:9760-9777`:

```tsx
        <div className="pt-3 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
            <div className="pb-3">
              <p className={SUBCARD_HEADING}>Notifications</p>
              <p className="text-xs text-slate-500 mt-0.5">How you hear about new orders.</p>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Email order notifications</p>
                <p className="text-xs text-slate-500 mt-0.5">When on, an email is sent to {truck.contact_email || "the truck's contact email"} for every new order. Customer order emails are unaffected.</p>
              </div>
              <Toggle
                on={(form as any).truck_order_email_enabled !== false}
                onToggle={() => { const next = (form as any).truck_order_email_enabled !== false ? false : true; setForm(p => ({...p, truck_order_email_enabled: next} as any)); saveSetting({ truck_order_email_enabled: next }) }}
              />
            </div>
          </div>
        </div>
```

Sibling panels use the identical shell: *Accepting orders* `:9723`, *Taking payment* `:9793`, *Opening
and closing* `:9977`, *Display settings* `:10331`, *Kitchen capacity* `:10419`.

**PATTERN B — a self-contained child component**, which is the closer precedent for these two.
`SettingsTab` already renders several: `DeleteAccountSection`, `WhatsAppReplyPreview`, `CuisinePicker`,
`FeatureGate`, `Toggle`, `KitchenCapacityCategoryRow`. The cleanest example, imported at `:17` and
mounted at `:10708`:

```tsx
      {userRole === 'owner' && <DeleteAccountSection truckName={truck?.name ?? ''} showToast={showToast} />}
```

🔴 **That single line is the pattern the wizards already fit**: a one-line role-gated mount of an
imported component that owns its own state, chrome and API calls — which is exactly what both wizards
are today at `:4485-4486`.

---

## 4. WHAT DEPENDS ON WHERE THEY ARE MOUNTED

### The props, and where each value comes from

```tsx
// :4485
<CustomDomainSetup token={token} plan={truck.plan} featureOverrides={truck.feature_overrides}
  trialExpiresAt={truck.trial_expires_at} truckName={truck.name} website={truck.website??null}
  customDomain={truck.custom_domain??null} setupState={truck.custom_domain_setup_state??null}
  verifiedAt={truck.custom_domain_verified_at??null} confirmedAt={truck.custom_domain_confirmed_at??null}/>

// :4486
<EmbedWizard token={token} plan={truck.plan} featureOverrides={truck.feature_overrides}
  trialExpiresAt={truck.trial_expires_at} truckName={truck.name} slug={truck.slug??null}
  embedEnabled={truck.embed_enabled===true} website={truck.website??null}/>
```

✅ **EVERY PROP IS A PLAIN SCALAR READ OFF THE TRUCK ROW, PLUS `token`.** Neither takes a callback, a
setter, a ref, a context value or anything derived from dashboard-only state (no `activeEvent`, no
`orders`, no `activeTab`). **Nothing is passed that only the dashboard can produce.**

✅ **AND NEITHER RELIES ON PARENT-LOADED DATA BEYOND THOSE PROPS**, because each re-reads its own state
on mount through the same API the manage page uses:

```tsx
  useEffect(() => { … const d = await call('domain_status') … }, [])       // CustomDomainSetup:80-85
  useEffect(() => { … const d = await call('get_embed_status') … }, [])    // EmbedWizard:91-95
```

Both `call()` helpers POST to `/api/manage` with `{ token, action }` (`CustomDomainSetup:64-72`,
`EmbedWizard` equivalently), so **`token` alone makes them self-sufficient.**

### What would NOT survive a move, stated precisely

🔴 **TWO TYPE FIELDS ARE MISSING FROM THE MANAGE PAGE'S `Truck` INTERFACE.** It is declared **locally**
at `app/manage/[token]/page.tsx:66` — the manage page imports only `TruckEvent` from
`components/dashboard/types` (`:30`), not `Truck`. Checked field by field:

| Prop source | In the manage `Truck` (`:66`)? |
|---|---|
| `plan`, `feature_overrides`, `trial_expires_at`, `name`, `website`, `slug` | ✅ present |
| `custom_domain`, `custom_domain_verified_at`, `custom_domain_confirmed_at` | ✅ present |
| **`custom_domain_setup_state`** | 🔴 **ABSENT** (it declares `custom_domain_setup_started_at`, a different column) |
| **`embed_enabled`** | 🔴 **ABSENT** |

⚠️ **THIS IS A TYPECHECK PROBLEM, NOT A DATA PROBLEM.** The values are already on the wire: `/api/manage`
GET returns `truck: { ...truck, logo }` (`app/api/manage/route.ts:257`) over a `select('*')`, so both
columns are present at runtime today. **Moving would need two fields added to that interface; it would
not need a new fetch, a new endpoint or a new query.**

### Three things that get simpler, not harder

- **`userRole==='owner'||userRole==='manager'` becomes redundant.** The Settings tab is already gated to
  exactly those two roles at `:556`/`:567`.
- **`!isDemo` has no equivalent and appears not to need one.** `grep -n "isDemo\|demo-"` over
  `app/manage/[token]/page.tsx` returns **nothing** — the manage page has no demo concept at all,
  because `proxy.ts`'s `isProtected` covers `pathname.startsWith('/manage')` with no demo exemption,
  while `/dashboard/demo-*` is explicitly exempted. ⚠️ **Stated from reading the proxy, not from trying
  it.**
- **`truck &&` is handled by the container.** `SettingsTab` is rendered below the parent's loading gate
  and receives `truck` as a non-null prop; the file's own comment at `:9336` records this
  (*"verified, not assumed: SettingsTab is rendered at ManagePage:719, BELOW the `loading`"* guard).

⚠️ **ONE BEHAVIOURAL DIFFERENCE, NOT A BLOCKER.** `SettingsTab` holds `const [form, setForm] =
useState({ ...truck })` (`:8606`) and the parent passes `onTruckUpdate` to push saved values back up
(`:761`). **Neither wizard uses that mechanism** — each writes through `/api/manage` and keeps its own
local state. So a wizard save would not refresh `SettingsTab`'s `form`, and vice versa. **They do not
overlap on any column, so nothing is lost today** — but it is the kind of thing that bites when someone
later adds a domain field to the main settings form.

---

## 5. DO THE TWO SHARE ANYTHING?

**They are independent, with two shared library imports and no shared component, state or storage.**

**Shared — exactly two imports:**

```
import { canAccess, type Plan } from '@/lib/features'
import { nativeAuthHeader } from '@/lib/native/session'
```

**Not shared:**

| | Custom domain | Embed |
|---|---|---|
| Own imports | `@/lib/custom-domain/apex`, `/dns`, `/copy` | one local module (its instructions record) |
| React state | `open, step, address, busy, error, copied, pre, rows, provider, emailTo, emailSent, confirmed` | `enabled, …` incl. a `useRef` |
| Storage | **none** | **none** |
| Context | **none** | **none** |
| Server actions | `domain_preflight`, `domain_status`, `domain_provision`, `domain_send_instructions`, `domain_confirm` | `save_embed_setup`, `get_embed_status`, `detect_platform`, `send_embed_instructions` |

`grep -n "localStorage\|sessionStorage\|useContext"` over both returns **nothing**. The only `window.`
reference in either is `EmbedWizard:76`:

```tsx
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.hatchgrab.com'
```

🔴 **THE ONE REAL COUPLING IS THE PLAN FEATURE.** Both gate on `'embed_schedule'` with identical
arguments, so **anything that changes that feature's membership changes both wizards at once**, and a
truck that can see one can always see the other. That is a shared *condition*, not shared code.

⚠️ **AND A SHARED SERVER-SIDE BUCKET OF ACTIONS.** All nine actions above live in the same
`/api/manage` POST handler and sit behind the same access resolver and the same demo opt-out list, so
they share the auth and rate-limiting decisions recorded in §46 of the manual — but nothing in the
components themselves.

---

## 6. WHAT REMAINS UNOBSERVED

1. **Nothing was rendered.** No dashboard, no manage page, no wizard. **I did not confirm visually that
   both appear on the dashboard** — that is your observation, and the mounts are consistent with it.
2. **No typecheck was run**, so the two missing `Truck` fields in §4 are a **read of the interface**, not
   a compiler error I triggered.
3. **The proxy claim in §4** (that a demo truck cannot reach `/manage`) is read from `proxy.ts`'s
   `isProtected` and its demo-dashboard exemption. **No request was made.**
4. **`SettingsTab` is 2,142 lines and I did not read all of it.** I enumerated the components it renders
   and read the panels named in §3; a fourth insertion pattern could exist in the part I did not read.
5. **I did not check whether either wizard renders correctly at the manage page's width**, or whether
   its card chrome would clash with the `SUBCARD_HEADING` panels around it.
6. **Nothing was moved, and no fix is proposed** — as instructed.
