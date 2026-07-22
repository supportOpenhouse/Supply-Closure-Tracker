-- ============================================================
-- wa_interakt_id — stores every Interakt message id and links it
-- to the activity_logs row that caused the send.
--
-- Run ONCE per database, AFTER activity_logs exists (the FK points at it).
--
-- Shared-DB check — if BOTH come back non-null and wa_interakt_id was
-- created by another dashboard (e.g. Forms), skip this file entirely:
--   SELECT to_regclass('wa_interakt_id') AS wa_table,
--          to_regclass('activity_logs')  AS logs_table;
--
-- Safe to re-run (idempotent).
-- ============================================================

CREATE TABLE IF NOT EXISTS wa_interakt_id (
  id_seq SERIAL PRIMARY KEY,   -- surrogate: `id` is null when a send fails
  phone TEXT NOT NULL,
  result BOOLEAN,
  id TEXT,                     -- Interakt message id
  template TEXT,
  name TEXT,                   -- filled by trg_wa_fill_name, do not pass on insert
  uid TEXT,
  log_id INTEGER,
  sent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $wacol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wa_interakt_id' AND column_name='uid')
  THEN ALTER TABLE wa_interakt_id ADD COLUMN uid TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wa_interakt_id' AND column_name='log_id')
  THEN ALTER TABLE wa_interakt_id ADD COLUMN log_id INTEGER; END IF;
  -- ON DELETE SET NULL: purging old activity_logs must never delete delivery records.
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_wa_log_id')
  THEN ALTER TABLE wa_interakt_id ADD CONSTRAINT fk_wa_log_id
       FOREIGN KEY (log_id) REFERENCES activity_logs(id) ON DELETE SET NULL; END IF;
END $wacol$;

CREATE INDEX IF NOT EXISTS idx_wa_phone    ON wa_interakt_id(phone);
CREATE INDEX IF NOT EXISTS idx_wa_id       ON wa_interakt_id(id);
CREATE INDEX IF NOT EXISTS idx_wa_sent     ON wa_interakt_id(sent_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wa_template ON wa_interakt_id(template);
CREATE INDEX IF NOT EXISTS idx_wa_uid      ON wa_interakt_id(uid);
CREATE INDEX IF NOT EXISTS idx_wa_log_id   ON wa_interakt_id(log_id);

-- ── Name auto-fill trigger ──────────────────────────────────
-- Owned by the trigger, not app code, so ANY insert path gets a name.
-- Matches on the last 10 digits: '+91 97113 30512', '09711330512' and
-- '9711330512' all resolve to the same person.
CREATE OR REPLACE FUNCTION wa_fill_name() RETURNS TRIGGER AS $wa$
DECLARE
  p TEXT := RIGHT(REGEXP_REPLACE(COALESCE(NEW.phone,''), '\D', '', 'g'), 10);
BEGIN
  IF NEW.name IS NOT NULL AND NEW.name <> '' THEN RETURN NEW; END IF;
  IF p = '' THEN RETURN NEW; END IF;

  SELECT u.name INTO NEW.name FROM users u
   WHERE RIGHT(REGEXP_REPLACE(COALESCE(u.phone,''), '\D', '', 'g'), 10) = p
     AND u.name IS NOT NULL AND u.name <> ''
   LIMIT 1;

  IF NEW.name IS NULL OR NEW.name = '' THEN
    SELECT pr.owner_broker_name INTO NEW.name FROM properties pr
     WHERE RIGHT(REGEXP_REPLACE(COALESCE(pr.contact_no,''), '\D', '', 'g'), 10) = p
       AND pr.owner_broker_name IS NOT NULL AND pr.owner_broker_name <> ''
     ORDER BY pr.created_at DESC
     LIMIT 1;
  END IF;

  RETURN NEW;
END;
$wa$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_fill_name ON wa_interakt_id;
CREATE TRIGGER trg_wa_fill_name BEFORE INSERT ON wa_interakt_id
  FOR EACH ROW EXECUTE FUNCTION wa_fill_name();
