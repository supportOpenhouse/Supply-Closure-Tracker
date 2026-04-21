-- ============================================
-- Team Directory - maps emails to display names
-- and defines manager relationships.
-- Run this on your Neon database.
-- ============================================

CREATE TABLE IF NOT EXISTS team_directory (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  manager_email TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_team_display_name ON team_directory(LOWER(display_name));
CREATE INDEX IF NOT EXISTS idx_team_manager ON team_directory(LOWER(manager_email));

-- ============================================
-- POPULATE YOUR TEAM BELOW
-- Format: (email, display_name_as_in_data, manager_email)
--
-- display_name MUST match what appears in
-- assigned_by / field_exec / token_requested_by
-- in your properties table.
-- ============================================

INSERT INTO team_directory (email, display_name, manager_email) VALUES
  -- Leadership (no manager, they are admins)
  ('rahool@openhouse.in',    'Rahool Sureka',    ''),
  ('ankit@openhouse.in',     'Ankit Khemka',     ''),
  ('ashish@openhouse.in',    'Ashish',           'rahool@openhouse.in'),

  -- Gurgaon team
  ('apurba@openhouse.in',    'Apurba Nath',      'ashish@openhouse.in'),
  ('shashank@openhouse.in',  'Shashank Kumar',   'ashish@openhouse.in'),
  ('praveen@openhouse.in',   'Praveen Kumar',    'apurba@openhouse.in'),
  ('rahul.singh@openhouse.in','Rahul Singh',     'shashank@openhouse.in'),

  -- Noida team
  ('vaibhav@openhouse.in',   'Vaibhav Dwivedi',  'ashish@openhouse.in'),
  ('sahil@openhouse.in',     'Sahil Singh',       'vaibhav@openhouse.in'),
  ('kavita@openhouse.in',    'Kavita Rawat',      'vaibhav@openhouse.in'),
  ('arti@openhouse.in',      'Arti Ahirwar',      'vaibhav@openhouse.in'),
  ('abhishek@openhouse.in',  'Abhishek Rathore',  'vaibhav@openhouse.in'),
  ('aman@openhouse.in',      'Aman Dixit',        'vaibhav@openhouse.in'),

  -- Ghaziabad team
  ('animesh@openhouse.in',   'Animesh Singh',     'ashish@openhouse.in'),
  ('nishant@openhouse.in',   'Nishant Singh',     'animesh@openhouse.in'),
  ('sushmita@openhouse.in',  'Sushmita Roy',      'animesh@openhouse.in'),
  ('rahul.sheel@openhouse.in','Rahul Sheel',      'sushmita@openhouse.in')

ON CONFLICT (email) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  manager_email = EXCLUDED.manager_email;
