const { getDB } = require("./_db");
const { requireAuth } = require("./_auth");

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

    // Normalize: ensure arrays and boolean fields
    const normalized = rows.map(r => ({
      ...r,
      isLegacy: true,
      balconyDetails: parseJson(r.balconyDetails),
      documentsAvailable: parseJson(r.documentsAvailable),
      furnishingDetails: parseJson(r.furnishingDetails),
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
        status_override, offer_price, supply_dash_brokerage, closure_team_comments, rahool_comments,
        prashant_comments, demand_team_comments,
        closure_team_comments_at, rahool_comments_at,
        prashant_comments_at, demand_team_comments_at,
        key_handover_date, token_remarks, is_token_refunded, followup_dates
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
        "supply_dash_brokerage": "supplyDashBrokerage",
        "closure_team_comments": "closureTeamComments",
        "rahool_comments": "rahoolComments",
        "prashant_comments": "prashantComments",
        "demand_team_comments": "demandTeamComments",
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
      };
      const COMMENT_TS_MAP = {
        "closure_team_comments": "closureTeamCommentsAt",
        "rahool_comments": "rahoolCommentsAt",
        "prashant_comments": "prashantCommentsAt",
        "demand_team_comments": "demandTeamCommentsAt",
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

    // Step 4: Load team directory for name normalization + visibility
    let teamRows = [];
    try {
      teamRows = await sql`SELECT email, display_name, manager_email FROM team_directory WHERE is_active = true`;
    } catch (teamErr) {
      console.error("team_directory query failed:", teamErr.message);
    }

    // Step 5: Normalize POC names (must match client-side POC_NAME_MAP exactly)
    const POC_NAME_MAP = {
      "abhishek": "Abhishek Rathore",
      "animesh": "Animesh Singh",
      "apurv": "Apurv Nath",
      "apurva": "Apurv Nath",
      "nishant": "Nishant Kumar",
      "rahulsheel": "Rahul Sheel",
      "rupali": "Rupali Prasad",
      "shashank": "Shashank Kumar",
      "sushmita": "Sushmita Roy",
      "kavita": "Kavita Rawat",
      "arti": "Arti Ahirwar",
      "sahil": "Sahil Singh",
      "nisha": "Nisha Deewan",
      "praveen": "Praveen Kumar",
      "aman": "Aman Dixit",
      "sahaj": "Sahaj Dureja",
      "saransh": "Saransh Khera",
      "saurabh": "Saurabh",
      "prashant": "Prashant",
      "rahool": "Rahool",
      "ashish": "Ashish",
      "ankit": "Ankit",
      "vaibhav": "Vaibhav Dwivedi",
      "deepak": "Deepak Mishra",
      "ashwani": "Ashwani Sharma",
      "priyesh": "Priyesh Kumar",
    };
    const POC_REMOVE = ["oh sold", "oh_sold"];

    function cleanPoc(name) {
      if (!name) return "";
      const trimmed = name.trim();
      if (POC_REMOVE.includes(trimmed.toLowerCase())) return "";
      // Handle "Shashank / Rupali" → normalize each part
      if (trimmed.includes("/")) {
        return trimmed.split("/").map(s => {
          const k = s.trim().toLowerCase().replace(/\s+/g, "");
          return POC_NAME_MAP[k] || s.trim();
        }).join(" / ");
      }
      // Try no-space match (catches "RahulSheel" → "rahulsheel")
      const noSpace = trimmed.toLowerCase().replace(/\s+/g, "");
      if (POC_NAME_MAP[noSpace]) return POC_NAME_MAP[noSpace];
      // Try lowercase match
      const lower = trimmed.toLowerCase();
      if (POC_NAME_MAP[lower]) return POC_NAME_MAP[lower];
      // Try team_directory first-name match as fallback
      if (teamRows.length > 0) {
        const match = teamRows.find(t => {
          const full = (t.display_name || "").trim();
          return full.split(" ")[0].toLowerCase() === lower && full.includes(" ");
        });
        if (match) return match.display_name.trim();
      }
      return trimmed;
    }

    allProperties.forEach(p => {
      if (p.assignedBy) p.assignedBy = cleanPoc(p.assignedBy);
      if (p.fieldExec) p.fieldExec = cleanPoc(p.fieldExec);
    });

    // Step 6: Apply visibility filtering using email → POC name mapping
    if (user.role === "admin" || user.role === "demand") {
      return res.status(200).json(allProperties);
    }

    // Email → POC display names
    const EMAIL_TO_NAMES = {
      'sahaj.dureja@openhouse.in': ['Sahaj Dureja'],
      'saransh.khera@openhouse.in': ['Saransh Khera'],
      'ashish@openhouse.in': ['Ashish'],
      'sushmita.roy@openhouse.in': ['Sushmita Roy'],
      'arti.ahirwar@openhouse.in': ['Arti Ahirwar'],
      'abhishek.rathore@openhouse.in': ['Abhishek Rathore'],
      'animesh.singh@openhouse.in': ['Animesh Singh'],
      'kavita.rawat@openhouse.in': ['Kavita Rawat'],
      'prashant@openhouse.in': ['Prashant'],
      'rahool@openhouse.in': ['Rahool'],
      'rupali.prasad@openhouse.in': ['Rupali Prasad'],
      'saurabh@openhouse.in': ['Saurabh'],
      'shashank.kumar@openhouse.in': ['Shashank Kumar'],
      'sahil.singh@openhouse.in': ['Sahil Singh'],
      'rahul.sheel@openhouse.in': ['Rahul Sheel'],
      'rahul.singh@openhouse.in': ['Rahul Singh'],
      'praveen.kumar@openhouse.in': ['Praveen Kumar'],
      'nishant.kumar@openhouse.in': ['Nishant Kumar'],
      'ankit@openhouse.in': ['Ankit'],
      'vaibhav.dwivedi@openhouse.in': ['Vaibhav Dwivedi'],
      'aman.dixit@openhouse.in': ['Aman Dixit'],
      'deepak.mishra@openhouse.in': ['Deepak Mishra'],
      'nisha.deewan@openhouse.in': ['Nisha Deewan'],
      'ashwani.sharma@openhouse.in': ['Ashwani Sharma'],
      'deepak.rana@openhouse.in': ['Deepak Rana'],
      'apurv.nath@openhouse.in': ['Apurv Nath'],
      'priyesh.kumar@openhouse.in': ['Priyesh Kumar']
    };

    // Manager email → team member display names they can also see
    const TEAMS = {
      'abhishek.rathore@openhouse.in': ['Aman Dixit','Arti Ahirwar','Kavita Rawat','Sahil Singh'],
      'animesh.singh@openhouse.in': ['Nishant Kumar','Rahul Sheel','Sushmita Roy'],
      'ashish@openhouse.in': ['Aman Dixit','Sahil Singh'],
      'shashank.kumar@openhouse.in': ['Deepak Mishra','Deepak Rana','Apurv Nath','Priyesh Kumar','Rupali Prasad'],
    };

    const userEmail = user.email.toLowerCase();

    // Build list of POC names this user can see
    const myNames = (EMAIL_TO_NAMES[userEmail] || []).map(n => n.toLowerCase());
    const teamNames = (TEAMS[userEmail] || []).map(n => n.toLowerCase());
    const visibleNames = [...new Set([...myNames, ...teamNames])];

    if (visibleNames.length === 0) {
      return res.status(200).json([]);
    }

    const filtered = allProperties.filter(r => {
      const poc = (r.assignedBy || "").toLowerCase();
      const exec = (r.fieldExec || "").toLowerCase();
      // Match against POC or field exec
      return visibleNames.some(name =>
        (poc && (poc === name || poc.includes(name))) ||
        (exec && (exec === name || exec.includes(name)))
      );
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
    offerPrice: r.offer_price || "",
    supplyDashBrokerage: r.supply_dash_brokerage || "",
    closureTeamComments: r.closure_team_comments || "",
    rahoolComments: r.rahool_comments || "",
    prashantComments: r.prashant_comments || "",
    demandTeamComments: r.demand_team_comments || "",
    closureTeamCommentsAt: r.closure_team_comments_at || "",
    rahoolCommentsAt: r.rahool_comments_at || "",
    prashantCommentsAt: r.prashant_comments_at || "",
    demandTeamCommentsAt: r.demand_team_comments_at || "",
    keysHandoverDate: r.key_handover_date || "",
    tokenRemarks: r.token_remarks || "",
    isTokenRefunded: r.is_token_refunded || false,
    followupDates: parseJson(r.followup_dates),
  };
}