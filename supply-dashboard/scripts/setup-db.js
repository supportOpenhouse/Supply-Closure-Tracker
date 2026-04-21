/**
 * Run this once to add dashboard columns to your existing properties table.
 * Usage: DATABASE_URL=your_neon_url node scripts/setup-db.js
 */

const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const path = require("path");

async function setup() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ Set DATABASE_URL environment variable first.");
    console.error("   Example: DATABASE_URL=postgresql://user:pass@host/db node scripts/setup-db.js");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const migration = fs.readFileSync(path.join(__dirname, "migration.sql"), "utf-8");

  // Split by semicolons and run each statement
  const statements = migration
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));

  console.log("🔧 Running migration on Neon database...\n");

  for (const stmt of statements) {
    try {
      await sql(stmt);
      console.log("  ✅ " + stmt.substring(0, 60) + "...");
    } catch (err) {
      console.error("  ⚠️  " + stmt.substring(0, 60) + "...");
      console.error("     " + err.message);
    }
  }

  console.log("\n✅ Migration complete. Your properties table now has dashboard columns.");
}

setup().catch(console.error);
