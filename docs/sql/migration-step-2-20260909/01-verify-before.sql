-- Expect: the table exists and is EMPTY. If it does not exist, run the migration first.
select count(*) as should_be_0 from discovery_exclusion_terms;
-- Expect 0 rows here too — proof the old table is still refusing the scraper's writes.
select count(*) as excluded_terms_should_be_0 from excluded_terms;
