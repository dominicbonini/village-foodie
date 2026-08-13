# Viewing a saved allergen card — what there is to view

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no migration.** Exactly
**one** read-only `SELECT` was run. This report is the only file created. No `next dev`, no `next build`.
Pizzeria Gusto appears in that SELECT's output and was not written to.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE ANSWER, AND IT CHANGES THE SHAPE OF THE FEATURE

**There is no file to view. Not for any truck.**

The live SELECT (section 5) shows `allergen_info_url` is **NULL for all fourteen trucks**. Three trucks
hold `allergen_info_text` and nothing else: `real-thai-food`, `test-truck` and `tikka-tonic`.

So:

- **A "View allergen card" button that opens the uploaded file has nothing to open today.**
- **The only thing there is to view is the flattened text — and it is already on screen**, at
  `app/manage/[token]/page.tsx:4207-4209`, clamped to three lines by `line-clamp-3`.
- 🔴 **The "View original card" link already exists** at `:4210` — and it is dead for every truck,
  because it renders only when `allergenUrl` is truthy and no truck has one.

**So the useful control is almost certainly "show me the rest of the text", not "open the file".** The
file path is real and works, but nobody has ever used it.

⚠️ There is also a **latent** bug worth knowing about, described in 3a: a truck with a URL and no text
shows the green "allergen card saved" and renders **nothing at all** — no preview, no link.

---

## 1. What is actually stored

### a. Every write site

| Site | Writes | When |
|---|---|---|
| `app/manage/[token]/page.tsx:3405` | `allergen_info_url: publicUrl` | immediately after the file uploads, **before** AI processing |
| `app/manage/[token]/page.tsx:3442` | `allergen_info_text: formattedText` | when the operator saves the AI review |
| `app/manage/[token]/page.tsx:4133` | `allergen_info_text: t` | the wizard's card-only path (`onSaveCard`) — verbatim operator text, no extraction |
| `app/manage/[token]/page.tsx:3324` | `allergen_info_text: cardText` | the import wizard's card step |
| `app/manage/[token]/page.tsx:3329` | `allergen_info_text: importCardOnlyText.trim()` | the import wizard's card-only variant |
| `app/api/manage/route.ts:798` | the `update_settings` allow-list entry that permits all of the above | — |

🔴 **`allergen_info_url` has exactly ONE writer** (`:3405`), and it fires only on the upload-a-file path.
Every other route into the feature writes text only.

### b. Storage path or full URL? — **A FULL PUBLIC URL.**

`app/manage/[token]/page.tsx:3401-3405`:

```tsx
const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`
setAllergenUrl(publicUrl)
await api('update_settings', { allergen_info_url: publicUrl })
```

- **Bucket: `truck-media`** — the same bucket as logos and item images.
- **Public**, not signed — the path segment is `/object/public/`, and the upload uses
  `createSignedUploadUrl` (`app/api/manage/route.ts:834`) only for the **write**, not the read.
- ⚠️ **The column therefore holds a full `https://…` string**, not a path. Anything consuming it needs no
  URL construction at all — which is why `formatImageUrl` is not involved (section 4b).

⚠️ **The URL is saved before processing and is never rolled back**: `:3406`'s `catch` swallows an upload
failure and continues to the AI step. So a truck *can* end up with a URL whose AI pass then failed,
leaving url-without-text — the latent case in 3a. **INFERRED** that this is how it would arise; no truck
is in that state today.

### c. 🔴 Yes — the structured extraction is still discarded at save

`app/manage/[token]/page.tsx:3432-3448`:

```tsx
  const handleSaveAllergens = async () => {
    if (!allergenExtracted) return
    const formattedText = allergenExtracted.formatted_text || [
      allergenExtracted.summary,
      allergenExtracted.contains?.length ? `Contains: ${allergenExtracted.contains.join(', ')}` : null,
      allergenExtracted.may_contain?.length ? `May contain: ${allergenExtracted.may_contain.join(', ')}` : null,
      allergenExtracted.dietary_options?.length ? allergenExtracted.dietary_options.join('. ') : null,
      allergenExtracted.additional_notes,
    ].filter(Boolean).join('\n')
    try {
      await api('update_settings', { allergen_info_text: formattedText })
      setAllergenInfoText(formattedText)
      setAllergenStep('idle')
      setAllergenExtracted(null)
      …
```

