const { getDB } = require("./_db");
const { requireAuth } = require("./_auth");

// One notes thread per lead (property_notes). There is no autosave: a note is
// only written when the user presses Send / Enter.
//
// GET   /api/notes?uid=X          → the lead's notes, oldest first
// POST  /api/notes { uid, note }  → appends one note, returns it
// PATCH /api/notes { id, note }   → edits a note; only its author (matched by
//                                    login email, any role) may edit it
const CAN_POST = ["admin", "manager", "commenter"];

function getIST() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  const sql = getDB();

  if (req.method === "GET") {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: "uid is required" });
    const notes = await sql`
      SELECT id, kind, note_date, note, author_name, author_email, source, author_source, created_at, updated_at
      FROM property_notes
      WHERE uid = ${uid} AND deleted_at IS NULL
      ORDER BY created_at, id`;
    return res.status(200).json(notes);
  }

  if (req.method === "POST") {
    if (!CAN_POST.includes(user.role)) return res.status(403).json({ error: "Your role cannot add notes" });
    const uid = (req.body || {}).uid;
    const note = String((req.body || {}).note || "").trim();
    if (!uid) return res.status(400).json({ error: "uid is required" });
    if (!note) return res.status(400).json({ error: "Note is empty" });

    const authorName = user.dbName || user.name || user.email;
    const [row] = await sql`
      INSERT INTO property_notes (uid, note_date, note, author_email, author_name, source)
      VALUES (${uid}, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, ${note}, ${user.email}, ${authorName}, 'dashboard')
      RETURNING id, kind, note_date, note, author_name, author_email, source, author_source, created_at, updated_at`;

    // poc_comments_at drives the follow-up-pending highlight and the WhatsApp
    // reminder cron ("has the closure team caught up?"). A note counts as the
    // closure team's when it comes from a commenter (POC role) or the lead's own
    // POC — same as the old POC Comments box, which managers' notes didn't touch.
    const pocTouch = user.role === "commenter";
    if (uid.startsWith("LEGACY-")) {
      if (pocTouch) {
        await sql`
          INSERT INTO legacy_edits (uid, field, value, updated_at) VALUES (${uid}, 'poc_comments', '', NOW())
          ON CONFLICT (uid, field) DO UPDATE SET updated_at = NOW()`;
      }
    } else {
      await sql`
        UPDATE properties SET poc_comments_at = NOW()
        WHERE uid = ${uid} AND (${pocTouch} OR LOWER(BTRIM(assigned_by)) = LOWER(BTRIM(${authorName})))`;
    }

    sql`INSERT INTO activity_logs (uid, action, category, actor_email, actor_name, details, dashboard)
        VALUES (${uid}, ${"note_added"}, ${"comment"}, ${user.email}, ${authorName},
                ${JSON.stringify({ field: "notes", old: "", new: note, note_id: row.id, source: "supply_dashboard", timestamp_ist: getIST() })},
                ${"Supply Dashboard"})`
      .catch(err => console.error("Activity log failed:", err.message));

    return res.status(200).json(row);
  }

  if (req.method === "PATCH") {
    const id = (req.body || {}).id;
    const note = String((req.body || {}).note || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    if (!note) return res.status(400).json({ error: "Note is empty" });

    const [cur] = await sql`SELECT uid, note, author_email FROM property_notes WHERE id = ${id} AND deleted_at IS NULL`;
    if (!cur) return res.status(404).json({ error: "Note not found" });
    // Ownership is by login email. Imported notes carry no email, so they aren't editable.
    if (!cur.author_email || cur.author_email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ error: "You can only edit your own notes" });
    }
    if (cur.note === note) {
      const [same] = await sql`SELECT id, kind, note_date, note, author_name, author_email, source, author_source, created_at, updated_at FROM property_notes WHERE id = ${id}`;
      return res.status(200).json(same);
    }

    const [row] = await sql`
      UPDATE property_notes SET note = ${note}, updated_at = NOW() WHERE id = ${id}
      RETURNING id, kind, note_date, note, author_name, author_email, source, author_source, created_at, updated_at`;

    sql`INSERT INTO activity_logs (uid, action, category, actor_email, actor_name, details, dashboard)
        VALUES (${cur.uid}, ${"note_edited"}, ${"comment"}, ${user.email}, ${user.dbName || user.name || user.email},
                ${JSON.stringify({ field: "notes", old: cur.note, new: note, note_id: row.id, source: "supply_dashboard", timestamp_ist: getIST() })},
                ${"Supply Dashboard"})`
      .catch(err => console.error("Activity log failed:", err.message));

    return res.status(200).json(row);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
