// ── Helpers ──

// Pipeline hierarchy — higher number = further along
const STAGE_RANK = {
  "\u2014":                 0,
  "Visit Scheduled":     1,
  "Visit Completed":     2,
  "Followup":            3,
  "Future Prospect":     3,
  "Price High":          3,
  "Negotiation":         4,
  "Token Requested":     5,
  "Token Transferred":   6,
  "AMA Req":             7,
  "Hold":                8,
  "AMA Signed":          9,
  "Key Handover":       10,
  "Listed":             11,
};

// Terminal statuses — always win, no matter what
const TERMINAL_STATUSES = ["Dead - Legal","Dead - Sold","Dead - Not Interested","Cancelled Post Token","Duplicacy","OH Rejected","Seller Rejected"];

function getStage(p) {
  if (p.isTokenRefunded)              return 'Cancelled Post Token';
  if (p.listingSubmittedAt)           return 'Listed';
  if (p.finalSubmittedAt)             return 'Key Handover';
  if (p.cpBillSubmittedAt)            return 'AMA Signed';
  if (p.pendingRequestSubmittedAt)    return 'AMA Signed';
  if (p.amaSubmittedAt)               return 'AMA Req';
  if (p.tokenDealSubmittedAt)         return 'Token Transferred';
  if (p.tokenSubmittedAt)             return 'Token Requested';
  if (p.visitSubmittedAt)             return 'Visit Completed';
  if (p.scheduleSubmittedAt)          return 'Visit Scheduled';
  return '\u2014';
}

function getStatus(p) {
  var autoStage = getStage(p);
  var manual = p.statusOverride || "";

  // No manual override → use auto
  if (!manual) return autoStage;

  // Terminal statuses always win
  if (TERMINAL_STATUSES.indexOf(manual) >= 0) return manual;

  // Compare ranks — higher rank wins
  var autoRank = STAGE_RANK[autoStage] || 0;
  var manualRank = STAGE_RANK[manual] || 0;

  return manualRank >= autoRank ? manual : autoStage;
}

function getBalconyView(p) {
  const bd = ensureArray(p.balconyDetails);
  if (bd.length === 0) return "";
  return [...new Set(bd.map(b => b.view))].join(", ");
}

// Name cleanup: normalize POC / field exec names
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
  "priyesh": "Priyesh Kumar",
};
const POC_REMOVE = ["oh sold", "oh_sold", ""];

function cleanPocName(name) {
  if (!name) return "";
  var trimmed = name.trim();
  if (POC_REMOVE.includes(trimmed.toLowerCase())) return "";
  if (trimmed.includes("/")) {
    var parts = trimmed.split("/").map(function(s){return s.trim()});
    parts = parts.map(function(p) { return POC_NAME_MAP[p.toLowerCase()] || p; });
    return parts.join(" / ");
  }
  var lower = trimmed.toLowerCase().replace(/\s+/g, "");
  if (POC_NAME_MAP[lower]) return POC_NAME_MAP[lower];
  var lowerSpaced = trimmed.toLowerCase().trim();
  if (POC_NAME_MAP[lowerSpaced]) return POC_NAME_MAP[lowerSpaced];
  return trimmed;
}

function normalizePocNames() {
  DATA.forEach(function(p) {
    if (p.assignedBy) p.assignedBy = cleanPocName(p.assignedBy);
    if (p.fieldExec) p.fieldExec = cleanPocName(p.fieldExec);
  });
}

// Safety: parse JSON strings that should be arrays
function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function getRatePerSqft(p) {
  if (!p.demandPrice || !p.areaSqft || p.areaSqft === "0") return "";
  const price = parseFloat(p.demandPrice) * 100000;
  const area = parseFloat(p.areaSqft);
  if (isNaN(price) || isNaN(area) || area === 0) return "";
  return Math.round(price / area).toLocaleString();
}

function esc(s) { return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function formatDateOnly(val) {
  if (!val) return "\u2014";
  var d = new Date(val);
  if (isNaN(d.getTime())) return esc(val);
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

function timeAgo(ts) {
  if (!ts) return "";
  const now = new Date();
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const secs = Math.floor((now - date) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + (mins === 1 ? " min" : " mins") + " ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? " hr" : " hrs") + " ago";
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + (days === 1 ? " day" : " days") + " ago";
  const weeks = Math.floor(days / 7);
  return weeks + (weeks === 1 ? " week" : " weeks") + " ago";
}

function getFiltered() {
  var result = DATA.filter(p => {
    // Date filter on scheduleSubmittedAt
    if (state.dateFilter !== "all") {
      var dateVal = p.scheduleSubmittedAt;
      if (!dateVal) return false;
      var d = new Date(dateVal);
      if (isNaN(d.getTime())) return false;
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (state.dateFilter === "yesterday") {
        var yest = new Date(today); yest.setDate(yest.getDate() - 1);
        if (d < yest || d >= today) return false;
      } else if (state.dateFilter === "week") {
        var weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        if (d < weekStart) return false;
      } else if (state.dateFilter === "month") {
        var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        if (d < monthStart) return false;
      } else if (state.dateFilter === "custom") {
        if (state.dateFrom) { var from = new Date(state.dateFrom); if (d < from) return false; }
        if (state.dateTo) { var to = new Date(state.dateTo); to.setDate(to.getDate() + 1); if (d >= to) return false; }
      }
    }
    if (state.cityFilter !== "All" && p.city !== state.cityFilter) return false;
    // Status: array filter
    if (state.statusFilter.length > 0 && state.statusFilter.indexOf(getStatus(p)) === -1) return false;
    // POC: array filter with blank support
    if (state.pocFilter.length > 0) {
      var poc = (p.assignedBy || "").trim();
      if (state.pocFilter.indexOf("_blank_") >= 0 && poc === "") { /* matches blank */ }
      else if (state.pocFilter.indexOf(poc) === -1) return false;
    }
    if (state.sourceFilter !== "All") {
      const src = (p.source || "").toLowerCase();
      if (state.sourceFilter === "CP" && src !== "cp") return false;
      if (state.sourceFilter === "Direct" && src === "cp") return false;
    }
    if (state.search) {
      const s = state.search.toLowerCase();
      return [p.uid,p.society,p.city,p.ownerName,p.towerNo,p.unitNo,p.fieldExec,p.locality,p.contactNo].some(v => (v||"").toLowerCase().includes(s));
    }
    return true;
  });

  // Sort
  if (state.sortCol) {
    var col = state.sortCol;
    var dir = state.sortDir === "asc" ? 1 : -1;
    result.sort(function(a, b) {
      var va = (a[col] || "").toString().toLowerCase();
      var vb = (b[col] || "").toString().toLowerCase();
      // Ascending: empty first; Descending: empty last
      if (!va && vb) return -1 * dir;
      if (va && !vb) return 1 * dir;
      if (!va && !vb) return 0;
      // Try numeric comparison
      var na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return va.localeCompare(vb) * dir;
    });
  }
  return result;
}

function getCounts() {
  const c = {};
  DATA.forEach(p => { const s = getStatus(p); c[s] = (c[s]||0) + 1; });
  return c;
}

