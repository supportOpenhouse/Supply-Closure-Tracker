const { getDB } = require("../_db");
const { requireAdmin } = require("../_auth");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const sql = getDB();

  try {
    // Mode: "options" returns distinct values for dropdowns
    if (req.query.mode === "options") {
      const [actions, categories, actorEmails, actorNames, dashboards] = await Promise.all([
        sql`SELECT DISTINCT action FROM activity_logs WHERE action IS NOT NULL AND action != '' ORDER BY action`,
        sql`SELECT DISTINCT category FROM activity_logs WHERE category IS NOT NULL AND category != '' ORDER BY category`,
        sql`SELECT DISTINCT actor_email FROM activity_logs WHERE actor_email IS NOT NULL AND actor_email != '' ORDER BY actor_email`,
        sql`SELECT DISTINCT actor_name FROM activity_logs WHERE actor_name IS NOT NULL AND actor_name != '' ORDER BY actor_name`,
        sql`SELECT DISTINCT dashboard FROM activity_logs WHERE dashboard IS NOT NULL AND dashboard != '' ORDER BY dashboard`,
      ]);
      return res.status(200).json({
        actions: actions.map(r => r.action),
        categories: categories.map(r => r.category),
        actor_emails: actorEmails.map(r => r.actor_email),
        actor_names: actorNames.map(r => r.actor_name),
        dashboards: dashboards.map(r => r.dashboard),
      });
    }

    // Parse multi-value query params (comma-separated)
    const parseMulti = (v) => (v ? String(v).split(",").filter(Boolean) : []);
    const uid = (req.query.uid || "").trim();
    const actions = parseMulti(req.query.actions);
    const categories = parseMulti(req.query.categories);
    const actor_emails = parseMulti(req.query.actor_emails);
    const actor_names = parseMulti(req.query.actor_names);
    const dashboards = parseMulti(req.query.dashboards);
    const from = (req.query.from || "").trim();
    const to = (req.query.to || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 2000);

    // Build WHERE
    const conditions = [];
    const params = [];
    let pi = 1;

    if (uid) { conditions.push(`uid ILIKE $${pi++}`); params.push("%" + uid + "%"); }
    if (actions.length) { conditions.push(`action = ANY($${pi++})`); params.push(actions); }
    if (categories.length) { conditions.push(`category = ANY($${pi++})`); params.push(categories); }
    if (actor_emails.length) { conditions.push(`actor_email = ANY($${pi++})`); params.push(actor_emails); }
    if (actor_names.length) { conditions.push(`actor_name = ANY($${pi++})`); params.push(actor_names); }
    if (dashboards.length) { conditions.push(`dashboard = ANY($${pi++})`); params.push(dashboards); }
    if (from) { conditions.push(`created_at >= $${pi++}`); params.push(from); }
    if (to) {
      // Include the full "to" day (end of day)
      conditions.push(`created_at < ($${pi++}::date + INTERVAL '1 day')`);
      params.push(to);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const query = `SELECT id, uid, action, category, actor_email, actor_name, details, created_at, dashboard
                   FROM activity_logs ${where}
                   ORDER BY created_at DESC LIMIT ${limit}`;
    const rows = await sql(query, params);

    return res.status(200).json({ logs: rows, count: rows.length, limited: rows.length === limit });
  } catch (err) {
    console.error("Activity logs error:", err);
    return res.status(500).json({ error: "Failed to fetch logs: " + err.message });
  }
};
