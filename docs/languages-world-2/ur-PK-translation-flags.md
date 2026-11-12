# Translation check — ur-PK

5911 keys checked against en-GB's 5897. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 91 · glossary 60 · banned 0 · invariants 0 · numbers 1 · length 142 · drift 875 · plans 0 · other 0.

## English left (91)

| Key | Flag | Text |
|---|---|---|
| `order.dualNetworkNotice` | English word(s): eftpos | ادائیگی کی معلومات درج کرتے وقت جو بھی پیمنٹ برانڈ لوگو نظر آئے، جب بھی آپ ایسا ڈوئل نیٹ ورک ڈیبٹ کارڈ استعمال کرتے ہیں  |
| `dashboard.toast.orderUrlMissing` | English word(s): slug | آرڈر کا لنک دستیاب نہیں — لنک کا نام (slug) سیٹ نہیں ہے |
| `printing.card.noPrinter` | English word(s): bluetooth | <b>کوئی پرنٹر منسلک نہیں۔</b> {withDetail, select, yes {{detail}۔ } other {}}ٹکٹ پرنٹ کرنا شروع کرنے کے لیے Bluetooth رس |
| `printing.card.bluetoothOff` | English word(s): bluetooth | اس ڈیوائس پر Bluetooth بند ہے۔ سیٹنگز میں اسے آن کریں، پھر دوبارہ اسکین کریں۔ |
| `printing.card.bluetoothUnauthorised` | English word(s): bluetooth | HatchGrab کو Bluetooth استعمال کرنے کی اجازت چاہیے۔ سیٹنگز ← HatchGrab ← Bluetooth میں اجازت دیں، پھر دوبارہ اسکین کریں۔ |
| `printing.card.bluetoothUnsupported` | English word(s): bluetooth | پرنٹنگ کے لیے HatchGrab ایپ ضروری ہے — ویب براؤزر Bluetooth پرنٹر تک نہیں پہنچ سکتا۔ |
| `printing.card.typeBluetooth` | identical to en-GB | Bluetooth |
| `nativeShell.binary.bluetoothUsage` | English word(s): bluetooth | HatchGrab آپ کے کچن کے رسید پرنٹر سے جڑنے کے لیے Bluetooth استعمال کرتا ہے تاکہ آرڈر کے ٹکٹ خود بخود پرنٹ ہو سکیں۔ یہ کس |
| `nativeShell.binary.faceIdUsage` | English word(s): face | Face ID سے HatchGrab کھولیں۔ |
| `nativeShell.lock.cantUseBiometric` | English word(s): face, touch | Face / Touch ID استعمال نہیں کر سکتے؟ |
| `nativeShell.lock.tryBiometric` | English word(s): face, touch | اس کے بجائے Face / Touch ID آزمائیں |
| `alertsOperator.paymentBlocked.payDirect` | English word(s): manager | ان میسجز کی ادائیگی آپ براہ راست WhatsApp کو کرتے ہیں، اس لیے یہ مسئلہ HatchGrab میں نہیں بلکہ WhatsApp Manager میں ٹھیک |
| … | 79 more | |

## Glossary term not used (60)

