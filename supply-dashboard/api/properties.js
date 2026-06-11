const { getDB } = require("./_db");
const { requireAuth, nameFromEmail } = require("./_auth");

// ── Legacy data from Google Sheet (cached in memory) ──
let legacyCache = { data: [], fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getLegacyData() {
  const now = Date.now();
  // Return cache if fresh
  if (legacyCache.data.length > 0 && (now - legacyCache.fetchedAt) < CACHE_TTL) {
    return legacyCache.data;
  }

  const sheetUrl = process.env.LEGACY_SHEET_URL;
  if (!sheetUrl) {
    // Fallback: try loading JSON file if it exists
    try { return require("./_legacy.json"); } catch { return []; }
  }

  try {
    const res = await fetch(sheetUrl);
    if (!res.ok) throw new Error("Sheet fetch failed: " + res.status);
    const rows = await res.json();

    // Normalize: ensure arrays and boolean fields. Also alias the renamed
    // comment keys so legacy rows still emitted under the old names surface
    // under the new ones the dashboard reads.
    const normalized = rows.map(r => ({
      ...r,
      isLegacy: true,
      balconyDetails: parseJson(r.balconyDetails),
      documentsAvailable: parseJson(r.documentsAvailable),
      furnishingDetails: parseJson(r.furnishingDetails),
      pocComments: r.pocComments || r.closureTeamComments || "",
      managerComments: r.managerComments || r.demandTeamComments || "",
    }));

    legacyCache = { data: normalized, fetchedAt: now };
    console.log("Legacy sheet: loaded " + normalized.length + " rows");
    return normalized;
  } catch (err) {
    console.error("Legacy sheet fetch error:", err.message);
    // Return stale cache if available, else try JSON fallback
    if (legacyCache.data.length > 0) return legacyCache.data;
    try { return require("./_legacy.json"); } catch { return []; }
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const sql = getDB();

    // Step 1: Get live properties from Neon
    const rows = await sql`
      SELECT 
        uid, source, demand_price,
        first_name, last_name, owner_broker_name,
        contact_no, city, locality, society_name, unit_no, floor, tower_no,
        configuration, area_sqft, bathrooms, balconies, gas_pipeline,
        parking, furnishing, furnishing_details, exit_facing,
        video_link, registry_status, occupancy_status,
        guaranteed_sale_price, performance_guarantee,
        initial_period, grace_period, outstanding_loan, bank_name_loan,
        field_exec, assigned_by, token_requested_by,
        schedule_date, schedule_submitted_at, lead_id, visit_submitted_at, token_submitted_at,
        token_deal_submitted_at, final_submitted_at, listing_submitted_at,
        cp_bill_submitted_at, pending_request_submitted_at, ama_submitted_at,
        deal_token_amount, remaining_amount,
        balcony_details, additional_images,
        exit_compass_image, documents_available,
        status_override, status_override_at,
        offer_price, property_score, price_score, supply_dash_brokerage, poc_comments, rahool_comments,
        prashant_comments, manager_comments,
        poc_comments_at, rahool_comments_at,
        prashant_comments_at, manager_comments_at,
        key_handover_date, token_remarks, is_token_refunded, followup_dates, is_high_priority
      FROM properties
      WHERE (is_dead IS NULL OR is_dead = false)
      ORDER BY created_at DESC
    `;

    const liveProperties = rows.map(transformRow);

    // Step 2: Load legacy data from Google Sheet + apply edits from DB
    const legacyData = await getLegacyData();
    let legacyWithEdits = legacyData.map(r => ({...r})); // shallow copy
    try {
      const edits = await sql`SELECT uid, field, value, updated_at FROM legacy_edits`;
      const editMap = {}; // uid -> { field: {value, updated_at} }
      edits.forEach(e => {
        if (!editMap[e.uid]) editMap[e.uid] = {};
        editMap[e.uid][e.field] = { value: e.value, updated_at: e.updated_at };
      });
      const FIELD_TO_KEY = {
        "status_override": "statusOverride",
        "offer_price": "offerPrice",
        "property_score": "propertyScore",
        "price_score": "priceScore",
        "supply_dash_brokerage": "supplyDashBrokerage",
        "poc_comments": "pocComments",
        "rahool_comments": "rahoolComments",
        "prashant_comments": "prashantComments",
        "manager_comments": "managerComments",
        // Property fields (from edit modal)
        "society_name": "society",
        "locality": "locality",
        "tower_no": "towerNo",
        "unit_no": "unitNo",
        "configuration": "configuration",
        "demand_price": "demandPrice",
        "area_sqft": "areaSqft",
        "floor": "floor",
        "source": "source",
        "exit_facing": "exitFacing",
        "first_name": "ownerName",
        "contact_no": "contactNo",
        "assigned_by": "assignedBy",
        "field_exec": "fieldExec",
        "bathrooms": "bathrooms",
        "balconies": "balconies",
        "parking": "parking",
        "furnishing": "furnishing",
        "registry_status": "registryStatus",
        "occupancy_status": "occupancyStatus",
        "video_link": "videoLink",
        "guaranteed_sale_price": "guaranteedSalePrice",
        "performance_guarantee": "performanceGuarantee",
        "initial_period": "initialPeriod",
        "grace_period": "gracePeriod",
        "outstanding_loan": "outstandingLoan",
        "bank_name_loan": "bankNameLoan",
        "exit_compass_image": "exitCompassImage",
        "balcony_details": "balconyDetails",
        "followup_dates": "followupDates",
        "is_high_priority": "isHighPriority",
      };
      const COMMENT_TS_MAP = {
        "poc_comments": "pocCommentsAt",
        "rahool_comments": "rahoolCommentsAt",
        "prashant_comments": "prashantCommentsAt",
        "manager_comments": "managerCommentsAt",
        "status_override": "statusOverrideAt",
      };
      legacyWithEdits.forEach(p => {
        const saved = editMap[p.uid];
        if (!saved) return;
        Object.entries(saved).forEach(([dbField, obj]) => {
          const jsKey = FIELD_TO_KEY[dbField];
          if (jsKey) {
            // Try parsing JSON for array fields
            if (jsKey === "balconyDetails" || jsKey === "followupDates") {
              try { p[jsKey] = JSON.parse(obj.value); } catch { p[jsKey] = []; }
            } else if (jsKey === "isHighPriority") {
              p[jsKey] = obj.value === "true" || obj.value === true;
            } else {
              p[jsKey] = obj.value;
            }
          }
          const tsKey = COMMENT_TS_MAP[dbField];
          if (tsKey && obj.updated_at) p[tsKey] = obj.updated_at;
        });
      });
    } catch {}

    // Step 3: Merge live + legacy
    const allProperties = [...liveProperties, ...legacyWithEdits];

    // Step 3.5: Join with master_societies on society name to flag whether the
    // society is "affordable". Unmatched societies default to false (No).
    try {
      const societyRows = await sql`SELECT society_name, affordable FROM master_societies`;
      const affordableMap = new Map();
      const normSociety = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
      societyRows.forEach(s => {
        const key = normSociety(s.society_name);
        if (key) affordableMap.set(key, s.affordable === true);
      });
      allProperties.forEach(p => {
        const key = normSociety(p.society);
        p.affordable = (key && affordableMap.has(key)) ? affordableMap.get(key) : false;
      });
    } catch (err) {
      console.error("master_societies join failed:", err.message);
    }

    // Step 4: Visibility filter
    if (user.role === "admin") {
      return res.status(200).json(allProperties);
    }

    const userEmail = user.email.toLowerCase();
    // Own name: prefer dashboard_users.name, fall back to email-derived.
    const ownName = (user.dbName || nameFromEmail(userEmail) || "").trim();

    // Managed team: look up the dashboard user's name in `users.name` and read
    // `users.managed_team` (JSONB/text array of employee display names).
    let managedNames = [];
    if (ownName) {
      try {
        const rows = await sql`SELECT managed_team FROM users WHERE LOWER(name) = ${ownName.toLowerCase()} LIMIT 1`;
        if (rows.length > 0 && rows[0].managed_team) {
          const raw = rows[0].managed_team;
          const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : []);
          managedNames = arr.map(n => (n || "").trim().toLowerCase()).filter(Boolean);
        }
      } catch (err) {
        console.error("users.managed_team lookup failed:", err.message);
      }
    }

    const ownNames = ownName ? [ownName.toLowerCase()] : [];
    const overrides = [];
    // "Test Sahaj" is a legacy POC label that belongs to Sahaj Dureja.
    if ((user.role === "viewer" || user.role === "commenter" || user.role === "manager") &&
        userEmail === "sahaj.dureja@openhouse.in") {
      overrides.push("test sahaj");
    }

    if (ownNames.length === 0 && managedNames.length === 0 && overrides.length === 0) {
      return res.status(200).json([]);
    }

    const matchesName = (target, name) => {
      if (!target || !name) return false;
      if (target === name || target.includes(name)) return true;
      const tns = target.replace(/\s+/g, "");
      const nns = name.replace(/\s+/g, "");
      return tns === nns || tns.includes(nns);
    };

    const filtered = allProperties.filter(r => {
      const poc = (r.assignedBy || "").toLowerCase();
      const exec = (r.fieldExec || "").toLowerCase();
      // Own + overrides: assigned_by only.
      for (const n of ownNames) { if (matchesName(poc, n)) return true; }
      for (const n of overrides) { if (matchesName(poc, n)) return true; }
      // Managed team: assigned_by + field_exec.
      for (const n of managedNames) { if (matchesName(poc, n) || matchesName(exec, n)) return true; }
      return false;
    });

    return res.status(200).json(filtered);
  } catch (err) {
    console.error("Error fetching properties:", err);
    return res.status(500).json({ error: "Failed to fetch properties: " + err.message });
  }
};

function parseJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function transformRow(r) {
  const ownerName =
    [r.first_name, r.last_name].filter(Boolean).join(" ") ||
    r.owner_broker_name ||
    "";

  return {
    uid: r.uid,
    isLegacy: false,
    source: r.source || "",
    demandPrice: r.demand_price || "",
    ownerName,
    contactNo: r.contact_no || "",
    city: r.city || "",
    locality: r.locality || "",
    society: r.society_name || "",
    unitNo: r.unit_no || "",
    floor: r.floor || "",
    towerNo: r.tower_no || "",
    configuration: r.configuration || "",
    areaSqft: r.area_sqft || "",
    bathrooms: r.bathrooms || "",
    balconies: r.balconies || "",
    gasPipeline: r.gas_pipeline || "",
    parking: r.parking || "",
    furnishing: r.furnishing || "",
    furnishingDetails: parseJson(r.furnishing_details),
    exitFacing: r.exit_facing || "",
    videoLink: r.video_link || "",
    registryStatus: r.registry_status || "",
    occupancyStatus: r.occupancy_status || "",
    guaranteedSalePrice: r.guaranteed_sale_price || "",
    performanceGuarantee: r.performance_guarantee || "",
    initialPeriod: r.initial_period || "",
    gracePeriod: r.grace_period || "",
    outstandingLoan: r.outstanding_loan || "",
    bankNameLoan: r.bank_name_loan || "",
    fieldExec: r.field_exec || "",
    assignedBy: r.assigned_by || "",
    tokenRequestedBy: r.token_requested_by || "",
    scheduleDate: r.schedule_date || "",
    scheduleSubmittedAt: r.schedule_submitted_at || "",
    leadId: r.lead_id || "",
    visitSubmittedAt: r.visit_submitted_at || "",
    tokenSubmittedAt: r.token_submitted_at || "",
    tokenDealSubmittedAt: r.token_deal_submitted_at || "",
    finalSubmittedAt: r.final_submitted_at || "",
    listingSubmittedAt: r.listing_submitted_at || "",
    cpBillSubmittedAt: r.cp_bill_submitted_at || "",
    pendingRequestSubmittedAt: r.pending_request_submitted_at || "",
    amaSubmittedAt: r.ama_submitted_at || "",
    dealTokenAmount: r.deal_token_amount || "",
    remainingAmount: r.remaining_amount || "",
    balconyDetails: parseJson(r.balcony_details),
    exitCompassImage: r.exit_compass_image || "",
    documentsAvailable: parseJson(r.documents_available),
    statusOverride: r.status_override || "",
    statusOverrideAt: r.status_override_at || "",
    offerPrice: r.offer_price || "",
    propertyScore: r.property_score || "",
    priceScore: r.price_score || "",
    supplyDashBrokerage: r.supply_dash_brokerage || "",
    pocComments: r.poc_comments || "",
    rahoolComments: r.rahool_comments || "",
    prashantComments: r.prashant_comments || "",
    managerComments: r.manager_comments || "",
    pocCommentsAt: r.poc_comments_at || "",
    rahoolCommentsAt: r.rahool_comments_at || "",
    prashantCommentsAt: r.prashant_comments_at || "",
    managerCommentsAt: r.manager_comments_at || "",
    keysHandoverDate: r.key_handover_date || "",
    tokenRemarks: r.token_remarks || "",
    isTokenRefunded: r.is_token_refunded || false,
    isHighPriority: r.is_high_priority || false,
    followupDates: parseJson(r.followup_dates),
  };
}