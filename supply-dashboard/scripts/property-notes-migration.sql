-- ============================================================
-- property_notes — one row per note: a single notes thread per lead,
-- replacing the free-text poc / manager / rahool / prashant comment boxes.
--
-- No foreign key on uid: LEGACY-xxx leads live in the Google Sheet,
-- not in `properties` (same as legacy_edits / cp_inventory_status).
-- Rows are never hard-deleted — set deleted_at instead.
--
-- Safe to re-run (idempotent).
-- ============================================================

CREATE TABLE IF NOT EXISTS property_notes (
  id            BIGSERIAL PRIMARY KEY,
  uid           TEXT NOT NULL,                      -- properties.uid or LEGACY-xxx
  kind          TEXT CHECK (kind IN ('poc', 'manager', 'rahool', 'prashant')),  -- imported rows: the old comment box it came from; NULL for dashboard notes
  note_date     DATE,                               -- date the note is about; NULL if undated
  note          TEXT NOT NULL CHECK (btrim(note) <> ''),
  author_email  TEXT,
  author_name   TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'imported')),
  author_source TEXT,                               -- imported rows: activity_log / assigned_by / managed_team / fixed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_property_notes_thread ON property_notes (uid, created_at, id);
