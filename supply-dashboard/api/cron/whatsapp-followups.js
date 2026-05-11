const { getDB } = require("../_db");

// Templates (Interakt template names)
const TEMPLATES = {
  morning: "supply_tracker_auto_reminder",
  evening: "supply_tracker_pending_message",
};

function logActivity(sql, { uid, action, category, actor_email, actor_name, details }) {
  return sql`INSERT INTO activity_logs (uid, action, category, actor_email, actor_name, details, dashboard)
      VALUES (${uid}, ${action}, ${category}, ${actor_email || ""}, ${actor_name || ""}, ${JSON.stringify(details)}, ${"Supply Dashboard"})
  `.catch(err => console.error("Activity log failed:", err.message));
}

// Returns true if datestr (ISO/YYYY-MM-DD) is today (IST) or earlier
function isTodayOrBeforeIST(datestr) {
  if (!datestr) return false;
  const d = new Date(datestr);
  if (isNaN(d.getTime())) return false;
  // IST end-of-today in UTC = today's midnight IST + 24h
  // Easier: compare YYYY-MM-DD strings in IST
  const dIST = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  const dStr = dIST.toISOString().slice(0, 10);
  const nowStr = nowIST.toISOString().slice(0, 10);
  return dStr <= nowStr;
}

// Returns true if datestr (timestamp) is today (IST)
function isTodayIST(datestr) {
  if (!datestr) return false;
  const d = new Date(datestr);
  if (isNaN(d.getTime())) return false;
  const dIST = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  return dIST.toISOString().slice(0, 10) === nowIST.toISOString().slice(0, 10);
}

// Returns the latest followup date string from a JSONB array
function getLatestFollowupDate(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr[arr.length - 1].date || "";
}

// Phone normalization: Interakt expects E.164 format like 919812345678 (no +)
// Strips spaces, dashes, +. Prepends 91 if 10 digits without country code.
function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d]/g, "");
  if (p.length === 10) p = "91" + p;
  if (p.length === 12 && p.startsWith("91")) return p;
  if (p.length === 11 && p.startsWith("0")) return "91" + p.slice(1);
  return null; // unrecognized format
}