**`summary`, `contains[]`, `may_contain[]`, `dietary_options[]` and `additional_notes` are flattened into
one newline-joined string and the object is thrown away** (`setAllergenExtracted(null)`, `:3445`). The
route returns the structure (`app/api/manage/process-allergens/route.ts:146`
`{ ok: true, allergens: parsed }`) and nothing persists it.

⚠️ **Consequence for your feature:** a viewer cannot show "Contains: …" as structured chips for an
existing truck, because that structure no longer exists anywhere. Only the flattened string survives.

---

## 2. What already renders a card

### a. The customer order page — **yes, in card mode, both parts**

`app/trucks/[slug]/order/page.tsx:3479, 3491-3502`:

```tsx
const showCard = mode === 'card' && !!(truck?.allergen_info_url || truck?.allergen_info_text)
…
  {showCard && truck?.allergen_info_url && (
    <a href={truck.allergen_info_url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3
                 text-sm text-orange-700 font-medium hover:bg-orange-100">
      📎 View allergen card (PDF/image)
    </a>
  )}
  {showCard && truck?.allergen_info_text && (
    <p className="text-sm text-slate-600 whitespace-pre-wrap">{truck.allergen_info_text}</p>
  )}
```

**It renders the file link and the text independently** — either can appear without the other, which is
exactly the shape Manage lacks.

**How it builds the URL: it does not.** `href={truck.allergen_info_url}` uses the stored value verbatim.
The value reaches the client from `app/api/menu/[truckId]/route.ts:701-702`, passed straight through.

⚠️ **Note the copy: "📎 View allergen card (PDF/image)".** If you want consistency, that is the existing
label for this action.

### b. Is there an existing viewer component? — **No.**

`grep -rln "allergen" components/` returns `MenuAllergenChips.tsx` (per-item chips — a different thing),
`DemoGetStarted.tsx`, `AddOrderPanel.tsx`, `OrderLineItem.tsx`, `DealsModal.tsx`, `types.ts`,
`primitives.tsx`, `PaymentsTab.tsx`, `ExtrasEditor.tsx`. **None is a card viewer.**

**Every render of the card is inline JSX**, in three places: the customer page (2a), the wizard (2c) and
the Manage → Menu block (3a). **INFERRED:** a new button would be the fourth, so if you want one viewer
it wants extracting — the same shape as the cuisine-picker finding.

### c. The wizard modal — **yes, it previews the text and links the file**

`app/manage/[token]/page.tsx:1630-1636`:

```tsx
      ) : cardText ? (
        <div className="border border-green-100 bg-green-50 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-900">🛡️ Allergen card saved</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-6">{cardText}</p>
          {cardUrl && <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline">View original card</a>}
          {canEdit && <div><Btn label="Replace card" colour="slate" size="sm" onClick={onAddCard} /></div>}
        </div>
```

🔴 **Same structural flaw as Manage → Menu**: the whole block is gated on `cardText`, so the file link is
unreachable for a url-only truck. ⚠️ It clamps to **six** lines here versus **three** on the Menu tab —
two different answers to "how much text is enough".

It receives the values as props from `:4121-4122` (`cardText={allergenInfoText}`, `cardUrl={allergenUrl}`).
⚠️ One other call site passes `cardUrl=""` hard-coded (`:5246`).

---

## 3. The Manage → Menu surface

### a. The indicator, and 🔴 the gap

**The indicator** — `app/manage/[token]/page.tsx:4182-4189`:

```tsx
                          {cardMode
                            ? (hasCard
                                ? <span className="text-green-600 font-semibold">allergen card saved</span>
                                : <span className="text-amber-700 font-semibold">add an allergen card so customers can see allergen info</span>)
                            : (needsReview
                                ? <span className="text-amber-700 font-semibold">{unverifiedCount} dish…need review…</span>
                                : <span className="text-green-600 font-semibold">all dishes confirmed</span>)}
                          {!cardMode && allergenInfoText ? ' · allergen card saved' : ''}
```

**Its condition** — `:4162`: `const hasCard = !!(allergenInfoText || allergenUrl)` — **either** column.

**The preview** — `:4206-4212`:

```tsx
            {/* Saved card preview (view always; replace is owner/admin via the wizard). */}
            {allergenInfoText && (
              <div className="mt-3 border border-green-100 bg-green-50 rounded-xl p-3">
                <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{allergenInfoText}</p>
                {allergenUrl && <a href={allergenUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline mt-1 inline-block">View original card</a>}
              </div>
            )}
```

