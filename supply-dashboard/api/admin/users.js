const { getDB } = require("../_db");
const { requireAdmin, nameFromEmail } = require("../_auth");

// Fire-and-forget activity log entry for a user-role event.
function logUserActivity(sql, { uid, action, actor_email, actor_name, details }) {
  sql`INSERT INTO activity_logs (uid, action, category, actor_email, actor_name, details, dashboard)
      VALUES (${uid}, ${action}, ${"admin"}, ${actor_email || ""}, ${actor_name || ""}, ${JSON.stringify(details)}, ${"Supply Dashboard"})
  `.catch(err => console.error("Activity log failed:", err.message));
}

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

    const normalizedEmail = email.toLowerCase();
    const storedName = (name && name.trim()) || nameFromEmail(normalizedEmail) || "";
    const newRole = role || "viewer";

    try {
      // Capture existing role/name (if any) so we can tell add vs. edit.
      const existing = await sql`SELECT role, name FROM dashboard_users WHERE email = ${normalizedEmail}`;
      const oldRole = existing.length > 0 ? (existing[0].role || "") : null;
      const oldName = existing.length > 0 ? (existing[0].name || "") : null;

      await sql`
        INSERT INTO dashboard_users (email, name, role, added_by)
        VALUES (${normalizedEmail}, ${storedName}, ${newRole}, ${admin.email})
        ON CONFLICT (email) DO UPDATE SET role = ${newRole}, name = ${storedName}
      `;

      // If there's a pending access request, mark it approved
      await sql`
        UPDATE access_requests SET status = 'approved', reviewed_by = ${admin.email}, reviewed_at = NOW()
        WHERE LOWER(email) = ${normalizedEmail} AND status = 'pending'
      `;

      if (oldRole === null) {
        logUserActivity(sql, {
          uid: normalizedEmail,
          action: "user_added",
          actor_email: admin.email,
          actor_name: admin.name || admin.email,
          details: {
            target_email: normalizedEmail,
            target_name: storedName,
            source: "manual",
            changes: { role: { old: null, new: newRole } },
          },
        });
      } else {
        // Existing user — log any edit (role and/or name change).
        const changes = {};
        if (oldRole !== newRole) changes.role = { old: oldRole, new: newRole };
        if (oldName !== storedName) changes.name = { old: oldName, new: storedName };
        if (Object.keys(changes).length > 0) {
          logUserActivity(sql, {
            uid: normalizedEmail,
            action: "user_updated",
            actor_email: admin.email,
            actor_name: admin.name || admin.email,
            details: { target_email: normalizedEmail, changes },
          });
        }
      }

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

    const target = email.toLowerCase();
    const existing = await sql`SELECT role FROM dashboard_users WHERE email = ${target}`;
    await sql`DELETE FROM dashboard_users WHERE LOWER(email) = ${target}`;

    if (existing.length > 0) {
      const priorRole = existing[0].role || "";
      logUserActivity(sql, {
        uid: target,
        action: "user_removed",
        actor_email: admin.email,
        actor_name: admin.name || admin.email,
        details: {
          target_email: target,
          changes: { role: { old: priorRole, new: null } },
        },
      });
    }
    return res.status(200).json({ success: true });
  }

  // PATCH - force logout all users
  if (req.method === "PATCH") {
    const { action } = req.body;
    if (action === "force_logout_all") {
      await sql`UPDATE dashboard_users SET force_logout_at = NOW()`;
      logUserActivity(sql, {
        uid: "all",
        action: "users_force_logout",
        actor_email: admin.email,
        actor_name: admin.name || admin.email,
        details: { source: "manual", scope: "all_users" },
      });
      return res.status(200).json({ success: true, message: "All users will be logged out on next request" });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
