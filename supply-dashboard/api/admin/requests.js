const { getDB } = require("../_db");
const { requireAdmin } = require("../_auth");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const sql = getDB();

  // GET - list pending requests
  if (req.method === "GET") {
    const requests = await sql`
      SELECT id, email, name, picture, status, created_at
      FROM access_requests
      ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, created_at DESC
    `;
    return res.status(200).json(requests);
  }

  // PATCH - approve or reject
  if (req.method === "PATCH") {
    const { id, action } = req.body; // action: "approve" or "reject"
    if (!id || !action) return res.status(400).json({ error: "id and action required" });

    if (action === "approve") {
      // Get the request
      const reqs = await sql`SELECT email, name FROM access_requests WHERE id = ${id}`;
      if (reqs.length === 0) return res.status(404).json({ error: "Request not found" });

      const { email, name } = reqs[0];

      // Add to users
      await sql`
        INSERT INTO dashboard_users (email, name, role, added_by)
        VALUES (${email}, ${name}, 'viewer', ${admin.email})
        ON CONFLICT (email) DO NOTHING
      `;

      // Mark approved
      await sql`
        UPDATE access_requests SET status = 'approved', reviewed_by = ${admin.email}, reviewed_at = NOW()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE access_requests SET status = 'rejected', reviewed_by = ${admin.email}, reviewed_at = NOW()
        WHERE id = ${id}
      `;
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
