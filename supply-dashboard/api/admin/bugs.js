const { getDB } = require("../_db");
const { requireAuth, requireAdmin } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  // POST - submit a bug report (any logged-in user)
  if (req.method === "POST") {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const { title, description, steps_to_reproduce, severity, screenshot_url, page, browser_info, screen_size } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
      }

      const sql = getDB();
      const result = await sql`
        INSERT INTO bug_reports (reported_by, title, description, steps_to_reproduce, severity, screenshot_url, page, browser_info, screen_size)
        VALUES (${user.email}, ${title.trim()}, ${description || ""}, ${steps_to_reproduce || ""}, ${severity || "medium"}, ${screenshot_url || ""}, ${page || ""}, ${browser_info || ""}, ${screen_size || ""})
        RETURNING id
      `;

      // Send email notification (fire and forget)
      const webhookUrl = process.env.BUG_NOTIFY_WEBHOOK;
      if (webhookUrl) {
        try {
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: "saransh.khera@openhouse.in",
              subject: "[Bug #" + result[0].id + "] " + title.trim(),
              reported_by: user.email,
              title: title.trim(),
              screenshot: screenshot_url || "None",
              browser: browser_info || "",
              screen: screen_size || "",
              timestamp: new Date().toISOString(),
            })
          }).catch(() => {});
        } catch {}
      }

      return res.status(200).json({ success: true, id: result[0].id });
    } catch (err) {
      console.error("Bug report submit error:", err);
      return res.status(500).json({ error: "Failed to submit report" });
    }
  }

  // GET - list all bug reports (admin only)
  if (req.method === "GET") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const sql = getDB();
      const reports = await sql`
        SELECT * FROM bug_reports ORDER BY 
          CASE WHEN status = 'open' THEN 0 WHEN status = 'in_progress' THEN 1 ELSE 2 END,
          CASE WHEN severity = 'critical' THEN 0 WHEN severity = 'high' THEN 1 WHEN severity = 'medium' THEN 2 ELSE 3 END,
          created_at DESC
      `;
      return res.status(200).json(reports);
    } catch (err) {
      console.error("Bug report list error:", err);
      return res.status(500).json({ error: "Failed to fetch reports" });
    }
  }

  // PATCH - update status/notes (admin only)
  if (req.method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const { id, status, admin_notes } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });

      const sql = getDB();

      if (status) {
        if (status === "resolved" || status === "closed") {
          await sql`UPDATE bug_reports SET status = ${status}, resolved_by = ${admin.email}, resolved_at = NOW() WHERE id = ${id}`;
        } else {
          await sql`UPDATE bug_reports SET status = ${status} WHERE id = ${id}`;
        }
      }
      if (admin_notes !== undefined) {
        await sql`UPDATE bug_reports SET admin_notes = ${admin_notes} WHERE id = ${id}`;
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Bug report update error:", err);
      return res.status(500).json({ error: "Failed to update report" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
