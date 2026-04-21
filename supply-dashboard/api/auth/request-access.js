const { getDB } = require("../_db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, name, picture } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const sql = getDB();

    // Check if already requested
    const existing = await sql`
      SELECT id, status FROM access_requests
      WHERE LOWER(email) = ${email.toLowerCase()} AND status = 'pending'
    `;

    if (existing.length > 0) {
      return res.status(200).json({ success: true, message: "Access request already pending" });
    }

    // Insert request
    await sql`
      INSERT INTO access_requests (email, name, picture, status)
      VALUES (${email.toLowerCase()}, ${name || ''}, ${picture || ''}, 'pending')
    `;

    return res.status(200).json({ success: true, message: "Access request submitted" });
  } catch (err) {
    console.error("Request access error:", err);
    return res.status(500).json({ error: "Failed to submit request" });
  }
};
