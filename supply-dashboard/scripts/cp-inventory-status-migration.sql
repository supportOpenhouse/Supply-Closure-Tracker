-- ============================================================
-- cp_inventory_status — CP-aware mirror of the supply tracker
-- status. One row per property, auto-synced from `properties`
-- via trigger (covers both the dashboard and the forms app).
--
-- Run once on the Neon database. Safe to re-run (idempotent).
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_inventory_status (
  uid           TEXT PRIMARY KEY,   -- = properties.uid
  cp_id         TEXT,               -- = properties.lead_id
  valid_cp_id   BOOLEAN DEFAULT FALSE,
  supply_status TEXT DEFAULT '',    -- computed supply-tracker status
  cp_status     TEXT DEFAULT '',    -- derived from supply_status
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_inventory_cp_id ON cp_inventory_status(cp_id);

-- ── 2. Helper functions ─────────────────────────────────────

-- A submission column counts as "present" if not null/blank. Cast the
-- argument to text at the call site so this works whether the source
-- column is TIMESTAMP or TEXT.
CREATE OR REPLACE FUNCTION cp_present(v TEXT) RETURNS BOOLEAN AS $$
  SELECT v IS NOT NULL AND btrim(v) <> '';
$$ LANGUAGE sql IMMUTABLE;

-- Pipeline rank — mirrors STAGE_RANK in the dashboard (helpers.js).
CREATE OR REPLACE FUNCTION cp_stage_rank(s TEXT) RETURNS INT AS $$
  SELECT CASE s
    WHEN 'Visit Scheduled'   THEN 1
    WHEN 'Visit Completed'   THEN 2
    WHEN 'Followup'          THEN 3
    WHEN 'Future Prospect'   THEN 3
    WHEN 'Price High'        THEN 3
    WHEN 'Negotiation'       THEN 4
    WHEN 'Token Requested'   THEN 5
    WHEN 'Token Transferred' THEN 6
    WHEN 'AMA Req'           THEN 7
    WHEN 'Hold'              THEN 8
    WHEN 'AMA Signed'        THEN 9
    WHEN 'Key Handover'      THEN 10
    WHEN 'Listed'            THEN 11
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

-- supply_status → cp_status mapping.
CREATE OR REPLACE FUNCTION cp_status_for(s TEXT) RETURNS TEXT AS $$
  SELECT CASE s
    WHEN 'AMA Req'               THEN 'Closure'
    WHEN 'AMA Signed'            THEN 'Closure'
    WHEN 'Cancelled Post Token'  THEN 'Rejected'
    WHEN 'Dead - Legal'          THEN 'Rejected'
    WHEN 'Dead - Not Interested' THEN 'Rejected'
    WHEN 'Dead - Sold'           THEN 'Rejected'
    WHEN 'Duplicacy'             THEN 'Rejected'
    WHEN 'Followup'              THEN 'Offer'
    WHEN 'Future Prospect'       THEN 'Price Rejected'
    WHEN 'Hold'                  THEN 'Rejected'
    WHEN 'Key Handover'          THEN 'Closure'
    WHEN 'Listed'                THEN 'Closure'
    WHEN 'Negotiation'           THEN 'Offer'
    WHEN 'OH Rejected'           THEN 'Rejected'
    WHEN 'Price High'            THEN 'Price Rejected'
    WHEN 'Seller Rejected'       THEN 'Rejected'
    WHEN 'Token Requested'       THEN 'Closure'
    WHEN 'Token Transferred'     THEN 'Closure'
    WHEN 'Visit Completed'       THEN 'Visit Completed'
    WHEN 'Visit Scheduled'       THEN 'Visit Scheduled'
    ELSE ''
  END;
$$ LANGUAGE sql IMMUTABLE;

-- valid_cp_id: lead_id beginning with OHLGC / OHLGHC / OHLNC.
CREATE OR REPLACE FUNCTION cp_is_valid_id(v TEXT) RETURNS BOOLEAN AS $$
  SELECT UPPER(COALESCE(v, '')) LIKE 'OHLGC%'
      OR UPPER(COALESCE(v, '')) LIKE 'OHLGHC%'
      OR UPPER(COALESCE(v, '')) LIKE 'OHLNC%';
$$ LANGUAGE sql IMMUTABLE;

-- Auto-stage derived purely from form-submission columns (mirrors getStage()).
-- is_token_refunded is compared via ::text so this works whether the column
-- is BOOLEAN or TEXT.
CREATE OR REPLACE FUNCTION cp_auto_stage(p properties) RETURNS TEXT AS $$
  SELECT CASE
    WHEN COALESCE(p.is_token_refunded::text, '') = 'true'  THEN 'Cancelled Post Token'
    WHEN cp_present(p.listing_submitted_at::text)          THEN 'Listed'
    WHEN cp_present(p.final_submitted_at::text)            THEN 'Key Handover'
    WHEN cp_present(p.cp_bill_submitted_at::text)          THEN 'AMA Signed'
    WHEN cp_present(p.pending_request_submitted_at::text)  THEN 'AMA Signed'
    WHEN cp_present(p.ama_submitted_at::text)              THEN 'AMA Req'
    WHEN cp_present(p.token_deal_submitted_at::text)       THEN 'Token Transferred'
    WHEN cp_present(p.token_submitted_at::text)            THEN 'Token Requested'
    WHEN cp_present(p.visit_submitted_at::text)            THEN 'Visit Completed'
    WHEN cp_present(p.schedule_submitted_at::text)         THEN 'Visit Scheduled'
    ELSE '—'
  END;
$$ LANGUAGE sql STABLE;

-- Final supply status: manual override reconciled with the auto-stage
-- (mirrors getStatus() — a terminal override always wins; otherwise the
-- higher pipeline rank wins, with ties going to the manual override).
CREATE OR REPLACE FUNCTION cp_supply_status(p properties) RETURNS TEXT AS $$
  SELECT CASE
    WHEN COALESCE(p.status_override, '') = '' THEN cp_auto_stage(p)
    WHEN p.status_override IN (
      'Dead - Legal', 'Dead - Sold', 'Dead - Not Interested',
      'Cancelled Post Token', 'Duplicacy', 'OH Rejected', 'Seller Rejected'
    ) THEN p.status_override
    WHEN cp_stage_rank(p.status_override) >= cp_stage_rank(cp_auto_stage(p))
      THEN p.status_override
    ELSE cp_auto_stage(p)
  END;
$$ LANGUAGE sql STABLE;

-- ── 3. Trigger functions ────────────────────────────────────

-- Upsert one cp_inventory_status row for the changed property.
CREATE OR REPLACE FUNCTION cp_sync_inventory_status() RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  v_status := cp_supply_status(NEW);
  INSERT INTO cp_inventory_status (uid, cp_id, valid_cp_id, supply_status, cp_status, updated_at)
  VALUES (
    NEW.uid,
    COALESCE(NEW.lead_id, ''),
    cp_is_valid_id(NEW.lead_id),
    v_status,
    cp_status_for(v_status),
    NOW()
  )
  ON CONFLICT (uid) DO UPDATE SET
    cp_id         = EXCLUDED.cp_id,
    valid_cp_id   = EXCLUDED.valid_cp_id,
    supply_status = EXCLUDED.supply_status,
    cp_status     = EXCLUDED.cp_status,
    updated_at    = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove the mirror row if a property is hard-deleted.
CREATE OR REPLACE FUNCTION cp_sync_inventory_status_delete() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cp_inventory_status WHERE uid = OLD.uid;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Triggers on `properties` ─────────────────────────────
-- Fires only when a status-relevant column changes, so routine
-- comment edits do not churn cp_inventory_status.
DROP TRIGGER IF EXISTS trg_cp_inventory_status ON properties;
CREATE TRIGGER trg_cp_inventory_status
AFTER INSERT OR UPDATE OF
  status_override, is_token_refunded, lead_id,
  schedule_submitted_at, visit_submitted_at, token_submitted_at,
  token_deal_submitted_at, ama_submitted_at, pending_request_submitted_at,
  cp_bill_submitted_at, final_submitted_at, listing_submitted_at
ON properties
FOR EACH ROW
EXECUTE FUNCTION cp_sync_inventory_status();

DROP TRIGGER IF EXISTS trg_cp_inventory_status_del ON properties;
CREATE TRIGGER trg_cp_inventory_status_del
AFTER DELETE ON properties
FOR EACH ROW
EXECUTE FUNCTION cp_sync_inventory_status_delete();

-- ── 5. Backfill existing properties ─────────────────────────
INSERT INTO cp_inventory_status (uid, cp_id, valid_cp_id, supply_status, cp_status, updated_at)
SELECT q.uid, q.cp_id, q.valid_cp_id, q.ss, cp_status_for(q.ss), NOW()
FROM (
  SELECT
    p.uid                       AS uid,
    COALESCE(p.lead_id, '')     AS cp_id,
    cp_is_valid_id(p.lead_id)   AS valid_cp_id,
    cp_supply_status(p)         AS ss
  FROM properties p
) q
ON CONFLICT (uid) DO UPDATE SET
  cp_id         = EXCLUDED.cp_id,
  valid_cp_id   = EXCLUDED.valid_cp_id,
  supply_status = EXCLUDED.supply_status,
  cp_status     = EXCLUDED.cp_status,
  updated_at    = NOW();