🔴 **The mismatch:** `hasCard` says "saved" on **either** column, but the preview renders on
`allergenInfoText` **alone**, and the file link is **nested inside it**. So:

| State | Indicator | Preview | Link |
|---|---|---|---|
| text + url | "allergen card saved" | ✅ 3 lines | ✅ |
| **text only** | "allergen card saved" | ✅ 3 lines | ❌ (nothing to link) — **all three live trucks** |
| 🔴 **url only** | "allergen card saved" | ❌ **nothing** | ❌ **nothing** |
| neither | "add an allergen card…" | — | — |

**The url-only row is the latent bug.** No truck is in it today (section 5), so it is not what you are
seeing — but it is one failed AI pass away, per 1b.

### b. State already in scope — **both, as strings**

`app/manage/[token]/page.tsx:3391-3392`:

```tsx
  const [allergenUrl, setAllergenUrl] = useState(truck.allergen_info_url || '')
  const [allergenInfoText, setAllergenInfoText] = useState(truck.allergen_info_text || '')
```

✅ **Both values are already in `MenuTab`'s scope.** A viewer needs no new fetch, no new prop and no API
change — everything it would display is already loaded.

### c. Is the section owner-gated for READS? — **No. Reads are open; only edits are gated.**

- `canEditAllergens` is `userRole === 'owner' || isAdmin`, passed in at `:695` and declared at `:1781`
  with the comment *"owner/admin — gates the allergen edit affordances (server also enforces)"*.
- It gates the **button** (`:4194`), which otherwise becomes *"View only — only the owner can edit
  allergens"* (`:4204`), and the wizard's **Replace card** (`:1635`).
- **The preview block at `:4207` has no gate**, and its own comment says so: *"Saved card preview (view
  always; replace is owner/admin via the wizard)."*

**And the server agrees.** `ALLERGEN_FORBIDDEN` (`app/api/manage/route.ts:813-815`) fires only when an
allergen key is **being changed**:

```ts
const touchedAllergenKeys = ALLERGEN_SETTING_KEYS.filter(k => k in safeData && (safeData as any)[k] !== (truck as any)[k])
if (touchedAllergenKeys.length && !canEditAllergens) return ALLERGEN_FORBIDDEN
```

**That is a WRITE gate on `update_settings`. It does not apply to reads** — the values arrive with the
ordinary `getTruck` payload, which has no allergen gate.

✅ **So a "View allergen card" control can be visible to a manager as well as an owner**, consistent with
the preview that is already there.

---

## 4. File access

### a. How an existing surface makes it openable

**It does nothing — the column is already a full URL.** Three sites, all identical in approach:

| Site | Code |
|---|---|
| customer page `:3494` | `<a href={truck.allergen_info_url} target="_blank" rel="noopener noreferrer">` |
| Manage → Menu `:4210` | `<a href={allergenUrl} target="_blank" rel="noopener noreferrer">` |
| wizard `:1634` | `<a href={cardUrl} target="_blank" rel="noopener noreferrer">` |

All three use `target="_blank" rel="noopener noreferrer"` and hand the browser the raw stored string.

### b. `formatImageUrl` — **not involved, and it would not help**

`lib/image-utils.ts:7-12`:

```ts
export function formatImageUrl(rawPath: string | null, defaultFolder: string): string {
  if (!rawPath) return ''
  const cleanPath = rawPath.trim()
  if (cleanPath.startsWith('http') || cleanPath.startsWith('/')) return cleanPath
  return `/${defaultFolder}/${cleanPath}`
}
```

- **No allergen site calls it** — it is used for logos (`lib/truck-logo.ts:26`) and discovery images.
- **It would be a no-op here anyway**: the stored value starts `http`, so line 10 returns it unchanged.
- **PDFs: it is format-agnostic.** It does no extension check and no image-specific work — it is a path
  formatter, not an image loader. ✅ **So it neither helps nor hinders a PDF.**

⚠️ **PDFs matter for how you display it.** The customer label already says *"(PDF/image)"*, and the
`get_upload_url` path accepts whatever `content_type` the file has. **An `<img>` tag would break on a
PDF; an `<a>` or an `<iframe>`/`<object>` would not.** **INFERRED** — I did not find any upload-side
restriction on file type.

