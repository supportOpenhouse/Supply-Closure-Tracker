-- Bug Reports table for Supply Dashboard
CREATE TABLE IF NOT EXISTS bug_reports (
  id SERIAL PRIMARY KEY,
  reported_by TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  page TEXT DEFAULT '',
  steps_to_reproduce TEXT DEFAULT '',
  severity TEXT DEFAULT 'medium',
  screenshot_url TEXT DEFAULT '',
  browser_info TEXT DEFAULT '',
  screen_size TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  admin_notes TEXT DEFAULT '',
  resolved_by TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
