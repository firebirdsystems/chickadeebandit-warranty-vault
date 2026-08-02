-- Automation support for the `add_item` action.
--
-- `source_event_id` records which app event produced the row. The dispatcher's
-- dedupe guard matches on it (SELECT 1 FROM ... WHERE source_event_id = ?
-- LIMIT 1), so a redelivered purchase event reuses the item already tracked
-- instead of creating a second warranty record for the same thing.
--
-- Nullable on purpose: items entered by hand have no source event, and the
-- guard only ever looks for a specific non-null id.
ALTER TABLE app_warranty_vault__items ADD COLUMN source_event_id TEXT;

CREATE INDEX IF NOT EXISTS app_warranty_vault__idx_items_source_event_id
  ON app_warranty_vault__items(source_event_id);
