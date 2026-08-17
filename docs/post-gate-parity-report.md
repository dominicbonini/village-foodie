# Post-gate parity: one shared handler for both surfaces

**Stage 1 passed all three gates, so Stage 2 ran.** `npx tsc --noEmit` passes with no output — **which is
not verification.**

**Three files changed:** one created (`lib/native/useGatedActionResult.tsx`) and two edited
(`app/dashboard/[token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx`). **No commit, no stage, no
revert, no stash, no clean.** No build, no `next dev`, no `next build`, no `cap sync`, no deploy, no
SQL, no migration. **Nothing under `app/api`. `gatedAction`, `lib/native/outbox.ts`, `reachability`, the
drain, the `expected_from` guard, the two overlay MODULES, `useOutboxConflicts`, `OfflineBanner` and the
action endpoint were READ and not edited** — EXECUTED: `git diff --quiet HEAD` still reports every one of
them unchanged.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1 — THE SHAPES, PROVEN BEFORE ANYTHING MOVED

## The complete blocks, both surfaces, BEFORE

### DASHBOARD — `doAction`, the whole post-gate body

```tsx
      if(result.queued){
        // OFFLINE: the optimistic advance is now a DURABLE render-time overlay derived from the outbox (FIX 2),
        // NOT a one-shot setOrders patch (a stale poll / SW-cache read would wipe that — the revert bug). We
        // just refresh the overlay so the card advances instantly; it outlives reads and auto-clears on drain.
        const q=orders.find(o=>o.order_key===orderKey)??deviceQueuedOrders.find(o=>o.order_key===orderKey)
        refreshPendingStatus(); refreshPendingPayment()
        // Mirror the online prep-board auto-clear on ready/collected.
        if((action==='ready'||isCollectAction(action))&&q){
          setStruckPrep(prev=>{const n=new Set(prev);q.items.forEach((item:any)=>{for(let u=0;u<item.quantity;u++)n.add(`${orderKey}:${item.name}:${u}`)});return n})
        }
        setActionLoading(null)
        const offlineUndo=async()=>{
          const removed=await removePendingStatusOp(orderKey)
          if(removed){
            dropOverlayEntry(orderKey); refreshPendingStatus()
            // Un-strike this order's prep pills (the onUndoRestore side-effect).
            setStruckPrep(prev=>{const n=new Set(prev);prev.forEach(k=>{if(k.split(':')[0]===orderKey)n.delete(k)});return n})
            showToast(`Order #${q?.id??''} reverted`)
          }else if(action==='ready'){undoReady(orderKey,q?.id??'')}
          else if(isCollectAction(action)){doAction('undo_collected',orderKey)}
          else{fetchAll()}
        }
        const savedMsg=`Order #${q?.id??''} saved`
        if(action==='ready'||isCollectAction(action)){
          showToast(savedMsg,'success',{duration:7000,action:{label:'↩ Undo',run:offlineUndo}})
        }else{showToast(savedMsg)}
        return
      }
      const data=result.data??{}; if(!result.ok)throw new Error(data.error)
      const labels:Record<string,string>={confirm:'confirmed',reject:'rejected',ready:'ready',collected:'collected',undo_collected:'restored',cancel:'cancelled'}
      const done=orders.find(o=>o.order_key===orderKey)
      const num=done?.id??''
      const moneyFailed=!!data.paymentWarning
      if(moneyFailed){
        showToast(
          `⚠ Order #${num} — PAYMENT NOT RECORDED. ${isCollectAction(action)?'The order completed':'The order was saved'}; the money did not.`,
          'error',
          {duration:20000,action:{label:'Record payment',run:()=>doAction('mark_paid',orderKey)}},
        )
      }else if(action==='mark_paid'){
        showToast(`Order #${num} marked paid`,'success',{duration:7000,action:{label:'↩ Undo',run:()=>doAction('undo_mark_paid',orderKey)}})
      }else if(action==='undo_mark_paid'){
        showToast('Undone — payment removed')
      }else if(action==='undo_collected'){
        showToast('Undone — order not collected')
      }else if(isCollectAction(action)){
        showToast(`Order #${num} collected`,'success',{duration:7000,action:{label:'↩ Undo',run:()=>doAction('undo_collected',orderKey)}})
      }else if(action==='ready'){
        scheduleReadyEmail(orderKey)
        showToast(
          done?.buzzer_number!=null
            ? <>Order #{num} ready · {buzzerPill(done.buzzer_number)}</>
            : `Order #${num} ready`,
          'success',{duration:4000,action:{label:'↩ Undo',run:()=>undoReady(orderKey,num)}})
      }else{
        showToast(`Order #${num} ${labels[action]||action}`)
      }
      // Auto-clear prep board on collected (solo operator workflow)
      if(isCollectAction(action)||action==='ready'){
        if(done){
          setStruckPrep(prev=>{
            const n=new Set(prev)
            done.items.forEach(item=>{
              for(let u=0;u<item.quantity;u++) n.add(`${orderKey}:${item.name}:${u}`)
            })
            return n
          })
        }
      }
      await fetchAll()
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
```

### KDS — `handleAction`, the whole post-gate body

```tsx
      if (result.queued) {
        // QUEUED OFFLINE → the ready did NOT commit server-side. Do NOT schedule the customer email…
        refreshPendingStatus()
        setPendingSyncCount(c => c + 1)
        setPendingSync(prev => new Set(prev).add(orderKey))
        setActionLoading(null)
        if (action === 'ready') {
          const num = orders.find(o => o.order_key === orderKey)?.id ?? ''
          const offlineUndo = async () => {
            const removed = await removePendingStatusOp(orderKey)
            if (removed) {
              dropOverlayEntry(orderKey); refreshPendingStatus()
              setPendingSync(prev => { const n = new Set(prev); n.delete(orderKey); return n }); setPendingSyncCount(c => Math.max(0, c - 1))
              showToast(`Order #${num} reverted`)
            } else { undoReady(orderKey, num) }
          }
          showToast(`Order #${num} saved`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
        }
        return
      }
      const payWarn = (result.data as { paymentWarning?: string } | undefined)?.paymentWarning
      if (payWarn && result.ok) {
        const num = orders.find(o => o.order_key === orderKey)?.id ?? ''
        showToast(
          `⚠ Order #${num} — PAYMENT NOT RECORDED. The order went through; the money did not.`,
          'error',
          { duration: 20000, action: { label: 'Record payment', run: () => { void handleActionRef.current('mark_paid', orderKey) } } },
        )
      }
      if (action === 'ready' && result.ok) {
        const readyOrder = orders.find(o => o.order_key === orderKey)
        const num = readyOrder?.id ?? ''
        scheduleReadyEmail(orderKey)
        showToast(
          readyOrder?.buzzer_number != null
            ? <>Order #{num} ready · {buzzerPill(readyOrder.buzzer_number)}</>
            : `Order #${num} ready`,
          'success', { duration: 4000, action: { label: '↩ Undo', run: () => undoReady(orderKey, num) } })
      }
    } catch {}
    setActionLoading(null)
    fetchAllRef.current()