| Key | Flag | Text |
|---|---|---|
| `dashboard.header.kitchenScreen` | "KDS" → expected "کچن ڈسپلے (KDS)" | کچن ڈسپلے |
| `dashboard.settings.orderReadyHelp` | "KDS" → expected "کچن ڈسپلے (KDS)" | آرڈرز اسکرین پر “تیار ہے” کا بٹن دکھائیں۔ کچن ڈسپلے کی سیٹنگ الگ ہے۔ آرڈر تیار مارک ہونے پر گاہک کو ہر بار ای میل جاتی ہ |
| `dashboard.settings.intervalsHelp` | "Pickup time" → expected "پک اپ کا وقت" | پک اپ کے اوقات کے درمیان کتنا وقفہ ہو۔ اس سے کچن کی گنجائش یا تیاری کے اوقات نہیں بدلتے۔ |
| `dashboard.kds.title` | "KDS" → expected "کچن ڈسپلے (KDS)" | کچن ڈسپلے کھولیں |
| `dashboard.kds.body` | "KDS" → expected "کچن ڈسپلے (KDS)" | چنیں کہ کس گاڑی کا کچن ڈسپلے کھولنا ہے: |
| `emailCustomer.confirmation.cancelLine` | "Pickup time" → expected "پک اپ کا وقت" | {n, plural, one {منسوخ کرنا ہے؟<link>اپنا آرڈر منسوخ کریں</link>(پک اپ کے وقت سے {count} منٹ پہلے تک)} other {منسوخ کرنا |
| `errorsKitchen.intervals_choices` | "Pickup time" → expected "پک اپ کا وقت" | پک اپ کے اوقات ہر {choices} منٹ بعد ہونے چاہییں۔ |
| `errorsKitchen.intervals_customer_first` | "Pickup time" → expected "پک اپ کا وقت" | اپنے اوقات طے کرنے سے پہلے گاہکوں کے پک اپ کے اوقات طے کریں۔ |
| `errorsKitchen.intervals_save_failed` | "Pickup time" → expected "پک اپ کا وقت" | پک اپ کے اوقات اس وقت محفوظ نہیں ہو سکے۔ |
| `kitchenModals.extraWait.hint` | "Pickup time" → expected "پک اپ کا وقت" | نئے آرڈرز پر بتائے گئے پک اپ کے وقت میں اضافہ کرتا ہے۔ اس سے ایونٹ کے اختتام کا وقت نہیں بدلتا۔ |
| `printing.card.leadLabel` | "Pickup time" → expected "پک اپ کا وقت" | پک اپ کے وقت سے کتنے منٹ پہلے |
| `printing.card.modeOnConfirmedHint` | "Pickup time" → expected "پک اپ کا وقت" | پہلے سے دیا گیا پری آرڈر قبول کرتے ہی پرنٹ ہو جاتا ہے، جو پک اپ کے وقت سے کئی گھنٹے پہلے ہو سکتا ہے۔ جو آرڈرز آپ نے ابھی |
| … | 48 more | |

## Numbers, prices or brands changed (1)

| Key | Flag | Text |
|---|---|---|
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +92 300 1234567 |

## Likely to overflow (much longer than en-GB) (142)

| Key | Flag | Text |
|---|---|---|
| `order.retrying` | 22 chars vs en-GB 9 (×2.44) | دوبارہ کوشش ہو رہی ہے… |
| `order.retry` | 16 chars vs en-GB 5 (×3.20) | دوبارہ کوشش کریں |
| `order.add` | 9 chars vs en-GB 3 (×3.00) | شامل کریں |
| `order.edit` | 10 chars vs en-GB 4 (×2.50) | ترمیم کریں |
| `order.paidByCard` | 22 chars vs en-GB 12 (×1.83) | کارڈ سے ادائیگی ہو گئی |
| `dashboard.common.saving` | 16 chars vs en-GB 7 (×2.29) | محفوظ ہو رہا ہے… |
| `dashboard.common.ok` | 7 chars vs en-GB 2 (×3.50) | ٹھیک ہے |
| `dashboard.common.savingDots` | 16 chars vs en-GB 7 (×2.29) | محفوظ ہو رہا ہے… |
| `dashboard.common.save` | 10 chars vs en-GB 4 (×2.50) | محفوظ کریں |
| `dashboard.profile.title` | 22 chars vs en-GB 12 (×1.83) | پروفائل میں ترمیم کریں |
| `dashboard.edit.noSlot` | 14 chars vs en-GB 7 (×2.00) | کوئی سلاٹ نہیں |
| `menuBadges.allergen.Crustaceans` | 31 chars vs en-GB 11 (×2.82) | کرسٹیشینز (جھینگا، کیکڑا وغیرہ) |
| … | 130 more | |

## Back-translation drifts from en-GB (875)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 40% — en-GB: "Add a tip for the truck?" · back: "Would you like to give a tip for the truck?" | کیا آپ ٹرک کے لیے ٹپ دینا چاہیں گے؟ |
| `order.state.confirmRejected` | meaning overlap 40% — en-GB: "This order was not accepted by the truck." · back: "The truck did not accept this order." | ٹرک نے یہ آرڈر قبول نہیں کیا۔ |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be at most  {amount} ." | ٹپ زیادہ سے زیادہ {amount} ہو سکتی ہے۔ |
| `order.pausedNotice` | meaning overlap 46% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are paused at the moment — please check again in a little while. Your order is save" | آرڈرز اس وقت روکے گئے ہیں — براہ کرم تھوڑی دیر میں دوبارہ دیکھیں۔ آپ کا آرڈر یہاں محفوظ ہے۔ |
| `order.eventsRetryHint` | meaning overlap 43% — en-GB: "Give it a moment, then tap to try again." · back: "Wait a little, then tap to try again." | تھوڑا انتظار کریں، پھر دوبارہ کوشش کے لیے ٹیپ کریں۔ |
| `order.retrying` | meaning overlap 0% — en-GB: "Retrying…" · back: "Trying again…" | دوبارہ کوشش ہو رہی ہے… |
| `order.retry` | meaning overlap 0% — en-GB: "Retry" · back: "Try again" | دوبارہ کوشش کریں |
| `order.orderingHasClosed` | meaning overlap 33% — en-GB: "Ordering has closed" · back: "Orders have closed" | آرڈرز بند ہو چکے ہیں |
| `order.closedAt` | meaning overlap 45% — en-GB: "Online ordering for this event ended at  {time} . We hope to see you next time!" · back: "Online orders for this event closed at  {time} . We hope to meet next time!" | اس ایونٹ کے لیے آن لائن آرڈرز {time} پر بند ہو گئے۔ امید ہے اگلی بار ملاقات ہو گی! |
| `order.pausedOfflineBody` | meaning overlap 33% — en-GB: "We’re having a connection issue but you can still order at the window. Check back soon!" · back: "We have a connection problem, but you can still order at the truck. Check again soon!" | ہمیں کنکشن کا مسئلہ ہے، لیکن آپ اب بھی ٹرک پر آرڈر کر سکتے ہیں۔ جلد دوبارہ دیکھیں! |
| `order.pausedBody` | meaning overlap 30% — en-GB: "Check back shortly or order at the window when you arrive." · back: "Check again in a little while or order at the truck when you arrive." | تھوڑی دیر میں دوبارہ دیکھیں یا پہنچ کر ٹرک پر آرڈر کریں۔ |
| `order.notOpenTitle` | meaning overlap 33% — en-GB: "Orders not open yet" · back: "Orders have not opened yet" | آرڈرز ابھی شروع نہیں ہوئے |
| … | 863 more | |

