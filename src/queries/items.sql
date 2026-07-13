-- AI read export: vault items ordered by warranty expiry (soonest first,
-- blank/no-warranty rows last via the null-safe trick — NULLS LAST does not
-- parse on governed tables).
-- adult_writable reads are open, so no member_id is required.
-- purchase_date / warranty_expires_date are declared in db_plaintext_columns.
-- Serial numbers stay encrypted at rest and are intentionally not exported.
SELECT
  id,
  name,
  category,
  purchase_date,
  price_cents,
  warranty_months,
  warranty_expires_date,
  notes
FROM app_warranty_vault__items
ORDER BY (warranty_expires_date = ''), warranty_expires_date
LIMIT 300
