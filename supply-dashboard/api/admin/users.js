const { getDB } = require("../_db");
const { requireAdmin } = require("../_auth");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const sql = getDB();

  // GET - list all users
  if (req.method === "GET") {
    const users = await sql`SELECT id, email, name, role, added_by, created_at FROM dashboard_users ORDER BY created_at DESC`;
    return res.status(200).json(users);
  }

  // POST - add user
  if (req.method === "POST") {
    const { email, name, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    try {
      await sql`
        INSERT INTO dashboard_users (email, name, role, added_by)
        VALUES (${email.toLowerCase()}, ${name || ''}, ${role || 'viewer'}, ${admin.email})
        ON CONFLICT (email) DO UPDATE SET role = ${role || 'viewer'}, name = ${name || ''}
      `;

      // If there's a pending access request, mark it approved
      await sql`
        UPDATE access_requests SET status = 'approved', reviewed_by = ${admin.email}, reviewed_at = NOW()
        WHERE LOWER(email) = ${email.toLowerCase()} AND status = 'pending'
      `;

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Add user error:", err);
      return res.status(500).json({ error: "Failed to add user" });
    }
  }

  // DELETE - remove user
  if (req.method === "DELETE") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    if (email.toLowerCase() === admin.email.toLowerCase()) {
      return res.status(400).json({ error: "Cannot remove yourself" });
    }

    await sql`DELETE FROM dashboard_users WHERE LOWER(email) = ${email.toLowerCase()}`;
    return res.status(200).json({ success: true });
  }

  // PATCH - force logout all users
  if (req.method === "PATCH") {
    const { action } = req.body;
    if (action === "force_logout_all") {
      await sql`UPDATE dashboard_users SET force_logout_at = NOW()`;
      return res.status(200).json({ success: true, message: "All users will be logged out on next request" });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
