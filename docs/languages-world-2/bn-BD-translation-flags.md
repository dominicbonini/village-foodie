# Translation check — bn-BD

5911 keys checked against en-GB's 5897. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 88 · glossary 115 · banned 0 · invariants 0 · numbers 1 · length 128 · drift 1022 · plans 0 · other 0.

## English left (88)

| Key | Flag | Text |
|---|---|---|
| `order.dualNetworkNotice` | English word(s): eftpos | পেমেন্টের তথ্য দেওয়ার সময় যে পেমেন্ট ব্র্যান্ডের লোগো দেখানো হোক না কেন, eftpos এবং অন্য একটি পেমেন্ট ব্র্যান্ড দেখানো |
| `printing.say.netPermission` | English word(s): local, network | আপনার প্রিন্টারে পৌঁছাতে HatchGrab-এর অনুমতি লাগবে। সেটিংসে গিয়ে HatchGrab-এর জন্য লোকাল নেটওয়ার্ক (Local Network) চাল |
| `printing.card.noPrinter` | English word(s): bluetooth | <b>কোনো প্রিন্টার কানেক্ট করা নেই।</b> {withDetail, select, yes {{detail}। } other {}}টিকিট প্রিন্ট শুরু করতে একটি Bluet |
| `printing.card.bluetoothOff` | English word(s): bluetooth | এই ডিভাইসে Bluetooth বন্ধ আছে। সেটিংসে গিয়ে চালু করুন, তারপর আবার খুঁজুন। |
| `printing.card.bluetoothUnauthorised` | English word(s): bluetooth | Bluetooth ব্যবহার করতে HatchGrab-এর অনুমতি লাগবে। সেটিংস → HatchGrab → Bluetooth-এ গিয়ে অনুমতি দিন, তারপর আবার খুঁজুন। |
| `printing.card.bluetoothUnsupported` | English word(s): bluetooth | প্রিন্টিংয়ের জন্য HatchGrab অ্যাপ লাগবে — ওয়েব ব্রাউজার থেকে Bluetooth প্রিন্টারে পৌঁছানো যায় না। |
| `printing.card.typeBluetooth` | identical to en-GB | Bluetooth |
| `nativeShell.binary.bluetoothUsage` | English word(s): bluetooth | HatchGrab Bluetooth ব্যবহার করে আপনার কিচেনের রসিদ প্রিন্টারে কানেক্ট করতে, যাতে অর্ডারের টিকিট নিজে থেকেই প্রিন্ট হয়।  |
| `nativeShell.binary.faceIdUsage` | English word(s): face | Face ID দিয়ে HatchGrab আনলক করুন। |
| `nativeShell.lock.cantUseBiometric` | English word(s): face, touch | Face / Touch ID ব্যবহার করতে পারছেন না? |
| `nativeShell.lock.tryBiometric` | English word(s): face, touch | এর বদলে Face / Touch ID চেষ্টা করুন |
| `alertsOperator.paymentBlocked.button` | English word(s): manager | WhatsApp Manager খুলুন |
| … | 76 more | |

## Glossary term not used (115)

| Key | Flag | Text |
|---|---|---|
| `order.privateEvent` | "Private event" → expected "প্রাইভেট ইভেন্ট" | প্রাইভেট ইভেন্ট |
| `order.collectionTimeTitle` | "Pickup time" → expected "পিকআপের সময়" | পিকআপের সময় |
| `order.collectionTimeChosen` | "Pickup time" → expected "পিকআপের সময়" | ✓ পিকআপের সময়: {time} |
| `order.collectionTime` | "Pickup time" → expected "পিকআপের সময়" | পিকআপের সময়: {time} |
| `order.willConfirmTime` | "Pickup time" → expected "পিকআপের সময়" | অর্ডার গ্রহণ করার সময় {truck} আপনার পিকআপের সময় কনফার্ম করবে। |
| `dashboard.toast.intervalsSaved` | "Pickup time" → expected "পিকআপের সময়" | এই ইভেন্টের পিকআপের সময় সেভ হয়েছে |
| `dashboard.toast.intervalsFailed` | "Pickup time" → expected "পিকআপের সময়" | এই মুহূর্তে পিকআপের সময় সেভ করা যায়নি। |
| `dashboard.header.kitchenScreen` | "KDS" → expected "কিচেন ডিসপ্লে (KDS)" | কিচেন ডিসপ্লে |
| `dashboard.settings.orderReadyHelp` | "KDS" → expected "কিচেন ডিসপ্লে (KDS)" | অর্ডার স্ক্রিনে একটি “তৈরি” বাটন দেখায়। কিচেন ডিসপ্লে আলাদাভাবে সেট করা হয়। কোনো অর্ডার তৈরি হিসেবে চিহ্নিত করলেই গ্রা |
| `dashboard.settings.intervalsTitle` | "Pickup time" → expected "পিকআপের সময়" | পিকআপের সময় |
| `dashboard.settings.intervalsHelp` | "Pickup time" → expected "পিকআপের সময়" | পিকআপের সময়গুলোর মধ্যে কতটা ব্যবধান থাকবে। এতে কিচেনের সক্ষমতা বা প্রস্তুতির সময় বদলায় না। |
| `dashboard.settings.intervalsUnavailable` | "Pickup time" → expected "পিকআপের সময়" | এই মুহূর্তে পিকআপের সময় পাওয়া যাচ্ছে না। |
| … | 103 more | |

