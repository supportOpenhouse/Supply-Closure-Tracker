-- Stores comments and status overrides for legacy (CSV) records.
-- Does NOT touch the properties table.

CREATE TABLE IF NOT EXISTS legacy_edits (
  uid TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT DEFAULT '',
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (uid, field)
);
