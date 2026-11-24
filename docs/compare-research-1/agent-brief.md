# compare-research-1: brief for each country's research agent

You research food-business online-ordering competitors for ONE country (or a small group of countries), for HatchGrab's comparison
pages. Your output is one JSON file. You write NOTHING else: no database, no code, no other files.

## Hard rules

- **One web request at a time.** Never call two web tools in the same turn and never in parallel. Keep to a steady, unhurried pace. If a
  site answers 403/429 or shows a bot check, note it and move on; retry it once at most.
- **Sources:** facts (eligibility, prices, features) come ONLY from the vendor's OWN website (its domain and subdomains). App Store or
  Google Play pages are allowed only for app facts. **Never** use a review site, directory, marketplace listing, reseller, news article or
  comparison site as the source of a price or feature. A web search is fine for FINDING vendors, but never quote a search result.
- Never sign up, log in or submit a form. Never open any `.env` file. Don't touch the database or any repo file except your output file.
- **Quotes are verbatim** from the page (copy exactly, keep the original language), **max 200 characters**, each with the exact URL of the
  page it is on.
  - When you fetch a page, ASK the page reader for "the exact sentences, word for word" about prices, ordering ahead and food trucks.
    Never paraphrase.
  - If you only have a summary, not the exact words, leave that quote out (say so in the note) rather than invent wording. The nightly
    checker re-reads every page and checks each quote against the page text.

## Who counts (Dominic's eligibility rule, 24 Nov)

A competitor counts only if **its own website shows that customers can ORDER ONLINE AHEAD from a food business**: pre-order, click and
collect, or order for a time.

1. **First choice: food-truck / mobile-catering / market-stall ordering tools** (`focus: "food_truck"`). Evidence needed: a quote naming
   food trucks, street food, markets, mobile catering or events (`food_quote`), AND a quote showing online ordering ahead (`order_quote`).
2. **Only where the country has fewer than 2 of those:**
   - restaurant / takeaway online-ordering tools with click-and-collect (`focus: "nearest_local"`; this is the table's name for
     "restaurant");
   - the big till players already stored (Square, SumUp, Zettle, Lightspeed, Toast, Clover; `focus: "pos"`), where their OWN site shows
     they sell in that country with online ordering. Give a quote and URL for "sells in this country" (a country page, local prices, a
     local-language site).
3. **Never count:**
   - tools with no online ordering (QR menus only, table ordering only, tills only, booking only, loyalty only);
   - delivery marketplaces (Uber Eats, Deliveroo, Just Eat, Wolt, Glovo, Foodpanda, GrabFood, DoorDash, iFood, Rappi, Lieferando,
     Thuisbezorgd, Takeaway.com and the like);
   - directories or listing apps where the business can't take an order;
   - a site that isn't the vendor's own.

   If you looked at such a tool, still record it with `verdict: "not_relevant"` and a one-line reason, so we can mark stored ones.

The tool must plausibly serve businesses in THIS country: a local site or language, local prices, or a stated presence.

## Prices

- The price shown TODAY on the vendor's own site, for the main plan(s) that include online ordering. Up to 3 plans.
- `price_major` is the amount in **MAJOR units, exactly as the page shows it**: 59 for "59 € / mois", 79 for "R$79,00", 3980 for
  "3,980円", 29.99 for "£29.99".
  - **Never** convert to cents.
  - **Monthly:** if the page shows only a yearly price, give the yearly amount with `period: "year"`. If it shows a "per month, billed
    yearly" price, give that monthly amount with `period: "month"` and say "billed yearly" in the note.
- `currency`: the ISO code of the price as shown. It should be the country's own currency; if the site shows only another currency
  (e.g. USD), give that and say so.
- `vat`: "incl", "excl" or "unknown". The site must say so; otherwise "unknown".
- **Fees:**
  - a per-order fee: `per_order_pct` (e.g. 2.5) and/or `per_order_fixed_major`;
  - a set-up fee: `setup_major`.
  - A free plan with a fee per order IS a price: `price_major` 0, plus the fee.
- "Price on request", or no price on the site: one plan with `price_major: null` and a note.
- Every priced plan needs its verbatim `quote` (the price as written) and `url`.

## Features: ONLY these 14 keys

`ahead`, `preorder`, `capacity`, `schedule`, `whatsapp`, `social`, `kds`, `offline`, `walkup`, `vans`, `domain`, `monthly`, `perorder`,
`cardfee`

Meanings:

| Key | Meaning |
|---|---|
| `ahead` | order ahead for a chosen time today |
| `preorder` | pre-order for a later day or event |
| `capacity` | limits orders per time slot |
| `schedule` | a schedule of changing locations or markets |
| `whatsapp` | WhatsApp ordering or replies |
| `social` | social-media posts |
| `kds` | a kitchen display screen |
| `offline` | keeps working without internet |
| `walkup` | walk-up / counter orders in the same system |
| `vans` | several vans or locations |
| `domain` | the business's own web address |
| `monthly` | has a monthly fee |
| `perorder` | charges a fee per order |
| `cardfee` | card-processing fees stated |

Values:
- `"yes"` / `"partial"`: needs a verbatim quote + url.
- `"no"`: ONLY with a quote in which the vendor says it is NOT offered (a negation: "no monthly fee", "pas de commission").
- **Silence = `"not_mentioned"`**, with no quote.
- `"unknown"` only if the pages couldn't be read, with the reason in `note`.

Never record anything about card readers or tills at the hatch.

## Output file

Write the file **after each vendor** (rewrite the whole file each time), so nothing is lost if you stop. Use JSON exactly like this:

```json
{
  "country": "AU",
  "researched_on": "2026-11-24",
  "searches": ["food truck online ordering australia", "..."],
  "vendors": [
    {
      "name": "Bopple",
      "website": "https://bopple.com",
      "stored_id_prefix": "a8ba9459",
      "focus": "nearest_local",
      "verdict": "eligible",
      "reason": "restaurant online ordering with scheduled pickup; Australian prices",
      "eligibility": {
        "food_quote": "…", "food_url": "https://…",
        "order_quote": "…", "order_url": "https://…",
        "country_quote": "…", "country_url": "https://…"
      },
      "plans": [
        {
          "plan_name": "Online ordering", "currency": "AUD", "price_major": 49, "period": "month", "vat": "excl",
          "per_order_pct": null, "per_order_fixed_major": null, "setup_major": null,
          "quote": "$49 per month", "url": "https://bopple.com/pricing", "note": ""
        }
      ],
      "answers": [
        { "key": "ahead", "value": "yes", "quote": "…", "url": "https://…" },
        { "key": "kds", "value": "not_mentioned" }
      ],
      "check_urls": ["https://bopple.com", "https://bopple.com/pricing"]
    }
  ],
  "notes": "anything a reviewer should know; e.g. nothing eligible exists and what you searched"
}
```

- **`stored_id_prefix`:** the 8-character id prefix given to you for a vendor that is already stored. `null` for a new one.
- **`verdict`:** `"eligible"`, `"not_relevant"` (with the reason) or `"unreadable"` (the site couldn't be read; say why).
- **`eligibility`:**
  - `food_quote` is needed for focus food_truck;
  - `country_quote` is needed for pos and for multi-country tools;
  - leave out the parts you don't have.
- **`answers`:** one entry for EACH of the 14 keys for an eligible vendor (use `"not_mentioned"` where the site is silent). It can be
  empty for not_relevant.
- **`check_urls`:** the pages you actually read, up to 8.

## When you're done

Reply with at most 6 lines:
- the file path;
- how many vendors are eligible with a stated price;
- how many are not relevant;
- anything odd.
