# Translation check — tr-TR

5785 keys checked against en-GB's 5771. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 417 · glossary 63 · banned 0 · invariants 0 · numbers 2 · length 117 · drift 944 · plans 0 · other 0.

## English left (417)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | English word(s): food | Food truck’a bahşiş eklemek ister misiniz? |
| `order.submitUnconfirmedCheck` | English word(s): food | Siparişinizin iletildiğini doğrulayamadık. Sipariş food truck’ın ekranına düşmüş olabilir — tekrar sipariş vermeden önce |
| `order.state.confirmRejected` | English word(s): food, truck | Bu sipariş food truck tarafından kabul edilmedi. |
| `order.state.menuUnavailable` | English word(s): food, truck | Bu food truck şu anda sipariş almıyor. |
| `order.tipInPerson` | English word(s): food | Dilerseniz bahşişi food truck’ta elden verebilirsiniz. |
| `order.tipNote` | English word(s): food | Bahşişinizin %100’ü food truck’a gider. Vergi öncesi yemek tutarı üzerinden hesaplanır. |
| `order.backToTruckPage` | English word(s): food, truck | ← Food truck sayfasına dön |
| `order.walkUpOnly` | English word(s): food, truck | Bu food truck yalnızca yerinde, tezgâhtan sipariş alıyor. |
| `order.eventsLoadFailed` | English word(s): food | Bu food truck’ın etkinliklerini yükleyemedik. |
| `order.timeNotSetBody` | English word(s): food, truck | Food truck etkinlik saatini henüz belirlemedi — lütfen doğrudan onlara sorun. Saat belirlendiğinde buradan sipariş vereb |
| `order.noEventsBody` | English word(s): food, truck | Birazdan tekrar bakın ya da güncellemeler için food truck sayfasını ziyaret edin |
| `order.cardHeldUntil` | English word(s): food, truck | Siparişiniz {withTruck, select, yes {{truck}} other {food truck}} tarafından onaylanana kadar tutar kartınızda yalnızca  |
| … | 405 more | |

## Glossary term not used (63)

| Key | Flag | Text |
|---|---|---|
| `order.allergenInfo` | "Allergens" → expected "alerjenler" | ⓘ Alerjen bilgisi |
| `order.allergenTitle` | "Allergens" → expected "alerjenler" | Alerjen bilgisi |
| `order.allergenNotProvided` | "Allergens" → expected "alerjenler" | Alerjen bilgisi verilmemiş — lütfen doğrudan food truck’a sorun. |
| `order.allergenCard` | "Allergens" → expected "alerjenler" | 📎 Alerjen kartını görüntüle (PDF/görsel) |
| `whatsappCustomer.allergenRedirect` | "Allergens" → expected "alerjenler" | {opener}Menümüzün tamamını ve alerjen bilgilerini buradan görebilirsiniz: {url} — {truck} {emoji} |
| `whatsappCustomer.allergenCaveat` | "Allergens" → expected "alerjenler" | Alerjen bilgisi için lütfen menünün tamamını mutlaka kontrol edin — bu otomatik bir yanıttır. |
| `privateLink.guestLabel` | "Private event" → expected "özel etkinlik" | ÖZEL ETKİNLİK |
| `goLive.allergensUnanswered.title` | "Allergens" → expected "alerjenler" | Alerjen bilgilerini nasıl göstereceğinizi seçin |
| `goLive.allergensCardMissing.title` | "Allergens" → expected "alerjenler" | Alerjen kartınızı ekleyin |
| `goLive.allergensCardMissing.detail` | "Allergens" → expected "alerjenler" | Alerjen kartı göstermeyi seçtiniz ancak kayıtlı bir kart yok — müşterilere alerjen bilgisi olduğu söylenir, sonra hiçbir |
| `manageAllergens.cardEditor.title` | "Allergens" → expected "alerjenler" | Alerjen kartınız |
| `manageAllergens.cardEditor.empty` | "Allergens" → expected "alerjenler" | Henüz alerjen kartı yok. |
| … | 51 more | |

## Numbers, prices or brands changed (2)

| Key | Flag | Text |
|---|---|---|
| `errorsManage.wp_caption_too_long` | number(s) 4000 not kept | Bu açıklama çok uzun — en fazla 4.000 karakter. |
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +90 532 123 45 67 |