// Send a WhatsApp via Interakt
async function sendInteraktMessage({ phone, templateName, bodyValues }) {
  const apiKey = process.env.INTERAKT_API_KEY;
  if (!apiKey) throw new Error("INTERAKT_API_KEY not set");

  const payload = {
    countryCode: "+91",
    phoneNumber: phone.startsWith("91") ? phone.slice(2) : phone,
    callbackData: "supply_tracker_followup",
    type: "Template",
    template: {
      name: templateName,
      languageCode: "en",
      bodyValues: bodyValues,
    },
  };

  const res = await fetch("https://api.interakt.ai/v1/public/message/", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, body: parsed };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // ── Auth ──
  // Vercel Cron sends a Bearer token matching CRON_SECRET env var
  // Also allow manual trigger via ?secret= for testing
  const authHeader = req.headers["authorization"] || "";
  const expected = process.env.CRON_SECRET;
  const providedHeader = authHeader.replace(/^Bearer\s+/i, "");
  const providedQuery = req.query.secret;
  if (!expected) {
    return res.status(500).json({ error: "CRON_SECRET not configured" });
  }
  if (providedHeader !== expected && providedQuery !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const type = (req.query.type || "morning").toLowerCase();
  if (!TEMPLATES[type]) {
    return res.status(400).json({ error: "Invalid type. Use 'morning' or 'evening'" });
  }
  const templateName = TEMPLATES[type];
  const dryRun = req.query.dry === "1" || req.query.dry === "true";

  const sql = getDB();

  try {
    // ── 1. Fetch all properties (live + legacy edits merged manually for legacy if needed) ──
    // For cron purposes, we only need live properties with assigned_by + followup_dates + closure_team_comments_at
    // Legacy followup edits live in legacy_edits table — fetch those separately
    const liveRows = await sql`
      SELECT uid, assigned_by, followup_dates, closure_team_comments_at
      FROM properties
      WHERE assigned_by IS NOT NULL AND assigned_by != ''
    `;

    const legacyEdits = await sql`
      SELECT uid, field, value, updated_at
      FROM legacy_edits
      WHERE field IN ('followup_dates', 'closure_team_comments', 'assigned_by')
    `;

    // Build legacy property objects from edits
    const legacyMap = {};
    legacyEdits.forEach(row => {
      if (!row.uid.startsWith("LEGACY-")) return;
      if (!legacyMap[row.uid]) legacyMap[row.uid] = { uid: row.uid };
      if (row.field === "assigned_by") legacyMap[row.uid].assigned_by = row.value;
      if (row.field === "followup_dates") {
        try { legacyMap[row.uid].followup_dates = JSON.parse(row.value); } catch { legacyMap[row.uid].followup_dates = []; }
      }
      if (row.field === "closure_team_comments") {
        legacyMap[row.uid].closure_team_comments_at = row.updated_at;
      }
    });
    const legacyRows = Object.values(legacyMap).filter(r => r.assigned_by);

    const allRows = [...liveRows, ...legacyRows];

    // ── 2. Filter to follow-up rows (latest followup <= today AND closure_team_comments_at NOT today) ──
    const followups = allRows.filter(p => {
      const latest = getLatestFollowupDate(p.followup_dates);
      if (!isTodayOrBeforeIST(latest)) return false;
      if (isTodayIST(p.closure_team_comments_at)) return false; // commented today → skip
      return true;
    });

    // ── 3. Group by POC name ──
    const byPoc = {};
    followups.forEach(p => {
      const poc = (p.assigned_by || "").trim();
      if (!poc) return;
      if (!byPoc[poc]) byPoc[poc] = { count: 0, uids: [] };
      byPoc[poc].count++;
      byPoc[poc].uids.push(p.uid);
    });

    // Optional: restrict to a single POC (for testing) via ?poc=Name
    const pocFilter = (req.query.poc || "").trim();
    if (pocFilter) {
      Object.keys(byPoc).forEach(name => {
        if (name.toLowerCase() !== pocFilter.toLowerCase()) delete byPoc[name];
      });
    }

    if (Object.keys(byPoc).length === 0) {
      return res.status(200).json({ ok: true, message: "No follow-ups today", sent: 0, type });
    }

    // ── 4. Look up phone numbers from `users` table (by name, fallback email) ──
    // Build a name → phone map. POC names are display names like "Sahaj Dureja"
    // Users table assumed to have: name, email, phone
    const userRows = await sql`SELECT name, email, phone FROM users WHERE phone IS NOT NULL AND phone != ''`;
    const phoneByName = {};
    const phoneByEmail = {};
    userRows.forEach(u => {
      const name = (u.name || "").trim().toLowerCase();
      const email = (u.email || "").trim().toLowerCase();
      if (name) phoneByName[name] = u.phone;
      // First-word match for "Sahaj" → "Sahaj Dureja"
      const first = name.split(" ")[0];
      if (first && !phoneByName[first]) phoneByName[first] = u.phone;
      if (email) phoneByEmail[email] = u.phone;
    });

    // ── 5. Send WhatsApp per POC ──
    const results = [];
    for (const [pocName, info] of Object.entries(byPoc)) {
      const pocKey = pocName.toLowerCase();
      const firstWord = pocKey.split(" ")[0];
      let rawPhone = phoneByName[pocKey] || phoneByName[firstWord] || phoneByEmail[pocKey];

      if (!rawPhone) {
        results.push({ poc: pocName, count: info.count, status: "skipped_no_phone" });
        continue;
      }

      const phone = normalizePhone(rawPhone);
      if (!phone) {
        results.push({ poc: pocName, count: info.count, status: "skipped_bad_phone", raw: rawPhone });
        continue;
      }

      const bodyValues = [pocName, String(info.count)];

      if (dryRun) {
        results.push({ poc: pocName, phone, count: info.count, status: "dry_run", bodyValues });
        continue;
      }

      try {
        const send = await sendInteraktMessage({ phone, templateName, bodyValues });
        const status = send.ok ? "sent" : "failed";
        results.push({ poc: pocName, phone, count: info.count, status, response: send.body });

        // Log to activity_logs — use first UID as anchor, list all in details.uids
        await logActivity(sql, {
          uid: info.uids[0],
          action: "whatsapp_followup_reminder",
          category: "whatsapp",
          actor_email: "system@openhouse.in",
          actor_name: "Auto Reminder Bot",
          details: {
            template: templateName,
            type,
            poc: pocName,
            phone,
            count: info.count,
            uids: info.uids,
            recipients: [{ name: pocName, phone, ok: !send.ok }], // matches existing whatsapp log shape
            interakt_status: send.status,
          },
        });
      } catch (err) {
        results.push({ poc: pocName, phone, count: info.count, status: "error", error: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      type,
      template: templateName,
      total_followup_rows: followups.length,
      poc_count: Object.keys(byPoc).length,
      results,
    });
  } catch (err) {
    console.error("WhatsApp cron error:", err);
    return res.status(500).json({ error: err.message });
  }
};