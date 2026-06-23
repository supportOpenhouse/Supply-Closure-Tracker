-- Merge stages "Hold" and "Price High" into "Future Prospect".
-- The status string is persisted only as a manual override:
--   live rows  -> properties.status_override
--   legacy rows -> legacy_edits.value (field = 'status_override')
-- Original timestamps (status_override_at / updated_at) are left untouched so
-- the "set at" history is preserved.

UPDATE properties
SET status_override = 'Future Prospect'
WHERE status_override IN ('Hold', 'Price High');

UPDATE legacy_edits
SET value = 'Future Prospect'
WHERE field = 'status_override' AND value IN ('Hold', 'Price High');
