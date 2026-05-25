const { requireAdmin } = require("../_auth");
const { syncAll } = require("../_submissions-sync");

// Admin-only bulk sync from cp_inventory_status → external submissions DB.
// One-time / on-demand utility; safe to call repeatedly.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const result = await syncAll();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Bulk submissions sync failed:", err);
    return res.status(500).json({ error: "Sync failed: " + err.message });
  }
};
