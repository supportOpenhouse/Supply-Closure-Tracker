const { verifySession, clearSessionCookie } = require("../_auth");
const { getDB } = require("../_db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifySession(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  // Always check live DB: user must exist, role must be current, force-logout respected
  try {
    const sql = getDB();
    const rows = await sql`SELECT role, force_logout_at FROM dashboard_users WHERE LOWER(email) = ${user.email.toLowerCase()}`;
    if (rows.length === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "User removed. Please log in again." });
    }
    const dbUser = rows[0];

    // Check force logout
    if (dbUser.force_logout_at && user.iat) {
      const forceTs = Math.floor(new Date(dbUser.force_logout_at).getTime() / 1000);
      if (user.iat < forceTs) {
        clearSessionCookie(res);
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
    }

    user.role = dbUser.role;
  } catch {}

  return res.status(200).json({ user });
};
