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

  // GET - list all team members
  if (req.method === "GET") {
    const team = await sql`
      SELECT id, email, display_name, manager_email, is_active, created_at
      FROM team_directory
      ORDER BY display_name ASC
    `;
    return res.status(200).json(team);
  }

  // POST - add team member
  if (req.method === "POST") {
    const { email, display_name, manager_email } = req.body;
    if (!email || !display_name) {
      return res.status(400).json({ error: "email and display_name required" });
    }

    await sql`
      INSERT INTO team_directory (email, display_name, manager_email)
      VALUES (${email.toLowerCase()}, ${display_name}, ${manager_email || ''})
      ON CONFLICT (email) DO UPDATE SET
        display_name = ${display_name},
        manager_email = ${manager_email || ''}
    `;

    return res.status(200).json({ success: true });
  }

  // PATCH - update team member
  if (req.method === "PATCH") {
    const { id, display_name, manager_email, is_active } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });

    if (display_name !== undefined) {
      await sql`UPDATE team_directory SET display_name = ${display_name} WHERE id = ${id}`;
    }
    if (manager_email !== undefined) {
      await sql`UPDATE team_directory SET manager_email = ${manager_email} WHERE id = ${id}`;
    }
    if (is_active !== undefined) {
      await sql`UPDATE team_directory SET is_active = ${is_active} WHERE id = ${id}`;
    }

    return res.status(200).json({ success: true });
  }

  // DELETE - remove team member
  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });

    await sql`DELETE FROM team_directory WHERE id = ${id}`;
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
