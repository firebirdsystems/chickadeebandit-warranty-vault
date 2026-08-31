-- items.sql and the vault list both order by
--   (warranty_expires_date = ''), warranty_expires_date
-- to put rows with no recorded expiry last. The plain expiry index cannot serve
-- that: the leading term is an expression, not a column, so the planner fell
-- back to reading every item and sorting it in a temp b-tree just to return the
-- first 300.
--
-- SQLite indexes expressions, so the ordering can be indexed exactly as the
-- query asks for it. `warranty_expires_date = ''` is deterministic and the
-- column is declared plaintext, so the index stores real values in real order.
--
-- app_warranty_vault__items_expiry_idx stays: it still serves seeks by a
-- specific expiry, which this index's leading expression term cannot.
CREATE INDEX IF NOT EXISTS app_warranty_vault__items_expiry_ordered_idx
  ON app_warranty_vault__items ((warranty_expires_date = ''), warranty_expires_date);