## Likely to overflow (much longer than en-GB) (117)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | 42 chars vs en-GB 24 (×1.75) | Food truck’a bahşiş eklemek ister misiniz? |
| `order.retrying` | 17 chars vs en-GB 9 (×1.89) | Tekrar deneniyor… |
| `order.retry` | 11 chars vs en-GB 5 (×2.20) | Tekrar dene |
| `order.checking` | 17 chars vs en-GB 9 (×1.89) | Kontrol ediliyor… |
| `order.orderingPaused` | 26 chars vs en-GB 15 (×1.73) | Sipariş alımı duraklatıldı |
| `order.asap` | 16 chars vs en-GB 6 (×2.67) | ⚡ En kısa sürede |
| `order.asapOnly` | 23 chars vs en-GB 9 (×2.56) | Yalnızca en kısa sürede |
| `dashboard.qr.tapToClose` | 39 chars vs en-GB 21 (×1.86) | Kapatmak için herhangi bir yere dokunun |
| `dashboard.buzzer.saved` | 42 chars vs en-GB 23 (×1.83) | {number} numaralı çağrı cihazı kaydedildi |
| `dashboard.orders.statDone` | 10 chars vs en-GB 4 (×2.50) | Tamamlandı |
| `dashboard.prep.title` | 29 chars vs en-GB 15 (×1.93) | Şimdi hazırlanması gerekenler |
| `dashboard.prep.assembly` | 19 chars vs en-GB 8 (×2.38) | Hazırlama ve servis |
| … | 105 more | |

## Back-translation drifts from en-GB (944)

| Key | Flag | Text |
|---|---|---|
| `order.submitUnconfirmedCheck` | meaning overlap 44% — en-GB: "We couldn’t confirm your order went through. It may already be on the truck’s screen — ple" · back: "We couldn’t verify your order was sent. It may have reached the food truck’s screen — plea" | Siparişinizin iletildiğini doğrulayamadık. Sipariş food truck’ın ekranına düşmüş olabilir — tekrar sipariş vermeden önce |
| `order.state.menuUnavailable` | meaning overlap 43% — en-GB: "This truck is not currently taking orders." · back: "This food truck isn’t taking orders right now." | Bu food truck şu anda sipariş almıyor. |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be at most  {amount} ." | Bahşiş en fazla {amount} olabilir. |
| `order.cardSetupFallback` | meaning overlap 45% — en-GB: "We could not set up card payment just now, so your order has not been placed and you have " · back: "We couldn’t start card payment right now, so your order wasn’t placed and you weren’t char" | Kartla ödemeyi şu anda başlatamadık; bu yüzden siparişiniz verilmedi ve sizden ücret alınmadı. |
| `order.orderFailed` | meaning overlap 25% — en-GB: "Order failed" · back: "Order couldn’t be placed" | Sipariş verilemedi |
| `order.somethingWrong` | meaning overlap 38% — en-GB: "Something went wrong. Please try again." · back: "A problem occurred. Please try again." | Bir sorun oluştu. Lütfen tekrar deneyin. |
| `order.walkUpOnly` | meaning overlap 38% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck only takes orders in person, at the counter." | Bu food truck yalnızca yerinde, tezgâhtan sipariş alıyor. |
| `order.eventsRetryHint` | meaning overlap 43% — en-GB: "Give it a moment, then tap to try again." · back: "Wait a little, then tap to try again." | Biraz bekleyin, ardından tekrar denemek için dokunun. |
| `order.retry` | meaning overlap 0% — en-GB: "Retry" · back: "Try again" | Tekrar dene |
| `order.timeNotSetTitle` | meaning overlap 17% — en-GB: "Ordering isn’t available for this event yet" · back: "You can’t order for this event yet" | Bu etkinlik için henüz sipariş verilemiyor |
| `order.orderingHasClosed` | meaning overlap 25% — en-GB: "Ordering has closed" · back: "Order taking has closed" | Sipariş alımı kapandı |
| `order.pausedOfflineBody` | meaning overlap 38% — en-GB: "We’re having a connection issue but you can still order at the window. Check back soon!" · back: "We’re having a connection problem but you can still order at the counter. Check again shor" | Bir bağlantı sorunu yaşıyoruz ama tezgâhta sipariş vermeye devam edebilirsiniz. Birazdan tekrar bakın! |
| … | 932 more | |