```

# 🔴 THE ERROR PATH, SIDE BY SIDE, BECAUSE IT IS THE WORST OF THE FOUR GAPS

| | Dashboard | KDS |
|---|---|---|
| server rejection (`!result.ok`) | `throw new Error(data.error)` | 🔴 **not tested at all** — `payWarn && result.ok` and `action==='ready' && result.ok` simply do nothing |
| thrown anything | `catch(err:any){showToast(err.message\|\|'Failed','error')}` | 🔴 **`} catch {}`** |
| loading state | `finally{setActionLoading(null)}` | after the try, unguarded |

## THE OBSERVABLE-EFFECT TABLE — before this task

**Q = queued branch · C = committed branch.**

| Observable effect | Dash Q | KDS Q | Dash C | KDS C |
|---|---|---|---|---|
| **toast fired — `ready`** | IDENTICAL | IDENTICAL | IDENTICAL | IDENTICAL |
| **toast fired — `collected`** | fires | 🔴 **ABSENT** | fires | 🔴 **ABSENT** |
| **toast fired — `mark_paid`** | fires | 🔴 **ABSENT** | fires | 🔴 **ABSENT** |
| **toast fired — `undo_*`** | fires | 🔴 **ABSENT** | fires | 🔴 **ABSENT** |
| **toast fired — anything else** | fires (`labels` fallback) | 🔴 **ABSENT** | fires | 🔴 **ABSENT** |
| **toast copy — `ready`** | `Order #N saved` | IDENTICAL | `Order #N ready` | IDENTICAL |
| **toast copy — `paymentWarning`** | `…${isCollectAction?'The order completed':'The order was saved'}…` | n/a | as left | 🔴 **DIFFERENT** — `The order went through` |
| **duration — queued undo** | 7000 | IDENTICAL | — | — |
| **duration — committed ready** | — | — | 4000 | IDENTICAL |
| **duration — `paymentWarning`** | — | — | 20000 | IDENTICAL |
| **duration — mark_paid / collected** | — | — | 7000 | 🔴 **ABSENT** |
| **Undo offered** | ready + collect | 🔴 **ready only** | ready, mark_paid, collect | 🔴 **ready only** |
| **Undo target — queued** | remove op → else undoReady / `undo_collected` / refetch | 🔴 **DIFFERENT** — remove op → else `undoReady` only |
| **Undo target — committed** | `undo_mark_paid` · `undo_collected` · `undoReady` | 🔴 **`undoReady` only** |
| **overlay refresh — status** | IDENTICAL | IDENTICAL | — | — |
| **overlay refresh — payment** | `refreshPendingPayment()` | 🔴 **ABSENT** | — | — |
| **prep-pill strike** | fires | ABSENT *(deliberate)* | fires | ABSENT *(deliberate)* |
| **queued-count state** | ABSENT *(deliberate)* | fires | — | — |
| **buzzer pill in ready toast** | — | — | IDENTICAL | IDENTICAL |
| **error surfaced** | `throw` → toast | 🔴 **ABSENT** | `throw` → toast | 🔴 **ABSENT — `catch {}`** |

