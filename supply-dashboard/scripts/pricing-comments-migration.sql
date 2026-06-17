-- Editable "Pricing Comments" column shown next to OH Price.
-- Stored in the MAIN dashboard database (same DB as the other comment fields).
-- The OH Price value itself is read live from the Direct Inventory DB
-- (oh_pricing table via DIRECT_INVENTORY_DB_URL) and needs no column here.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS pricing_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pricing_comments_at TIMESTAMP;
