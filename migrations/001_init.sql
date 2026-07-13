-- Warranty Vault — purchases, receipts, and warranty expiry tracking.
--
-- Access: `items` is `adult_writable` (manifest.json) — the whole household
-- can look up "when did we buy the dishwasher", only adults manage rows.
-- Receipt files/documents are gated the same way via manifest `file_acls` and
-- `document_acls` (write: adult), matching the table policy — the raw upload
-- channel and the hub document records cannot be written by non-adults either.
--
-- Plaintext columns (manifest db_plaintext_columns): `purchase_date` and
-- `warranty_expires_date` — plain ISO dates the app and AI export sort/filter
-- on; never sensitive. price_cents is INTEGER minor units. The name, retailer,
-- serial number, and notes stay encrypted at rest (serial numbers are the
-- closest thing to sensitive data here) and are only displayed.
--
-- receipt_file_id / receipt_doc_id reference the hub file + document records
-- for the uploaded receipt (created via /api/files and __DOCS_URL).
CREATE TABLE IF NOT EXISTS app_warranty_vault__items (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,                 -- "LG Dishwasher"
  category              TEXT NOT NULL DEFAULT 'other', -- electronics|appliances|furniture|tools|outdoor|other
  purchase_date         TEXT NOT NULL DEFAULT '',      -- ISO YYYY-MM-DD
  price_cents           INTEGER,                       -- integer minor units; NULL = unknown
  retailer              TEXT NOT NULL DEFAULT '',
  warranty_months       INTEGER,                       -- length of coverage; NULL = none/unknown
  warranty_expires_date TEXT NOT NULL DEFAULT '',      -- ISO date derived at save time
  serial_number         TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  receipt_file_id       TEXT NOT NULL DEFAULT '',      -- hub file id for the receipt upload
  receipt_doc_id        TEXT NOT NULL DEFAULT '',      -- hub document record id
  created_by            TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_warranty_vault__items_expiry_idx
  ON app_warranty_vault__items (warranty_expires_date);
