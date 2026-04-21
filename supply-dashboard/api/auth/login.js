const { getDB } = require("../_db");
const { createSession, setSessionCookie } = require("../_auth");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing credential" });

    // Verify Google ID token
    const googleRes = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + credential);
    if (!googleRes.ok) return res.status(401).json({ error: "Invalid Google token" });

    const googleUser = await googleRes.json();
    const email = googleUser.email.toLowerCase();
    const name = googleUser.name || email.split("@")[0];
    const picture = googleUser.picture || "";

    // Check if user is in whitelist
    const sql = getDB();
    const users = await sql`SELECT email, role FROM dashboard_users WHERE LOWER(email) = ${email}`;

    if (users.length === 0) {
      // Not whitelisted - return info for access request
      return res.status(403).json({
        error: "Access not granted",
        email,
        name,
        picture,
        message: "You don't have access yet. Request access from admin."
      });
    }

    // User is whitelisted - create session
    const user = { email, name, role: users[0].role };
    const token = await createSession(user);
    setSessionCookie(res, token);

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
};
