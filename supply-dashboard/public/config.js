const ALL_STATUSES = ["AMA Req","AMA Signed","Cancelled Post Token","Dead - Legal","Dead - Not Interested","Dead - Sold","Duplicacy","Followup","Future Prospect","Hold","Key Handover","Listed","Negotiation","OH Rejected","Price High","Seller Rejected","Token Requested","Token Transferred","Visit Completed","Visit Scheduled"];

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
  dateFilter: "all", // all | yesterday | week | month | custom
  dateFrom: "",
  dateTo: "",
  expandedId: null,
  modalImg: null,
  page: 1,
  sortCol: null,
  sortDir: "asc",
  msOpen: null
};
const PAGE_SIZE = 50;

function canEdit() {
  return currentUser && (currentUser.role === "admin" || currentUser.role === "commenter" || currentUser.role === "demand");
}

// Debounce timers for auto-saving comments
const saveTimers = {};
const saveStatus = {}; // uid_field -> "saving"|"saved"|"error"

