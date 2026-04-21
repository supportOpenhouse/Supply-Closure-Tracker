const { getDB } = require("../_db");
const { requireAdmin } = require("../_auth");

const EDITABLE_FIELDS = [
  "society_name", "locality", "tower_no", "unit_no", "configuration",
  "demand_price", "area_sqft", "floor", "source", "exit_facing",
  "first_name", "last_name", "contact_no", "assigned_by", "field_exec",
  "bathrooms", "balconies", "parking", "furnishing",
  "registry_status", "occupancy_status", "video_link",
  "guaranteed_sale_price", "performance_guarantee",
  "initial_period", "grace_period", "outstanding_loan", "bank_name_loan",
  "exit_compass_image", "balcony_details"
];

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const { uid, updates } = req.body;
    if (!uid || !updates || typeof updates !== "object") {
      return res.status(400).json({ error: "uid and updates object required" });
    }

    const sql = getDB();

    // Legacy rows → save each field to legacy_edits table
    if (uid.startsWith("LEGACY-")) {
      let count = 0;
      for (const [field, value] of Object.entries(updates)) {
        // Allow any field for legacy (we map JS keys to themselves)
        const val = typeof value === "object" ? JSON.stringify(value) : (value || "");
        await sql`
          INSERT INTO legacy_edits (uid, field, value, updated_at)
          VALUES (${uid}, ${field}, ${val}, NOW())
          ON CONFLICT (uid, field) DO UPDATE SET value = ${val}, updated_at = NOW()
        `;
        count++;
      }
      return res.status(200).json({ success: true, uid, fieldsUpdated: count });
    }

    // Live rows → update properties table
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (EDITABLE_FIELDS.includes(field)) {
        const val = typeof value === "object" ? JSON.stringify(value) : (value || "");
        setClauses.push(`${field} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    values.push(uid);
    const query = `UPDATE properties SET ${setClauses.join(", ")} WHERE uid = $${paramIdx} RETURNING uid`;
    const result = await sql(query, values);

    if (result.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    return res.status(200).json({ success: true, uid });
  } catch (err) {
    console.error("Edit property error:", err);
    return res.status(500).json({ error: "Failed to update property" });
  }
};
