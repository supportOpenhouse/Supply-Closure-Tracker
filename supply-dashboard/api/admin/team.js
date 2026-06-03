const { getDB } = require("../_db");
const { requireAuth } = require("../_auth");

// Read-only Team Directory: lists managers (rows in `users` with a non-empty
// managed_team array) and their direct employees. There is no longer a
// dashboard-side editor — managed_team is managed outside this app.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireAuth(req, res);
  if (!user) return;
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const sql = getDB();

  try {
    const rows = await sql`SELECT name, managed_team FROM users WHERE managed_team IS NOT NULL`;
    const managers = [];
    rows.forEach(r => {
      const name = (r.name || "").trim();
      if (!name) return;
      const raw = r.managed_team;
      let arr = [];
      try {
        arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : []);
      } catch {
        arr = [];
      }
      const employees = (arr || []).map(n => (n || "").toString().trim()).filter(Boolean);
      if (employees.length === 0) return;
      managers.push({ name, employees });
    });
    managers.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json(managers);
  } catch (err) {
    console.error("Team lookup failed:", err.message);
    return res.status(500).json({ error: "Failed to load team: " + err.message });
  }
};
