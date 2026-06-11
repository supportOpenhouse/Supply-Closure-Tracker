const ALL_STATUSES = ["AMA Req","AMA Signed","Cancelled Post Token","Dead - Legal","Dead - Not Interested","Dead - Sold","Duplicacy","Followup","Future Prospect","Hold","Key Handover","Listed","Negotiation","OH Rejected","Price High","Seller Rejected","Token Requested","Token Transferred","Visit Completed","Visit Scheduled"];

// Auto-stage statuses — derived from form submissions (see getStage()).
// Users cannot manually set these; they are excluded from the change dropdown.
const AUTO_STAGE_STATUSES = ["Cancelled Post Token","Listed","Key Handover","AMA Signed","AMA Req","Token Transferred","Token Requested","Visit Completed","Visit Scheduled"];

// Statuses a user may manually pick when changing status.
const MANUAL_STATUSES = ALL_STATUSES.filter(function(s) { return AUTO_STAGE_STATUSES.indexOf(s) < 0; });

const STATUS_COLORS = {
  "Visit Scheduled":     {bg:"#64748b",text:"#fff"},
  "Visit Completed":     {bg:"#0d9488",text:"#fff"},
  "Followup":            {bg:"#ca8a04",text:"#fff"},
  "Negotiation":         {bg:"#065f46",text:"#fff"},
  "Token Requested":     {bg:"#ea580c",text:"#fff"},
  "Token Transferred":   {bg:"#1e40af",text:"#fff"},
  "AMA Req":             {bg:"#7c3aed",text:"#fff"},
  "AMA Signed":          {bg:"#15803d",text:"#fff"},
  "Key Handover":        {bg:"#10b981",text:"#fff"},
  "Listed":              {bg:"#06b6d4",text:"#fff"},
  "Future Prospect":     {bg:"#0369a1",text:"#fff"},
  "Price High":          {bg:"#be123c",text:"#fff"},
  "OH Rejected":         {bg:"#e11d48",text:"#fff"},
  "Dead - Sold":         {bg:"#9f1239",text:"#fff"},
  "Dead - Not Interested":{bg:"#881337",text:"#fff"},
  "Dead - Legal":        {bg:"#7f1d1d",text:"#fff"},
  "Duplicacy":           {bg:"#9ca3af",text:"#fff"},
  "Hold":                {bg:"#6b7280",text:"#fff"},
  "Cancelled Post Token":{bg:"#b45309",text:"#fff"},
  "Seller Rejected":     {bg:"#dc2626",text:"#fff"},
  "New":                 {bg:"#d1d5db",text:"#374151"},
};

// ── State ──
let DATA = [];
let currentUser = null; // { email, name, role }
let adminUsers = [];
let adminRequests = [];
let adminTeam = [];
let showAdminPanel = false;
let adminTab = "users"; // "users" | "team" | "bugs"
let showBugForm = false;
let bugSubmitted = false;
let adminBugs = [];
let lastRefreshed = "";
let state = {
  search: "",
  cityFilter: "All",
  statusFilter: [],
  pocFilter: [],
  sourceFilter: "All",
  affordableFilter: "All",
  dateFilter: "all", // all | yesterday | week | month | custom
  dateFrom: "",
  dateTo: "",
  followupDateFilter: [], // multi-select: today, tomorrow, week, past_due, future, none
  expandedId: null,
  modalImg: null,
  modalList: [],
  modalIndex: 0,
  page: 1,
  sortCol: null,
  sortDir: "asc",
  msOpen: null
};
const PAGE_SIZE = 50;

function canEdit() {
  return currentUser && (currentUser.role === "admin" || currentUser.role === "commenter" || currentUser.role === "manager");
}

// Debounce timers for auto-saving comments
const saveTimers = {};
const saveStatus = {}; // uid_field -> "saving"|"saved"|"error"

// Fields the user has edited locally but whose save has not yet succeeded.
// Used by silentRefresh() to preserve in-progress edits when polled data
// from the server would otherwise clobber them.
// Keys: `${uid}:${jsField}` (jsField = camelCase field on the DATA row).
const dirtyFields = new Set();

// Maps PATCH /api/update field names → camelCase field on a DATA row.
const DB_TO_JS_FIELD = {
  status_override: "statusOverride",
  offer_price: "offerPrice",
  property_score: "propertyScore",
  price_score: "priceScore",
  supply_dash_brokerage: "supplyDashBrokerage",
  poc_comments: "pocComments",
  manager_comments: "managerComments",
  rahool_comments: "rahoolComments",
  prashant_comments: "prashantComments",
  assigned_by: "assignedBy",
  followup_date: "followupDates",
  is_high_priority: "isHighPriority",
};

function markFieldDirty(uid, jsField) {
  if (uid && jsField) dirtyFields.add(uid + ":" + jsField);
}
function markFieldClean(uid, dbField) {
  const jsField = DB_TO_JS_FIELD[dbField];
  if (uid && jsField) dirtyFields.delete(uid + ":" + jsField);
}
function hasPendingEdits() {
  if (dirtyFields.size > 0) return true;
  for (const k in saveTimers) { if (saveTimers[k]) return true; }
  for (const k in saveStatus) { if (saveStatus[k] === "saving") return true; }
  return false;
}
function isUserTyping() {
  const a = document.activeElement;
  return !!(a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text")));
}

