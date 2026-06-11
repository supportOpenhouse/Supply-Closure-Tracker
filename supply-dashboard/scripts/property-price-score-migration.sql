-- ============================================
-- Property Score & Price Score columns
-- Editable only by rahool@openhouse.in (enforced
-- in api/update.js). PS x PS is derived in the
-- UI, no column needed.
-- Run on your Neon database.
-- ============================================

ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_score TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_score    TEXT DEFAULT '';
