const { getDB } = require("./_db");
const { requireAdmin } = require("./_auth");

// Bulk followup date setter (admin-only). The client chunks the filtered uid
// list into requests of ≤MAX_UIDS so each invocation stays well inside the
// serverless time limit and the UI can show real progress between chunks.
const MAX_UIDS = 50;

// IST timestamp
function getIST() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const { uids, date } = req.body || {};

    if (!Array.isArray(uids) || uids.length === 0) {
      return res.status(400).json({ error: "uids array is required" });
    }
    if (uids.length > MAX_UIDS) {
      return res.status(400).json({ error: "Max " + MAX_UIDS + " uids per request" });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const sql = getDB();
    // Same entry shape as single edits in api/update.js — the WhatsApp
    // followup cron and the dashboard both read the latest entry's .date.
    const entry = { date, set_by: user.email, set_at: new Date().toISOString() };

    const cleanUids = uids.filter(u => typeof u === "string" && u);
    const liveUids = cleanUids.filter(u => !u.startsWith("LEGACY-"));
    const legacyUids = cleanUids.filter(u => u.startsWith("LEGACY-"));
    const updatedUids = [];

    // Live rows: one statement appends the entry to every row's history.
    // No 8s mis-click replace window here — bulk goes through a confirm dialog.
    if (liveUids.length > 0) {
      const rows = await sql(
        `UPDATE properties
         SET followup_dates = COALESCE(followup_dates, '[]'::jsonb) || jsonb_build_array($1::jsonb)
         WHERE uid = ANY($2::text[])
         RETURNING uid`,
        [JSON.stringify(entry), liveUids]
      );
      rows.forEach(r => updatedUids.push(r.uid));
    }

    // Legacy rows: history lives as JSON under legacy_edits/'followup_dates'.
    for (const uid of legacyUids) {
      let dates = [];
      try {
        const existing = await sql`SELECT value FROM legacy_edits WHERE uid = ${uid} AND field = 'followup_dates'`;
        if (existing.length > 0) {
          try { dates = JSON.parse(existing[0].value); if (!Array.isArray(dates)) dates = []; } catch { dates = []; }
        }
      } catch {}
      dates.push(entry);
      await sql`
        INSERT INTO legacy_edits (uid, field, value, updated_at)
        VALUES (${uid}, ${'followup_dates'}, ${JSON.stringify(dates)}, NOW())
        ON CONFLICT (uid, field) DO UPDATE SET value = ${JSON.stringify(dates)}, updated_at = NOW()
      `;
      updatedUids.push(uid);
    }

    // One activity log row per updated lead, same action as single edits so
    // logs.html shows them uniformly; source marks them as a bulk change.
    if (updatedUids.length > 0) {
      const details = JSON.stringify({ field: "followup_date", old: "", new: date, source: "supply_dashboard_bulk", timestamp_ist: getIST() });
      await sql(
        `INSERT INTO activity_logs (uid, action, category, actor_email, actor_name, details, dashboard)
         SELECT u, 'followup_date_changed', 'date', $2, $3, $4::jsonb, 'Supply Dashboard'
         FROM unnest($1::text[]) AS u`,
        [updatedUids, user.email, user.name || user.email, details]
      ).catch(err => console.error("Bulk activity log failed:", err.message));
    }

    return res.status(200).json({ success: true, updated: updatedUids.length });
  } catch (err) {
    console.error("Error bulk updating followup dates:", err);
    return res.status(500).json({ error: "Failed to bulk update followup dates" });
  }
};
