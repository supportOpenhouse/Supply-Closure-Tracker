const { neon } = require("@neondatabase/serverless");

function getDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(process.env.DATABASE_URL);
}

// Second (read-only) database holding the oh_pricing table — Direct Inventory.
function getInventoryDB() {
  if (!process.env.DIRECT_INVENTORY_DB_URL) {
    throw new Error("DIRECT_INVENTORY_DB_URL environment variable is not set");
  }
  return neon(process.env.DIRECT_INVENTORY_DB_URL);
}

module.exports = { getDB, getInventoryDB };
