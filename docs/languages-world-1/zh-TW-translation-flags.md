# Translation check — zh-TW

5785 keys checked against en-GB's 5771. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 121 · glossary 28 · banned 0 · invariants 0 · numbers 1 · length 0 · drift 861 · plans 0 · other 0.

## English left (121)

| Key | Flag | Text |
|---|---|---|
| `order.dualNetworkNotice` | English word(s): eftpos | 無論你輸入付款資料時顯示的是哪個支付品牌標誌，只要你使用同時印有 eftpos 與其他支付品牌的雙網路簽帳金融卡，你的付款都可能透過其中任一網路處理。 |
| `dashboard.qr.alt` | English word(s): code | 點餐 QR code |
| `dashboard.header.qrCode` | identical to en-GB | QR code |
| `dashboard.settings.privateLinkDialog` | English word(s): code | 私人連結與 QR code |
| `errorsCustomer.private_link_only` | English word(s): code | 這場活動僅接受透過私人連結點餐，請使用主辦單位提供的連結或 QR code。 |
| `privateLink.replacedBody` | English word(s): code | 這個連結已失效：{truck} 已更換連結。請向主辦單位索取新的連結或 QR code。 |
| `privateLink.unknownBody` | English word(s): code | 這個連結無法使用。請向主辦單位確認，或重新掃描 QR code。 |
| `kitchenModals.actions.privateLink` | English word(s): code | 私人連結與 QR code |
| `nativeShell.binary.faceIdUsage` | English word(s): face | 使用 Face ID 解鎖 HatchGrab。 |
| `nativeShell.lock.cantUseBiometric` | English word(s): face, touch | 無法使用 Face / Touch ID？ |
| `nativeShell.lock.tryBiometric` | English word(s): face, touch | 改用 Face / Touch ID |
| `demo.scanQr` | English word(s): code | 掃描 <b>QR code</b>（或點按連結），以顧客身分點餐，然後看訂單進來 |
| … | 109 more | |

## Glossary term not used (28)

| Key | Flag | Text |
|---|---|---|
| `dashboard.header.kitchenScreen` | "KDS" → expected "廚房顯示系統（KDS）" | 廚房顯示系統 |
| `dashboard.settings.orderReadyHelp` | "KDS" → expected "廚房顯示系統（KDS）" | 在接單畫面顯示「標示完成」按鈕。廚房顯示系統需另外設定。每當訂單被標示為完成，系統就會寄電子郵件通知顧客。 |
| `dashboard.kds.title` | "KDS" → expected "廚房顯示系統（KDS）" | 開啟廚房顯示系統 |
| `dashboard.kds.body` | "KDS" → expected "廚房顯示系統（KDS）" | 選擇要開啟哪一台車輛的廚房顯示系統： |
| `userMenu.kitchenScreen` | "KDS" → expected "廚房顯示系統（KDS）" | 廚房顯示系統 |
| `serviceSettings.labels.collection_interval_mins` | "Pickup time" → expected "取餐時間" | 取餐時段 |
| `offlineProtection.explainerLead` | "KDS" → expected "廚房顯示系統（KDS）" | 營業期間，你的控制台或廚房顯示系統必須保持開啟並連上網路。 |
| `offlineProtection.reminder` | "KDS" → expected "廚房顯示系統（KDS）" | ⚠️ 營業期間請讓控制台或廚房顯示系統保持開啟並連上網路，否則離線保護可能會啟動。 |
| `settingsCopy.orderReady.help` | "KDS" → expected "廚房顯示系統（KDS）" | 在接單畫面顯示「標示完成」按鈕。廚房顯示系統需在每台裝置上另外設定。訂單標示為完成時，顧客都會收到電子郵件通知。適用於所有活動——你仍可在單一活動的控制台上開啟或關閉。 |
| `manageSettings.sections.autoReplies` | "WhatsApp auto-reply" → expected "WhatsApp 自動回覆" | 自動回覆 |
| `manageSettings.collection.unavailable` | "Pickup time" → expected "取餐時間" | 目前無法使用取餐時段。 |
| `manageSettings.collection.customerTimes` | "Pickup time" → expected "取餐時間" | 顧客的取餐時段 |
| … | 16 more | |

## Numbers, prices or brands changed (1)

| Key | Flag | Text |
|---|---|---|
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | 0912 345 678 |

## Back-translation drifts from en-GB (861)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 33% — en-GB: "Add a tip for the truck?" · back: "Would you like to give the truck a little tip?" | 要給餐車一點小費嗎？ |
| `order.state.confirmRejected` | meaning overlap 40% — en-GB: "This order was not accepted by the truck." · back: "The truck did not accept this order." | 餐車未接受這筆訂單。 |
| `order.tipInPerson` | meaning overlap 25% — en-GB: "Tip the truck in person if you like." · back: "If you want to tip, you can also give it to the truck directly on site." | 想給小費的話，也可以在現場直接給餐車。 |
| `order.paymentThrew` | meaning overlap 39% — en-GB: "Something went wrong taking that payment. No money has been taken — please try again, or c" · back: "A problem occurred while paying; no money was taken. Please try again, or choose “Pay on s" | 付款時發生問題，並未扣取任何款項。請再試一次，或選擇「現場付款」。 |
| `order.menuChangedFallback` | meaning overlap 44% — en-GB: "The menu has changed. Please check your order before placing it." · back: "The menu has been updated; please check your order again before ordering." | 菜單已更新，下單前請再確認一次你的訂單。 |
| `order.cardSetupFallback` | meaning overlap 45% — en-GB: "We could not set up card payment just now, so your order has not been placed and you have " · back: "Card payment can’t be set up right now, so your order hasn’t been sent and you haven’t bee" | 目前無法設定信用卡付款，因此你的訂單尚未送出，也沒有被扣款。 |
| `order.somethingWrong` | meaning overlap 38% — en-GB: "Something went wrong. Please try again." · back: "An error occurred, please try again." | 發生錯誤，請再試一次。 |
| `order.eventsRetryHint` | meaning overlap 25% — en-GB: "Give it a moment, then tap to try again." · back: "Please wait a moment, then tap to retry." | 請稍等一下，再點一下重試。 |
| `order.pausedOfflineBody` | meaning overlap 25% — en-GB: "We’re having a connection issue but you can still order at the window. Check back soon!" · back: "There’s a connection problem right now, but you can still order on site at the truck. Plea" | 目前連線出了點問題，但你仍可以到餐車現場點餐。請稍後再回來看看！ |
| `order.pausedBody` | meaning overlap 40% — en-GB: "Check back shortly or order at the window when you arrive." · back: "Please check back later, or order directly at the truck when you arrive." | 請稍後再回來看看，或到現場時直接在餐車點餐。 |
| `order.notOpenTitle` | meaning overlap 33% — en-GB: "Orders not open yet" · back: "Ordering not open yet" | 尚未開放點餐 |
| `order.noEventsBody` | meaning overlap 36% — en-GB: "Check back soon or visit the truck page for updates" · back: "Please check back later, or go to the truck page for the latest news" | 請稍後再回來看看，或前往餐車頁面查看最新消息 |
| … | 849 more | |

