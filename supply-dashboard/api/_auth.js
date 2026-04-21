const { SignJWT, jwtVerify } = require("jose");

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "openhouse-dashboard-secret-change-me");
const COOKIE_NAME = "oh_session";

async function createSession(user) {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET);
  return token;
}

async function verifySession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// Verify user exists in DB, get live role, check force-logout
async function verifyUserLive(email, jwtIssuedAt) {
  try {
    const { neon } = require("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT role, force_logout_at FROM dashboard_users WHERE LOWER(email) = ${email.toLowerCase()}`;
    if (rows.length === 0) return null; // user removed
    const user = rows[0];
    // If token was issued before force_logout_at, reject
    if (user.force_logout_at && jwtIssuedAt) {
      const forceTs = Math.floor(new Date(user.force_logout_at).getTime() / 1000);
      if (jwtIssuedAt < forceTs) return null;
    }
    return { role: user.role };
  } catch {
    return null;
  }
}

async function requireAuth(req, res) {
  const user = await verifySession(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const live = await verifyUserLive(user.email, user.iat);
  if (!live) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session expired. Please log in again." });
    return null;
  }
  user.role = live.role;
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return user;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}; Secure`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function parseCookies(str) {
  const obj = {};
  str.split(";").forEach(pair => {
    const [k, ...v] = pair.trim().split("=");
    if (k) obj[k] = v.join("=");
  });
  return obj;
}

module.exports = { createSession, verifySession, requireAuth, requireAdmin, setSessionCookie, clearSessionCookie, COOKIE_NAME };
