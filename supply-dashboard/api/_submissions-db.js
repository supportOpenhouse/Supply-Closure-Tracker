const { neon } = require("@neondatabase/serverless");

// Connection to the separate "submissions" Postgres database.
// Set SUBMISSIONS_DATABASE_URL on Vercel (Settings → Environment Variables).
function getSubmissionsDB() {
  const url = process.env.SUBMISSIONS_DATABASE_URL;
  if (!url) throw new Error("SUBMISSIONS_DATABASE_URL environment variable is not set");
  return neon(url);
}

module.exports = { getSubmissionsDB };
