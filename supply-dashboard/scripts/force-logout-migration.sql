-- Run this in Neon SQL Editor before deploying
ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS force_logout_at TIMESTAMPTZ;
