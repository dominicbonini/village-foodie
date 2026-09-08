-- 1. Every term imported, none duplicated by key.
select count(*) as total, count(distinct term_key) as distinct_keys from discovery_exclusion_terms;   -- expect 143, 143
-- 2. 🔴 THE POISONED TERMS — each of these silences a REAL truck on the next scrape.
select term, term_key, hits_truck from discovery_exclusion_terms where hits_truck is not null order by term;   -- expect 5 rows
-- 3. Nothing was written to the old table.
select count(*) as excluded_terms_untouched from excluded_terms;   -- expect 0
