const { getDB } = require("../_db");
const { requireAuth } = require("../_auth");

// managed_team may come back as a native array (jsonb/text[] pre-parsed by the
// driver) or a JSON string — normalize to a clean array of trimmed names.
function parseTeam(raw) {
  let arr = [];
  try {
    arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : []);
  } catch {
    arr = [];
  }
  return (arr || []).map(n => (n || "").toString().trim()).filter(Boolean);
}

// Team Directory: managers are `users` rows with a managed_team. Admin-only.
// GET  → { managers:[{name,email,employees[]}], allNames:[...] }
// PATCH → add/remove one employee name from a manager's managed_team.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const sql = getDB();

  if (req.method === "GET") {
    try {
      // Managers = dashboard_users with role 'manager', joined to their `users`
      // row for managed_team. Admins and everyone else never appear here, so no
      // one but managers shows employees under them.
      const rows = await sql`
        SELECT u.name, u.email, u.managed_team
        FROM users u
        JOIN dashboard_users du ON LOWER(du.email) = LOWER(u.email)
        WHERE du.role = 'manager'
      `;
      const managers = [];
      rows.forEach(r => {
        const name = (r.name || "").trim();
        if (!name) return;
        managers.push({ name, email: (r.email || "").trim(), employees: parseTeam(r.managed_team) });
      });
      managers.sort((a, b) => a.name.localeCompare(b.name));

      // Dropdown candidates = users who are NOT managers or admins (viewers,
      // commenters, or people with no dashboard account at all).
      const allRows = await sql`
        SELECT DISTINCT u.name
        FROM users u
        LEFT JOIN dashboard_users du ON LOWER(du.email) = LOWER(u.email)
        WHERE u.name IS NOT NULL AND btrim(u.name) <> ''
          AND (du.role IS NULL OR du.role NOT IN ('manager', 'admin'))
        ORDER BY u.name
      `;
      const allNames = allRows.map(u => (u.name || "").trim()).filter(Boolean);

      return res.status(200).json({ managers, allNames });
    } catch (err) {
      console.error("Team lookup failed:", err.message);
      return res.status(500).json({ error: "Failed to load team: " + err.message });
    }
  }

  if (req.method === "PATCH") {
    const { managerEmail, employee, action } = req.body || {};
    if (!managerEmail || !employee || (action !== "add" && action !== "remove")) {
      return res.status(400).json({ error: "managerEmail, employee, and action ('add'|'remove') are required" });
    }
    const target = String(managerEmail).trim().toLowerCase();
    const emp = String(employee).trim();
    if (!emp) return res.status(400).json({ error: "employee name is empty" });

    try {
      // Enforce "managers only" server-side, not just in the UI.
      const roleRows = await sql`SELECT role FROM dashboard_users WHERE LOWER(email) = ${target} LIMIT 1`;
      if (roleRows.length === 0 || roleRows[0].role !== "manager") {
        return res.status(400).json({ error: "Target user is not a manager" });
      }

      const rows = await sql`SELECT managed_team FROM users WHERE LOWER(email) = ${target} LIMIT 1`;
      if (rows.length === 0) return res.status(404).json({ error: "Manager not found" });

      let team = parseTeam(rows[0].managed_team);
      const has = team.some(n => n.toLowerCase() === emp.toLowerCase());
      if (action === "add") {
        if (!has) team.push(emp);
      } else {
        team = team.filter(n => n.toLowerCase() !== emp.toLowerCase());
      }

      // Store as a JSON string — works whether managed_team is jsonb or text.
      await sql`UPDATE users SET managed_team = ${JSON.stringify(team)} WHERE LOWER(email) = ${target}`;
      return res.status(200).json({ success: true, employees: team });
    } catch (err) {
      console.error("Team update failed:", err.message);
      return res.status(500).json({ error: "Failed to update team: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