## S1 — DELIBERATE vs MERELY MISSING

# ✅ EXACTLY TWO ARE DELIBERATE. EVERY OTHER DIFFERENCE IS MISSING CODE.

**DELIBERATE — the prep pills. READ, the KDS's own comment at its `useReadyEmailUndo` call site:**

```
  // Shared stacked-toast + ready-email-undo machinery (the SAME modules the dashboard uses). KDS passes
  // NO onUndoRestore — it has no prep pills; undo just reverts status and the order re-appears in cookOrders
```

**DELIBERATE — the queued-op counter.** ⚠️ **No comment argues for it, but it is a KDS FEATURE the
dashboard does not have** (the header's *"N actions queued"*), not an absence: EXECUTED — `grep -c
pendingSyncCount` on the dashboard returns **0**.

**MERELY MISSING — everything else, and no comment anywhere records a decision.** EXECUTED: scans of
both files for a comment mentioning the missing toasts, the missing Undo targets, the payment overlay or
the empty catch return nothing. 🔴 **The KDS's `catch {}` in particular is argued AGAINST by the file's
own comment three lines above it** — *"this handler checks `result.ok` only for 'ready', and its
`catch {}` is empty"* — which names the gap as a defect while leaving it in place.

## S2 — THE PAYMENT OVERLAY: A WIRING JOB, NOT A DESIGN CHANGE

# ✅ NO BLOCKER. IT WAS NEVER CALLED, NEVER PREVENTED.

**READ — the hook's entire input contract:**

```ts
export interface PaymentOrderLike { order_key: string; confirmedPaid: boolean }
```

**✅ EXECUTED — the KDS already holds all three ingredients:**

```
app/dashboard/[token]/kds/page.tsx:26   import { getOrderBalance, hasUnrecordedPayment, type LedgerRow } …
app/dashboard/[token]/kds/page.tsx:107  const [payments, setPayments] = useState<Record<string, LedgerRow[]>>({})
                                        `orders` — the same merged set the dashboard resolves over
```

🔴 **IT IS A WIRING JOB. Three lines: a memo, the hook, the prop.** ⚠️ **The only thing it needed that the
KDS lacked was `useMemo` in the React import — which is a missing import, not a design.**

## S3 — CAN ONE FUNCTION SERVE BOTH?

# ✅ YES. NOTHING PREVENTS IT. Stage 2 proceeded.

**Every element of both blocks falls into one of three classes, and none of the three resists sharing:**

1. **Identical logic** — the queued/committed split, the `removePendingStatusOp` undo, the `!result.ok`
   throw, the whole toast chain. Same code, different whitespace.
2. **A string derived from `(action, order)`** — every toast. Both surfaces have an order and an action.
3. **A surface-specific side effect** — prep pills (dashboard), queued counter (KDS). **These are exactly
   the `EventActionsModal` shape.** READ, that file's contract:

```ts
  /** Start / Restart. Omit to hide. Only rendered for `confirmed` or `closed`. */
  onStartEvent?: () => void
  /** Omit BOTH to hide the pause row. Only rendered for a LIVE (`open`) event. */
  onPause?: () => void
```

⚠️ **The one thing that genuinely differs and CANNOT be a callback is `findOrder`: the dashboard falls
back to `deviceQueuedOrders` and the KDS has no create path.** ✅ **Which is why `findOrder` is a
REQUIRED callback rather than shared code — the resolution belongs to the caller.**

---

# STAGE 2 — THE EXTRACTION

## The new module — `lib/native/useGatedActionResult.tsx`

⚠️ **`.tsx`, NOT `.ts`, AND THE BRIEF ALLOWED "or similar".** The committed-`ready` toast renders a JSX
fragment (`<>Order #{num} ready · {buzzerPill(…)}</>`); a `.ts` file cannot hold markup, and moving that
fragment was not optional — it is the one string whose cross-surface byte-identity was already a stated
design requirement.

**Its contract — READ:**

```ts
export interface GatedActionEffects<TOrder extends GatedOrderLike> {
  // ── REQUIRED — both surfaces have all of these today ──────────────────────────────────────────────
  showToast: ShowToast
  findOrder: (orderKey: string) => TOrder | undefined
  refreshPendingStatus: () => void
  dropOverlayEntry: (orderKey: string) => void
  scheduleReadyEmail: (orderKey: string) => void
  undoReady: (orderKey: string, displayId: string | number) => void
  runAction: (action: string, orderKey: string) => void
  refetch: () => void | Promise<void>
  setActionLoading: (v: string | null) => void

  // ── OPTIONAL — omit to omit the effect ────────────────────────────────────────────────────────────
  refreshPendingPayment?: () => void
  onQueued?: (orderKey: string) => void
  onQueuedUndone?: (orderKey: string) => void
  onPrepStrike?: (orderKey: string, order: TOrder) => void
  onPrepUnstrike?: (orderKey: string) => void
}
```

# 🔴 THE DASHBOARD, BRANCH BY BRANCH — BEFORE vs AFTER

**The proof is structural: the module's body IS the dashboard's body, re-indented. Here is the mapping,
statement for statement, in execution order.**

## Queued branch

| # | Dashboard BEFORE | Module AFTER | Equivalent? |
|---|---|---|---|
| 1 | `const q=orders.find(…)??deviceQueuedOrders.find(…)` | `const q = findOrder(orderKey)` — and the dashboard passes **that exact expression** as `findOrder` | ✅ |
| 2 | `refreshPendingStatus(); refreshPendingPayment()` | `refreshPendingStatus(); refreshPendingPayment?.()` — dashboard passes it, so it fires | ✅ |
| 3 | *(nothing)* | `onQueued?.(orderKey)` — **dashboard passes no `onQueued`** ⇒ no-op | ✅ |
| 4 | `if((action==='ready'\|\|isCollectAction(action))&&q){setStruckPrep(…)}` | `if ((action === 'ready' \|\| isCollectAction(action)) && q) onPrepStrike?.(orderKey, q)` — the callback holds the identical `setStruckPrep` body | ✅ |
| 5 | `setActionLoading(null)` | `setActionLoading(null)` | ✅ |
| 6 | `offlineUndo` closure | identical, in the same position | ✅ |
| 7 | `const savedMsg=…` then the ready/collect ternary | identical | ✅ |
| 8 | `return` | `return` | ✅ |

**READ — the dashboard's `findOrder`, keeping its fallback exactly:**

```tsx
    findOrder:(k)=>orders.find(o=>o.order_key===k)??deviceQueuedOrders.find(o=>o.order_key===k),
```

**READ — its two prep callbacks, holding the two `setStruckPrep` bodies verbatim:**

```tsx
    onPrepStrike:(orderKey,order)=>{
      setStruckPrep(prev=>{
        const n=new Set(prev)
        order.items.forEach((item:any)=>{
          for(let u=0;u<item.quantity;u++) n.add(`${orderKey}:${item.name}:${u}`)
        })
        return n
      })
    },
    onPrepUnstrike:(orderKey)=>{
      setStruckPrep(prev=>{const n=new Set(prev);prev.forEach(k=>{if(k.split(':')[0]===orderKey)n.delete(k)});return n})
    },
```

## `offlineUndo`

| Dashboard BEFORE | Module AFTER | Equivalent? |
|---|---|---|
| `dropOverlayEntry(orderKey); refreshPendingStatus()` | same | ✅ |
| *(nothing)* | `onQueuedUndone?.(orderKey)` — **not passed by the dashboard** | ✅ |
| `setStruckPrep(…unstrike…)` | `onPrepUnstrike?.(orderKey)` | ✅ |
| `showToast(\`Order #${q?.id??''} reverted\`)` | same | ✅ |
| `else if(action==='ready'){undoReady(…)}` | same | ✅ |
| `else if(isCollectAction(action)){doAction('undo_collected',orderKey)}` | `runAction('undo_collected', orderKey)` — dashboard passes `(a,k)=>doAction(a,k)` | ✅ |
| `else{fetchAll()}` | `else { void refetch() }` — dashboard passes `refetch:fetchAll` | ✅ |

## Committed branch

| Dashboard BEFORE | Module AFTER | Equivalent? |
|---|---|---|
| `const data=result.data??{}; if(!result.ok)throw new Error(data.error)` | same, and the throw still lands in the page's own `catch` | ✅ |
| `labels` map | same six entries, same order | ✅ |
| `const done=orders.find(…)` | `const done = findOrder(orderKey)` | ⚠️ **see the note below** |
| `moneyFailed` 20s error toast + `Record payment` → `doAction('mark_paid')` | identical, `runAction('mark_paid', …)` | ✅ |
| `mark_paid` 7s + Undo → `undo_mark_paid` | identical | ✅ |
| `undo_mark_paid` → `'Undone — payment removed'` | identical | ✅ |
| `undo_collected` → `'Undone — order not collected'` | identical | ✅ |
| `isCollectAction` 7s + Undo → `undo_collected` | identical | ✅ |
| `ready` → `scheduleReadyEmail` + buzzer-pill toast, 4s, Undo → `undoReady` | identical | ✅ |
| `else` → `labels` fallback | identical | ✅ |
| prep strike for collect/ready | `onPrepStrike?.(orderKey, done)` | ✅ |
| `await fetchAll()` | `await refetch()` | ✅ |

⚠️ **THE ONE PLACE WHERE THE DASHBOARD'S TEXT CHANGED, AND WHY IT IS STILL EQUIVALENT.** In the COMMITTED
branch the dashboard used `orders.find(…)` **without** the `deviceQueuedOrders` fallback, while its
QUEUED branch used the fallback. The module calls one `findOrder` in both, so the committed branch now
also consults `deviceQueuedOrders`. 🔴 **This cannot change the dashboard's output: `deviceQueuedOrders`
holds only OFFLINE-CREATED orders, and the committed branch is by definition the ONLINE path** — READ,
the dashboard's own comment: *"deviceQueuedOrders is ONLY ever populated by an OFFLINE create"*. **An
order cannot be in that list and be committing online in the same call.** ✅ **The fallback is therefore
unreachable there, and `done` resolves identically. Declared rather than buried.**

# ✅ EVERY OTHER DASHBOARD BRANCH IS THE SAME EXPRESSION, RELOCATED. NO STOP CONDITION MET.

**EXECUTED — the dashboard's `doAction` is now nine lines and holds no post-gate logic at all:**

```tsx
  const doAction=async(action:string,orderKey:string)=>{
    if(action==='cancel'){const ord=orders.find(o=>o.order_key===orderKey)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
    if(action==='reject'){const ord=orders.find(o=>o.order_key===orderKey)??null;setRejectingOrder(ord);setShowRejectModal(true);return}
    setActionLoading(`${action}-${orderKey}`)
    try{
      // Offline GATE (mirrors KDS): online → normal write; offline (native) → durable outbox + queued.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      await handleGateResult(result,action,orderKey)
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
  }
```

✅ **The `cancel`/`reject` modal interception, the `setActionLoading` bracket, the gate call and the
catch/finally are byte-identical to before.**

## THE KDS AFTER — the four gains

**READ — its whole handler now:**

```tsx
  const handleAction = useCallback(async (action: string, orderKey: string) => {
    setActionLoading(`${action}-${orderKey}`)
    try {
      const result = await gatedAction({
        url: '/api/dashboard/action',
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
      // 🔴 THE EMPTY `catch {}` IS GONE. The shared handler throws on a server rejection exactly as the
      // dashboard always did, and this catch is what surfaces it.
      await handleGateResult(result, action, orderKey)
    } catch (err: any) { showToast(err.message || 'Failed', 'error') } finally { setActionLoading(null) }
  }, [token, pin, handleGateResult, showToast])
```

**READ — its two callbacks, and only two:**

```tsx
    onQueued: (k) => { setPendingSyncCount(c => c + 1); setPendingSync(prev => new Set(prev).add(k)) },
    onQueuedUndone: (k) => {
      setPendingSync(prev => { const n = new Set(prev); n.delete(k); return n }); setPendingSyncCount(c => Math.max(0, c - 1))
    },
```

**READ — the payment overlay, newly wired:**

```tsx
  const paymentOrders = useMemo(() => orders.map(o => ({
    order_key: o.order_key,
    confirmedPaid: (() => { const b = getOrderBalance(o as never, payments[o.order_key] ?? []); return b.status === 'paid' || b.status === 'refunded' || b.status === 'part_refunded' })(),
  })), [orders, payments])
  const { overlay: paymentOverlay, refresh: refreshPendingPayment } = useOfflinePaymentOverlay(paymentOrders)
```

**READ — and into the card:**

```tsx
                pendingPayment={paymentOverlay.get(order.order_key)}
```

| Acceptance item | Delivered by |
|---|---|
| **1. A toast on EVERY action, queued and committed** | ✅ the shared chain, incl. the `labels` fallback |
| **2. Undo on the same actions the dashboard offers it on** | ✅ `mark_paid` → `undo_mark_paid`, collect → `undo_collected`, ready → `undoReady`, queued ready/collect → `offlineUndo` |
| **3. The payment overlay + `pendingPayment` prop** | ✅ quoted above |
| **4. Errors surfaced; the empty `catch {}` gone** | ✅ quoted above |

## 🔴 ONE KDS-SIDE CONSEQUENCE I AM DECLARING RATHER THAN BURYING

**The brief required the KDS to "match the dashboard's `if(!result.ok)throw` and let the shared handler
surface it".** That throw must be caught by a handler that also owns the loading state, so the KDS
adopted the dashboard's `catch/finally` shape. **A second-order effect follows:**

| | KDS BEFORE | KDS AFTER |
|---|---|---|
| committed path | `setActionLoading(null)` **then** `fetchAllRef.current()` (unawaited) | `await refetch()` **then** `finally { setActionLoading(null) }` |

⚠️ **The KDS's button spinner now persists through the refetch instead of clearing just before it —
which is precisely what the dashboard has always done.** ✅ **The queued path is unaffected: it still
calls `setActionLoading(null)` before its toast and returns without refetching.** **Nothing else on the
KDS changed timing.**

## TOAST COPY — the byte-identity requirement, restated

**The KDS's former comment claimed:** *"The pill markup below is BYTE-IDENTICAL to the dashboard's so the
two surfaces cannot render differently."*

# ✅ IT IS STILL TRUE, AND NOW TRUE BY CONSTRUCTION RATHER THAN BY DISCIPLINE.

🔴 **There is no longer a "the dashboard's" and "the KDS's" version to compare — there is ONE expression,
in one file, rendered by both.** ✅ **EXECUTED — `grep -c "ready · "` returns `0` on the dashboard, `0` on
the KDS and `2` in the module** *(the JSX plus the comment that explains it)*. **A claim that used to
require a diff is now a structural impossibility to violate.**

⚠️ **The KDS's `paymentWarning` copy CHANGED, as instructed** — it adopted the dashboard's string
verbatim, so `The order went through; the money did not.` became
`${isCollectAction(action)?'The order completed':'The order was saved'}; the money did not.`

## Neither page retains a copy — EXECUTED

```
string                             dash   kds   module
"marked paid"                        0     0      1
"Undone — payment removed"           0     0      1
"Undone — order not collected"       0     0      1
"PAYMENT NOT RECORDED. "             0     0      1
"ready · "                           0     0      2
"reverted`"                          0     0      1
removePendingStatusOp                0     0      3
isCollectAction                      0     0      7
buzzerPill                           0     0      3
```

✅ **Both pages dropped the now-unused imports** (`removePendingStatusOp`, `isCollectAction`, `buzzerPill`
from the dashboard; `removePendingStatusOp`, `buzzerPill` from the KDS). 🔴 **There is no sixth block.**

## `public/sw.js` — reported, not touched

**As instructed. Its `vf-mutation-queue` IndexedDB store is still dead — EXECUTED, `grep -n "enqueue("`
returns exactly one line, the definition at `:41`, and zero call sites. The file was not opened for
writing.**

---

# 🔴 VERIFICATION

**`tsc --noEmit` passes with no output. THAT IS NOT VERIFICATION and is not counted below.**

| Item | Method |
|---|---|
| **KDS online: `mark_paid` toasts, `collected` toasts, both offer Undo** | 🔴 **SOURCE READ ONLY** — traced through the shared chain. **No KDS was opened; nothing was tapped** |
| **KDS offline: `mark_paid`/`collected` queue AND toast, with Undo** | 🔴 **SOURCE READ ONLY** — read from the queued branch's `action==='ready'\|\|isCollectAction(action)` test. ⚠️ **NOTE: `mark_paid` queued gets the plain `savedMsg` toast with NO Undo, because that is exactly what the dashboard does** — the queued Undo is offered for ready/collect only. Parity, not omission |
| **KDS: a queued `mark_paid` shows the payment overlay** | 🔴 **SOURCE READ ONLY** — the hook is wired and the prop is passed; **no card was rendered** |
| **KDS: a failing committed action surfaces an error** | 🔴 **SOURCE READ ONLY** — the `throw` and the new `catch` were read, not triggered |
| **Dashboard: all four actions behave as before, online and offline** | 🔴 **SOURCE READ ONLY** — proven by the statement-for-statement mapping above, **not by running the dashboard.** 🔴 **THIS IS PIZZERIA GUSTO'S LIVE MONEY PATH AND NOTHING HERE OBSERVED IT** |
| **The committed-ready toast markup is byte-identical across both surfaces** | ✅ **EXECUTED** — `grep -c` proves one copy in one file and zero in both pages. **This one IS verified, because it is now a counting fact rather than a rendering one** |
| Neither page retains a post-gate copy | ✅ **EXECUTED** — the string table above |
| The unused imports are gone and nothing else lost an import | ✅ **EXECUTED** — `grep -c` per symbol; `tsc` would have failed on an over-removal |
| The protected modules are untouched | ✅ **EXECUTED** — `git diff --quiet HEAD` per file |
| `public/sw.js` still has zero enqueue call sites | ✅ **EXECUTED** |
| Census, byte scan, carrier | ✅ **EXECUTED** |

🔴 **NOT ONE BEHAVIOURAL CLAIM IN THIS REPORT WAS OBSERVED. No browser, no device, no KDS, no dashboard
was opened. Every "it will toast" is read from a branch.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER writing.**

```
  app/dashboard/[token]/page.tsx                        384,065  offending=0  CR=0   (was 390,152)
  app/dashboard/[token]/kds/page.tsx                    137,629  offending=0  CR=0   (was 137,375)
  lib/native/useGatedActionResult.tsx                    13,711  offending=0  CR=0   (new)
  docs/post-gate-parity-report.md   (SEPARATE PASS)       35,740  offending=0  CR=0
TOTAL OFFENDING: 0
```

## Non-ASCII class census — before and after

### `app/dashboard/[token]/page.tsx` — **53 classes BEFORE, 53 AFTER**

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 2358 | 2252 | **−106** |
| U+2014 EM DASH | 509 | 496 | **−13** |
| U+2192 RIGHTWARDS ARROW | 110 | 106 | −4 |
| U+1F534 LARGE RED CIRCLE | 94 | 92 | −2 |
| **U+26A0 WARNING SIGN** | 78 | 76 | **−2** |
| U+FE0F | 76 | 75 | −1 |
| **U+21A9 LEFTWARDS ARROW WITH HOOK** | 6 | 2 | 🔴 **−4** — all four `↩ Undo` labels |
| U+00B7 · U+21D2 | 30 / 16 | 29 / 15 | −1 each |
| *every other class* | — | — | **0** |

### `app/dashboard/[token]/kds/page.tsx` — 34 classes BEFORE, **33 AFTER**

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| **U+21A9** | 2 | **0** | 🔴 **−2, CLASS LOST** — both `↩ Undo` labels |
| U+2192 | 22 | 19 | −3 |
| U+1F534 | 71 | 74 | **+3** — new comment prose |
| U+2014 | 200 | 202 | +2 — new comment prose |
| U+FE0F | 64 | 65 | +1 |
| U+00B7 · U+21D2 | 11 / 8 | 10 / 7 | −1 each |
| *every other class* | — | — | **0** |

### `lib/native/useGatedActionResult.tsx` — 0 classes BEFORE (new file), **10 AFTER**

`U+2500` ×450 · `U+2014` ×22 · `U+1F534` ×7 · `U+26A0` ×6 · `U+FE0F` ×5 · `U+21A9` ×4 · `U+2026` ×2 ·
`U+00B7` ×2 · `U+2192` ×2 · `U+21D2` ×1

# 🔴 DOES IT NET TO ZERO? NO — AND THE SHAPE OF THE MISS IS THE POINT.

**It nets to zero or NEGATIVE for everything that MOVED, and positive for comment prose that is NEW.
Both halves are visible in the arithmetic:**

| Glyph | dash | kds | module | NET | What it proves |
|---|---|---|---|---|---|
| **U+21A9 `↩`** | −4 | −2 | +4 | 🔴 **−2** | ✅ **THE DE-DUPLICATION, EXACTLY.** Four Undo labels + two Undo labels became four. The two the KDS duplicated are gone |
| **U+00B7 `·`** | −1 | −1 | +2 | **0** | the two `ready ·` toasts became one, plus one in a comment |
| **bare U+26A0** | −1 | −1 | +1 | 🔴 **−1** | the two `⚠ PAYMENT NOT RECORDED` strings became one |
| U+2500 | −106 | 0 | +450 | **+344** | ⚠️ **comment banners only** — no code carries this glyph |
| U+1F534 · U+2014 · U+2026 | −2 / −13 / 0 | +3 / +2 / 0 | +7 / +22 / +2 | +8 / +11 / +2 | ⚠️ **comment prose only** |
| U+2192 | −4 | −3 | +2 | **−5** | comment prose |

✅ **STATED PLAINLY: a pure extraction of a block that existed ONCE would net to zero. This extracted a
block that existed TWICE, so the moved content nets NEGATIVE by exactly the KDS's duplicate — two `↩`
and one bare `⚠`.** ⚠️ **The positive numbers are all documentation, and none of them is in a code path.**

## Carrier-aware check — the three edited files

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|---|
| dashboard | U+26A0 | 78 / 75 / **3** | 76 / 74 / **2** |
| KDS | U+26A0 | 64 / 63 / **1** | 64 / 64 / **0** |
| module | U+26A0 | — | 6 / 5 / **1** |

🔴 **THE BARE COUNTS ARE THE MIGRATION, NOT A REGRESSION. The dashboard's three bare warning signs were
its `paymentWarning` toast string and two JSX labels; the toast string moved, so it is 3 → 2. The KDS's
ONE bare glyph was its duplicate of that same string, deleted outright, so it is 1 → 0 — and every
warning sign now in that file is paired. The module's single bare glyph IS that string.** ✅ **4 bare
before, 3 after, and the missing one is the duplicate.**

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 61 | 0 | 61 |
| U+1F534 LARGE RED CIRCLE | 50 | 0 | 50 |
| **U+26A0 WARNING SIGN** | **19** | **15** | 🔴 **4** |
| U+21A9 LEFTWARDS ARROW WITH HOOK | 11 | 0 | 11 |

# 🔴 FOUR BARE U+26A0, AND ALL FOUR ARE QUOTATIONS OR REFERENCES TO ONE.

**Every warning sign I wrote as prose is paired — 15 of 15. The four bare ones are at lines 60, 125, 567
and 574:**

- **Lines 60 and 125** are the two verbatim `paymentWarning` toast strings quoted in the BEFORE blocks —
  the dashboard's and the KDS's. **Both source strings are bare**, and pairing them here would have
  misquoted the very code whose de-duplication this report is about.
- **Lines 567 and 574** are the census rows that COUNT those bare glyphs; each names the character
  itself, so it must appear in the form being counted.

✅ **The report's total `U+FE0F` count is 15, which exactly accounts for the 15 paired warning signs and
leaves none attached to any other base.** ✅ **The three unpaired bases are internally consistent — 0 of
61, 0 of 50, 0 of 11 — so no base is split across two renderings.** ⚠️ **`U+21A9` is bare 11 times by
necessity: every one is inside a quoted `'↩ Undo'` label, which the source writes bare.**

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/settings-copy.ts
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-status-badge-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? docs/offline-outbox-parity-report.md
?? docs/post-gate-parity-report.md
?? docs/settings-copy-report.md
?? lib/event-display.ts
?? lib/native/useGatedActionResult.tsx
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? lib/native/useGatedActionResult.tsx`** | 🔴 **THIS TASK — new file** |
| 🔴 **`?? docs/post-gate-parity-report.md`** | 🔴 **THIS TASK — new file** |
| `M app/dashboard/[token]/page.tsx` | ⚠️ **PARTLY** — nine earlier tasks; **this task removed its inline post-gate body** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — ten earlier tasks; **this task replaced its post-gate body and wired the payment overlay** |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the step switches. 🔴 **NOT touched this task** |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` | ✅ pre-existing — the settings copy task |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (fifteen earlier reports) | ✅ pre-existing |

✅ **Eight modified and twenty untracked before; eight modified and twenty-two untracked after. The two
new entries are the module and this report — no file was added or removed beyond them.**
