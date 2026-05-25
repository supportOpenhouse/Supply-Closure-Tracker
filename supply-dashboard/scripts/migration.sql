-- ============================================
-- Run this on your Neon database to add
-- the dashboard-specific columns.
-- These are safe to run even if columns exist.
-- ============================================

-- Status override (when team manually changes status)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status_override TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS offer_price TEXT DEFAULT '';

-- Rename legacy comment columns to the new names. Each block is a no-op if
-- the old name is already gone, so this whole file stays safe to re-run.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='closure_team_comments') THEN
    EXECUTE 'ALTER TABLE properties RENAME COLUMN closure_team_comments TO poc_comments';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='closure_team_comments_at') THEN
    EXECUTE 'ALTER TABLE properties RENAME COLUMN closure_team_comments_at TO poc_comments_at';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='demand_team_comments') THEN
    EXECUTE 'ALTER TABLE properties RENAME COLUMN demand_team_comments TO manager_comments';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='demand_team_comments_at') THEN
    EXECUTE 'ALTER TABLE properties RENAME COLUMN demand_team_comments_at TO manager_comments_at';
  END IF;
END $$;

-- Comment columns for the closure tracker (added if missing on fresh DBs)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS poc_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rahool_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS prashant_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS manager_comments TEXT DEFAULT '';

-- Comment timestamps
ALTER TABLE properties ADD COLUMN IF NOT EXISTS poc_comments_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rahool_comments_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS prashant_comments_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS manager_comments_at TIMESTAMP;

-- Migrate legacy_edits rows so legacy-row comments keep loading under the new field names
UPDATE legacy_edits SET field = 'poc_comments'     WHERE field = 'closure_team_comments';
UPDATE legacy_edits SET field = 'manager_comments' WHERE field = 'demand_team_comments';