### c. `next.config.ts` remotePatterns — **the bucket IS allowed**

```ts
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
```

✅ Matches the stored URL shape exactly, so `next/image` **could** render an uploaded card image.

⚠️ **Two caveats.** It only helps for images — `next/image` cannot render a PDF. And nothing currently
uses `next/image` for this; all three sites use a plain `<a>`.

---

## 5. Live shape — one read-only SELECT

⚠️ **Note on the query.** PostgREST has no `is not null as alias` projection, so I selected the two
columns and derived the booleans client-side. **Same single query, same result, no writes.**

```
id                               display_mode has_url   has_text
demo-15yy2ecnkemmchrr8np69p29n8  card         false     false
demo-4en5jq0q4708kr5avcppe03561  card         false     false
demo-ekwwmqeej70hd5da4d61wzetcw  card         false     false
demo-krh2c8ksabdv28ccprswbfhkdk  card         false     false
demo-m1y02c2mgqag1y4b79401af4hm  card         false     false
pizzeria-gusto                   per_dish     false     false
real-thai-food                   card         false     true
test-truck                       card         false     true
test-truck-2                     null         false     false
test-truck-3                     null         false     false
test-truck-3-2                   null         false     false
tikka-tonic                      card         false     true
tt3                              per_dish     false     false
village-spice                    per_dish     false     false
```

### What this says

| Group | Trucks | Meaning |
|---|---|---|
| 🔴 **url + text** | **none** | the case both viewers were built for **has never occurred** |
| **text only** | `real-thai-food`, `test-truck`, `tikka-tonic` | the only trucks with anything to view — **flattened text, no file** |
| neither, `card` mode | five `demo-*` | customer page shows *"Allergen info not provided"* (`order/page.tsx:3483-3489`) |
| neither, `per_dish` | `pizzeria-gusto`, `tt3`, `village-spice` | falls to the per-item union |
| neither, `null` mode | `test-truck-2/3/3-2` | ⚠️ null behaves as per-dish for the customer gate — see `docs/tikka-tonic-account-report-3.md` §3b |

🔴 **`allergen_info_url` is NULL for every truck in the database.** The upload path exists, is wired end
to end, and **has never been used** — or was used and the URL write failed silently at `:3406`.
**INFERRED**, and not distinguishable from here.

⚠️ **Pizzeria Gusto has neither column set and is on `per_dish`** — so nothing in this area affects it,
and a viewer would render nothing for it.

---

## 6. WHAT A VIEWER WOULD ACTUALLY SHOW — the practical summary

For the three trucks that have anything:

- **The flattened text**, which is already rendered but clamped — `line-clamp-3` on the Menu tab,
  `line-clamp-6` in the wizard.
- **No file.** No image, no PDF, nothing to open.

So the honest options are:

1. **Un-clamp the existing preview** (a "Show more" toggle) — this is what actually helps today, and it
   needs no new data, no API change and no gate.
2. **Fix the url-only gap** — move the `{allergenUrl && <a …>}` link out of the `{allergenInfoText && …}`
   wrapper at `:4207`, so a file shows whether or not text exists. Latent today, real the first time an
   AI pass fails after an upload.
3. **A modal viewer** — only worth it once a truck actually has a file, and it would want extracting
   (section 2b), since three surfaces already render this inline.

**I am not proposing a build; you asked what there is to view, and the answer is "text, already on
screen, truncated".**

---

## 7. READ vs INFERRED

**Read from source:** every write site for both columns; the upload/save handlers; `handleSaveAllergens`'s
flattening; the customer page's card block; the wizard's card block; the Menu tab's indicator, `hasCard`
and preview; `canEditAllergens`'s definition and both its gate sites; `ALLERGEN_FORBIDDEN`'s write-only
condition; `lib/image-utils.ts` in full; `next.config.ts`'s remotePatterns; `process-allergens`' return
shape.

**Read from the live database:** one `SELECT` over `id, allergen_display_mode, allergen_info_url,
allergen_info_text` for all fourteen trucks. **No write.**

**INFERRED, labelled in place:** that a url-without-text state would arise from `:3406` swallowing an
upload failure; that no upload-side file-type restriction exists; that a new viewer would be the fourth
inline copy; whether the URL column is empty because the path was never used or because a write failed.

**Not established:** whether `truck-media` enforces any content-type policy at the bucket level.
