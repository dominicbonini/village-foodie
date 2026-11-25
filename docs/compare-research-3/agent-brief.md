# compare-research-3: brief for each research agent (25 Nov 2026)

Everything in `docs/compare-research-2/agent-brief.md` applies unchanged (read it, and the JSON format in
`docs/compare-research-1/agent-brief.md` it points to). Changes for this round:

## 1 · Usage is tight: be lean, and commit after every country

- Read only what's needed per vendor: the page with the order-ahead (eligibility) quote and the page with the price. Skip the 14
  feature answers except `ahead` / `preorder` (give the others as `not_mentioned`, no extra page reads for them).
- **Stop a country as soon as it has 2 eligible priced tools in total** (counting what is already stored and counted — given in
  your task), or when nothing eligible exists after about 5 vendor sites (say so in `notes`).
- **After every country:** write `docs/compare-research-3/agent-<N>/raw/<CC>.json`, update `docs/compare-research-3/agent-<N>/summary.md`
  (one section per country: vendors, verdict, price + currency, URL; a line "count now: N"), then commit ONLY your folder:
  `git add docs/compare-research-3/agent-<N> && git commit -m "compare-research-3 agent-<N>: <CC>" -- docs/compare-research-3/agent-<N>`.
  If git says another process holds the lock (`index.lock`), wait a few seconds and retry (another session may be committing). Never
  commit, add, stash or touch any other path. Never push.

## 2 · Neighbouring markets (Dominic, 25 Nov — small territories only)

- **LI:** a Swiss tool priced in CHF counts as sold in Liechtenstein when its own site does not exclude Liechtenstein.
- **GI:** a UK tool priced in GBP counts as sold in Gibraltar when its own site does not exclude Gibraltar.
- Record such a vendor in the territory's file with `"neighbour": "CH"` (or `"GB"`), `country_quote` = the quote showing it sells in
  the neighbour (its Swiss / UK pricing or presence) and a note "serves LI from CH" / "serves GI from GB". If its own site says it
  serves only Switzerland / only the UK mainland, or lists countries without the territory, it does NOT count (verdict not_relevant,
  quote that).
- **MT stays strict:** a tool must show on its own site that it sells in Malta.

## 3 · Currencies now accepted (Dominic, 25 Nov)

As well as the stored currency: PA also USD; KW also KWD; BH also BHD; OM also OMR; JO also JOD; RO also EUR.

## 4 · Stored competitors

`docs/compare-research-3/stored-list.txt`: every stored competitor (8-char id prefix, name, website, lifecycle, focus), current after
compare-research-2. Use the prefix in `stored_id_prefix`. compare-research-2's evidence for every country is in
`docs/compare-research-2/agent-*/raw/<CC>.json` — read it first and don't repeat dead ends.
