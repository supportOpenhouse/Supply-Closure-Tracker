-- Stores the visit scheduling history for a property as a JSONB object:
-- {
--   "scheduled_date": "2026-05-13",
--   "reschedules": [
--     { "on": "2026-05-14T17:16:14", "old_date": "2026-05-13", "new_date": "2026-05-18" }
--   ],
--   "cancelled_on": "2026-05-19T12:12:37"
-- }
-- Surfaced read-only in the dashboard under the "Visit Schedule History" column.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS visit_date_history JSONB;
