const { getDB } = require("./_db");
const { requireAuth } = require("./_auth");

const COMMENT_FIELDS = [
  "status_override",
  "offer_price",
  "supply_dash_brokerage",
  "followup_date",
  "closure_team_comments",
  "rahool_comments",
  "prashant_comments",
  "demand_team_comments"
];

const ADMIN_FIELDS = ["assigned_by"];
const ALL_ALLOWED = [...COMMENT_FIELDS, ...ADMIN_FIELDS];

// Fields that get activity-logged
const LOGGED_FIELDS = {
  "assigned_by": { action: "poc_changed", category: "assignment", field: "poc" },
  "status_override": { action: "status_changed", category: "status", field: "status" },
};

// IST timestamp
function getIST() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// Fire-and-forget — never blocks the response
function logActivity(sql, { uid, action, category, actor_email, actor_name, details }) {
  sql`INSERT INTO activity_logs (uid, action, category, actor_email, actor_name, details, dashboard)
      VALUES (${uid}, ${action}, ${category}, ${actor_email || ""}, ${actor_name || ""}, ${JSON.stringify(details)}, ${"Supply Dashboard"})
  `.catch(err => console.error("Activity log failed:", err.message));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireAuth(req, res);
  if (!user) return;

  if (user.role === "viewer") {
    return res.status(403).json({ error: "Viewers cannot make edits" });
  }

  try {
    const { uid, field, value } = req.body;

    if (!uid || !field) {
      return res.status(400).json({ error: "uid and field are required" });
    }

    if (user.role === "commenter" && !COMMENT_FIELDS.includes(field)) {
      return res.status(403).json({ error: "Commenters can only edit comments, status, and offer price" });
    }

    if (user.role === "demand" && field !== "demand_team_comments") {
      return res.status(403).json({ error: "Demand team can only edit demand team comments" });
    }

    if (!ALL_ALLOWED.includes(field)) {
      return res.status(400).json({ error: "Invalid field: " + field });
    }

    const sql = getDB();

    // Legacy rows
    if (uid.startsWith("LEGACY-")) {
      let oldValue = "";
      if (LOGGED_FIELDS[field]) {
        try {
          const old = await sql`SELECT value FROM legacy_edits WHERE uid = ${uid} AND field = ${field}`;
          oldValue = old.length > 0 ? old[0].value : "";
        } catch {}
      }

      let valueToStore = value || "";
      if (field === "followup_date") {
        // Read existing array, append or replace within 8s window
        let dates = [];
        try {
          const existing = await sql`SELECT value FROM legacy_edits WHERE uid = ${uid} AND field = 'followup_dates'`;
          if (existing.length > 0) {
            try { dates = JSON.parse(existing[0].value); if (!Array.isArray(dates)) dates = []; } catch { dates = []; }
          }
        } catch {}
        const now = Date.now();
        const newEntry = { date: value || "", set_by: user.email, set_at: new Date().toISOString() };
        if (dates.length > 0) {
          const lastAt = new Date(dates[dates.length - 1].set_at).getTime();
          if (!isNaN(lastAt) && (now - lastAt) < 8000) {
            dates[dates.length - 1] = newEntry;
          } else {
            dates.push(newEntry);
          }
        } else {
          dates.push(newEntry);
        }
        // Store the array as JSON under 'followup_dates' key (not the raw date)
        await sql`
          INSERT INTO legacy_edits (uid, field, value, updated_at)
          VALUES (${uid}, ${'followup_dates'}, ${JSON.stringify(dates)}, NOW())
          ON CONFLICT (uid, field) DO UPDATE SET value = ${JSON.stringify(dates)}, updated_at = NOW()
        `;
        return res.status(200).json({ success: true, uid, field, value });
      }

      await sql`
        INSERT INTO legacy_edits (uid, field, value, updated_at)
        VALUES (${uid}, ${field}, ${valueToStore}, NOW())
        ON CONFLICT (uid, field) DO UPDATE SET value = ${valueToStore}, updated_at = NOW()
      `;

      if (LOGGED_FIELDS[field] && oldValue !== (value || "")) {
        const meta = LOGGED_FIELDS[field];
        logActivity(sql, {
          uid, action: meta.action, category: meta.category,
          actor_email: user.email, actor_name: user.name || user.email,
          details: { field: meta.field, old: oldValue, new: value || "", source: "supply_dashboard", timestamp_ist: getIST() }
        });
      }

      return res.status(200).json({ success: true, uid, field, value });
    }

    // Live rows — fetch old value before update
    let oldValue = "";
    if (LOGGED_FIELDS[field]) {
      try {
        const old = await sql(`SELECT ${field} as val FROM properties WHERE uid = $1`, [uid]);
        oldValue = old.length > 0 ? (old[0].val || "") : "";
      } catch {}
    }

    const COMMENT_TS = {
      "closure_team_comments": "closure_team_comments_at",
      "rahool_comments": "rahool_comments_at",
      "prashant_comments": "prashant_comments_at",
      "demand_team_comments": "demand_team_comments_at",
    };

    const tsCol = COMMENT_TS[field];
    let query, params;
    if (field === "followup_date") {
      // Fetch existing followup_dates array
      const existing = await sql`SELECT followup_dates FROM properties WHERE uid = ${uid}`;
      let dates = [];
      if (existing.length > 0 && existing[0].followup_dates) {
        dates = typeof existing[0].followup_dates === "string" ? JSON.parse(existing[0].followup_dates) : existing[0].followup_dates;
        if (!Array.isArray(dates)) dates = [];
      }
      const now = Date.now();
      const newEntry = { date: value || "", set_by: user.email, set_at: new Date().toISOString() };

      // Mis-click protection: if last entry was < 8s ago, REPLACE instead of append
      if (dates.length > 0) {
        const lastAt = new Date(dates[dates.length - 1].set_at).getTime();
        if (!isNaN(lastAt) && (now - lastAt) < 8000) {
          dates[dates.length - 1] = newEntry;
        } else {
          dates.push(newEntry);
        }
      } else {
        dates.push(newEntry);
      }
      query = `UPDATE properties SET followup_dates = $1::jsonb WHERE uid = $2 RETURNING uid`;
      params = [JSON.stringify(dates), uid];
    } else if (tsCol) {
      query = `UPDATE properties SET ${field} = $1, ${tsCol} = NOW() WHERE uid = $2 RETURNING uid`;
      params = [value || "", uid];
    } else if (field === "status_override") {
      const refunded = (value === "Cancelled Post Token");
      query = `UPDATE properties SET status_override = $1, is_token_refunded = $2 WHERE uid = $3 RETURNING uid`;
      params = [value || "", refunded, uid];
    } else {
      query = `UPDATE properties SET ${field} = $1 WHERE uid = $2 RETURNING uid`;
      params = [value || "", uid];
    }
    const result = await sql(query, params);

    if (result.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Log after successful update (fire-and-forget)
    if (LOGGED_FIELDS[field] && oldValue !== (value || "")) {
      const meta = LOGGED_FIELDS[field];
      logActivity(sql, {
        uid, action: meta.action, category: meta.category,
        actor_email: user.email, actor_name: user.name || user.email,
        details: { field: meta.field, old: oldValue, new: value || "", source: "supply_dashboard", timestamp_ist: getIST() }
      });
    }

    return res.status(200).json({ success: true, uid, field, value });
  } catch (err) {
    console.error("Error updating property:", err);
    return res.status(500).json({ error: "Failed to update property" });
  }
};