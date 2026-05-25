const { getDB } = require("./_db");
const { getSubmissionsDB } = require("./_submissions-db");

// Push one cp_inventory_status row to the external `submissions` table.
// Only valid_cp_id = true rows are eligible.
// Match key: submissions.forms_uid = cp_inventory_status.uid (= properties.uid).
// Returns the number of submissions rows updated (0 if no matching forms_uid).
async function syncOne(uid) {
  const sql = getDB();
  const rows = await sql`
    SELECT supply_status, cp_status
    FROM cp_inventory_status
    WHERE uid = ${uid} AND valid_cp_id = true
  `;
  if (rows.length === 0) return 0;
  const r = rows[0];
  const subSql = getSubmissionsDB();
  const result = await subSql`
    UPDATE submissions
    SET status = ${r.cp_status || ""}, status_reason = ${r.supply_status || ""}
    WHERE forms_uid = ${uid}
    RETURNING forms_uid
  `;
  return result.length;
}

// Push every valid_cp_id row to the external `submissions` table.
// Returns { eligible, matched } — eligible = cp_inventory_status rows
// considered; matched = submissions rows actually updated.
async function syncAll() {
  const sql = getDB();
  const rows = await sql`
    SELECT uid, supply_status, cp_status
    FROM cp_inventory_status
    WHERE valid_cp_id = true
  `;
  if (rows.length === 0) return { eligible: 0, matched: 0 };
  const subSql = getSubmissionsDB();

  // Push in batches via a single UPDATE … FROM (VALUES …) per batch to keep
  // round-trips low. Casts on the first row let Postgres infer the rest.
  const BATCH = 200;
  let matched = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const placeholders = slice.map((_, idx) => {
      const o = idx * 3;
      return idx === 0
        ? `($${o + 1}::text, $${o + 2}::text, $${o + 3}::text)`
        : `($${o + 1}, $${o + 2}, $${o + 3})`;
    }).join(",");
    const params = [];
    slice.forEach(r => params.push(r.uid, r.cp_status || "", r.supply_status || ""));
    const query = `
      UPDATE submissions s
      SET status = v.status, status_reason = v.reason
      FROM (VALUES ${placeholders}) AS v(forms_uid, status, reason)
      WHERE s.forms_uid = v.forms_uid
      RETURNING s.forms_uid
    `;
    const result = await subSql(query, params);
    matched += result.length;
  }
  return { eligible: rows.length, matched };
}

module.exports = { syncOne, syncAll };