## Numbers, prices or brands changed (1)

| Key | Flag | Text |
|---|---|---|
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +880 1712-345678 |

## Likely to overflow (much longer than en-GB) (128)

| Key | Flag | Text |
|---|---|---|
| `order.retrying` | 22 chars vs en-GB 9 (×2.44) | আবার চেষ্টা করা হচ্ছে… |
| `order.retry` | 16 chars vs en-GB 5 (×3.20) | আবার চেষ্টা করুন |
| `order.add` | 8 chars vs en-GB 3 (×2.67) | যোগ করুন |
| `order.asap` | 16 chars vs en-GB 6 (×2.67) | ⚡ যত দ্রুত সম্ভব |
| `order.asapOnly` | 19 chars vs en-GB 9 (×2.11) | শুধু যত দ্রুত সম্ভব |
| `order.paidByCard` | 25 chars vs en-GB 12 (×2.08) | কার্ডে পেমেন্ট করা হয়েছে |
| `dashboard.qr.tapToClose` | 36 chars vs en-GB 21 (×1.71) | বন্ধ করতে যেকোনো জায়গায় ট্যাপ করুন |
| `dashboard.extraWait.add` | 29 chars vs en-GB 14 (×2.07) | বাড়তি অপেক্ষার সময় যোগ করুন |
| `dashboard.eventBar.noEvent` | 29 chars vs en-GB 17 (×1.71) | কোনো ইভেন্ট বেছে নেওয়া হয়নি |
| `dashboard.prep.assembly` | 16 chars vs en-GB 8 (×2.00) | সাজানো ও প্যাকিং |
| `dashboard.settings.cardsOffSince` | 31 chars vs en-GB 17 (×1.82) | বন্ধ আছে এই তারিখ থেকে: {date} |
| `dashboard.common.ok` | 7 chars vs en-GB 2 (×3.50) | ঠিক আছে |
| … | 116 more | |

## Back-translation drifts from en-GB (1022)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 40% — en-GB: "Add a tip for the truck?" · back: "Will you give a tip for the food truck?" | ফুড ট্রাকের জন্য টিপ দেবেন? |
| `order.submitUnconfirmedCard` | meaning overlap 42% — en-GB: "We couldn’t place your order. You haven’t been charged and no order was created — please t" · back: "Your order could not be placed. No money was deducted from you and no order was created — " | আপনার অর্ডার দেওয়া যায়নি। আপনার কাছ থেকে কোনো টাকা কাটা হয়নি এবং কোনো অর্ডার তৈরি হয়নি — আবার চেষ্টা করুন। |
| `order.state.confirmNotFound` | meaning overlap 25% — en-GB: "We couldn’t find that order." · back: "The order could not be found." | অর্ডারটি খুঁজে পাওয়া যায়নি। |
| `order.state.confirmRejected` | meaning overlap 40% — en-GB: "This order was not accepted by the truck." · back: "The truck did not accept this order." | ট্রাক এই অর্ডারটি গ্রহণ করেনি। |
| `order.state.confirmLoadFailed` | meaning overlap 25% — en-GB: "We couldn’t load that order." · back: "The order could not be loaded." | অর্ডারটি লোড করা যায়নি। |
| `order.state.cardFormLoadFailed` | meaning overlap 47% — en-GB: "We could not load the card form — check your connection and try again. Your basket is save" · back: "The card form could not be loaded — check your internet connection and try again. Your car" | কার্ডের ফর্ম লোড করা যায়নি — আপনার ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন। আপনার কার্ট সেভ করা আছে, এবং কোনো টাকা কাটা হ |
| `order.confirmMissing` | meaning overlap 25% — en-GB: "We couldn’t find that order." · back: "The order could not be found." | অর্ডারটি খুঁজে পাওয়া যায়নি। |
| `order.yourNamedDeal` | meaning overlap 0% — en-GB: "your  {name}  deal" · back: "your combo:  {name}" | আপনার কম্বো: {name} |
| `order.tipInPerson` | meaning overlap 29% — en-GB: "Tip the truck in person if you like." · back: "If you want, you can give a tip directly at the truck." | চাইলে সরাসরি ট্রাকে টিপ দিতে পারেন। |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "Maximum tip:  {amount} ." | সর্বোচ্চ টিপ: {amount}। |
| `order.couldNotPlace` | meaning overlap 33% — en-GB: "We could not place your order. No money has been taken." · back: "Your order could not be placed. No money was deducted." | আপনার অর্ডার দেওয়া যায়নি। কোনো টাকা কাটা হয়নি। |
| `order.paymentThrew` | meaning overlap 39% — en-GB: "Something went wrong taking that payment. No money has been taken — please try again, or c" · back: "A problem occurred while taking the payment. No money was deducted — try again, or choose " | পেমেন্ট নিতে গিয়ে একটি সমস্যা হয়েছে। কোনো টাকা কাটা হয়নি — আবার চেষ্টা করুন, অথবা “পিকআপে পেমেন্ট” বেছে নিন। |
| … | 1010 more | |

