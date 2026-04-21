-- ============================================
-- Run this on your Neon database to add
-- the dashboard-specific columns.
-- These are safe to run even if columns exist.
-- ============================================

-- Status override (when team manually changes status)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status_override TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS offer_price TEXT DEFAULT '';

-- Comment columns for the closure tracker
ALTER TABLE properties ADD COLUMN IF NOT EXISTS closure_team_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rahool_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS prashant_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS demand_team_comments TEXT DEFAULT '';

-- Comment timestamps
ALTER TABLE properties ADD COLUMN IF NOT EXISTS closure_team_comments_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rahool_comments_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS prashant_comments_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS demand_team_comments_at TIMESTAMP;
