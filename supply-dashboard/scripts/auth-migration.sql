-- ============================================
-- Run this on your Neon database to add
-- authentication tables for the dashboard.
-- ============================================

-- Allowed users (whitelist)
CREATE TABLE IF NOT EXISTS dashboard_users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'viewer',  -- 'admin' or 'viewer'
  added_by TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Access requests from non-whitelisted users
CREATE TABLE IF NOT EXISTS access_requests (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  picture TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  reviewed_by TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

-- Seed the first admin (CHANGE THIS to your email)
INSERT INTO dashboard_users (email, name, role)
VALUES ('ashish@openhouse.in', 'Ashish', 'admin')
ON CONFLICT (email) DO NOTHING;
