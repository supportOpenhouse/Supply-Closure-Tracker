# Openhouse Supply Closure Tracker

Live dashboard with Google login, admin panel, and Neon PostgreSQL backend. Deployed on Vercel.

## How Login Works

1. User opens dashboard → redirected to login page
2. User clicks **Sign in with Google**
3. Backend checks if their email is in `dashboard_users` table
4. **If whitelisted** → session created → redirected to dashboard
5. **If not whitelisted** → "Request Access" button appears
6. Admin sees pending request badge → opens **Manage Users** panel → approves/rejects

## Setup

### Step 1: Create Google OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add **Authorized JavaScript origins**: `https://your-app.vercel.app` and `http://localhost:3000`
7. Copy the **Client ID**

### Step 2: Run database migrations in Neon SQL Editor

Dashboard columns (if not already done):
```sql
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status_override TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS closure_team_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rahool_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS prashant_comments TEXT DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS demand_team_comments TEXT DEFAULT '';
```

Auth tables:
```sql
CREATE TABLE IF NOT EXISTS dashboard_users (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT DEFAULT '',
  role TEXT DEFAULT 'viewer', added_by TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS access_requests (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL, name TEXT DEFAULT '',
  picture TEXT DEFAULT '', status TEXT DEFAULT 'pending', reviewed_by TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(), reviewed_at TIMESTAMP
);
INSERT INTO dashboard_users (email, name, role) VALUES ('ashish@openhouse.in', 'Ashish', 'admin') ON CONFLICT (email) DO NOTHING;
```

### Step 3: Push to GitHub
```bash
git add . && git commit -m "Add auth" && git push
```

### Step 4: Add env variables in Vercel Dashboard → Settings → Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Neon connection string |
| `GOOGLE_CLIENT_ID` | From Step 1 |
| `JWT_SECRET` | Any random string |

### Step 5: Redeploy from Vercel dashboard or push a commit.
