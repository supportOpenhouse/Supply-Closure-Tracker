const ALL_STATUSES = ["AMA Signed","Cancelled Post Token","Dead - Legal","Dead - Sold","Dead - Not Interested","Documents Awaited","Duplicacy","Email Confirmation","Followup","Future Prospect","Hold","Negotiation","Offer Accepted","Offer Made","OH Rejected","Price High","Scheduled","Seller Rejected","Token Transferred"];

const STATUS_COLORS = {
  "Negotiation":       {bg:"#065f46",text:"#fff"},
  "Offer Made":        {bg:"#047857",text:"#fff"},
  "Offer Accepted":    {bg:"#0d9488",text:"#fff"},
  "Token Transferred": {bg:"#1e40af",text:"#fff"},
  "Documents Awaited": {bg:"#d97706",text:"#fff"},
  "AMA Signed":        {bg:"#15803d",text:"#fff"},
  "Email Confirmation":{bg:"#4f46e5",text:"#fff"},
  "Future Prospect":   {bg:"#0369a1",text:"#fff"},
  "Followup":          {bg:"#ca8a04",text:"#fff"},
  "Scheduled":         {bg:"#64748b",text:"#fff"},
  "Price High":        {bg:"#be123c",text:"#fff"},
  "OH Rejected":       {bg:"#e11d48",text:"#fff"},
  "Dead - Sold":       {bg:"#9f1239",text:"#fff"},
  "Dead - Not Interested":           {bg:"#881337",text:"#fff"},
  "Dead - Legal":      {bg:"#7f1d1d",text:"#fff"},
  "Duplicacy":         {bg:"#9ca3af",text:"#fff"},
  "Hold":              {bg:"#6b7280",text:"#fff"},
  "Cancelled Post Token":{bg:"#b45309",text:"#fff"},
  "Seller Rejected":   {bg:"#dc2626",text:"#fff"},
  "New":               {bg:"#d1d5db",text:"#374151"},
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
  expandedId: null,
  modalImg: null,
  page: 1,
  sortCol: null,
  sortDir: "asc",
  msOpen: null
};
const PAGE_SIZE = 50;

function canEdit() {
  return currentUser && (currentUser.role === "admin" || currentUser.role === "commenter");
}

// Debounce timers for auto-saving comments
const saveTimers = {};
const saveStatus = {}; // uid_field -> "saving"|"saved"|"error"

// ── API Calls ──
async function fetchProperties() {
  let attempts = 0;
  while (attempts < 2) {
    try {
      const res = await fetch("/api/properties");
      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Server error " + res.status);
      }
      DATA = await res.json();
      DATA.forEach(p => {
        p.balconyDetails = ensureArray(p.balconyDetails);
        p.documentsAvailable = ensureArray(p.documentsAvailable);
        p.furnishingDetails = ensureArray(p.furnishingDetails);
      });
      normalizePocNames();
      const now = new Date();
      lastRefreshed = now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
      return;
    } catch(e) {
      attempts++;
      if (attempts >= 2) throw e;
      await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
    }
  }
}

function downloadCSV() {
  var filtered = getFiltered();
  var cols = [
    {hdr:"UID",key:"uid"},{hdr:"Society",key:"society"},{hdr:"City",key:"city"},
    {hdr:"Location",key:"locality"},{hdr:"Tower",key:"towerNo"},{hdr:"Unit No.",key:"unitNo"},
    {hdr:"Config",key:"configuration"},{hdr:"Ask (Lakhs)",key:"demandPrice"},
    {hdr:"Area (Sqft)",key:"areaSqft"},{hdr:"Floor",key:"floor"},{hdr:"Source",key:"source"},
    {hdr:"Name",key:"ownerName"},{hdr:"Phone",key:"contactNo"},
    {hdr:"Status",fn:function(p){return (p.statusOverride||"New")}},
    {hdr:"Exit Facing",key:"exitFacing"},{hdr:"Balcony View",fn:function(p){return getBalconyView(p)||p.balconyView||""}},
    {hdr:"POC",key:"assignedBy"},{hdr:"Offer Price",key:"offerPrice"},
    {hdr:"Key Handover Date",key:"keysHandoverDate"},
    {hdr:"Closure Team Comments",key:"closureTeamComments"},
    {hdr:"Rahool Comments",key:"rahoolComments"},
    {hdr:"Prashant Comments",key:"prashantComments"},
    {hdr:"Demand Team Comments",key:"demandTeamComments"}
  ];

  function csvVal(v) {
    var s = String(v==null?"":v).replace(/\r?\n/g," ").replace(/"/g,'""');
    return '"'+s+'"';
  }

  var rows = [cols.map(function(c){return csvVal(c.hdr)}).join(",")];
  filtered.forEach(function(p) {
    rows.push(cols.map(function(c){
      return csvVal(c.fn ? c.fn(p) : (p[c.key]||""));
    }).join(","));
  });

  var blob = new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8;"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "supply-closure-tracker-"+new Date().toISOString().slice(0,10)+".csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function refreshData() {
  const btn = document.querySelector('[onclick="refreshData()"]');
  if (btn) { btn.textContent = "Refreshing..."; btn.disabled = true; }
  try {
    await fetchProperties();

    render();
  } catch (err) {
    alert("Refresh failed: " + err.message);
  }
  if (btn) { btn.innerHTML = "&#x21bb; Refresh"; btn.disabled = false; }
}

async function saveField(uid, dbField, value) {
  const key = uid + "_" + dbField;
  saveStatus[key] = "saving";
  renderSaveDot(key);

  try {
    const res = await fetch("/api/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, field: dbField, value })
    });
    if (!res.ok) throw new Error("Save failed");
    saveStatus[key] = "saved";
    renderSaveDot(key);
    setTimeout(() => { saveStatus[key] = ""; renderSaveDot(key); }, 2000);
  } catch (e) {
    saveStatus[key] = "error";
    renderSaveDot(key);
  }
}

function renderSaveDot(key) {
  const el = document.getElementById("dot_" + key);
  if (!el) return;
  el.className = "save-dot " + (saveStatus[key] || "");
}

function debouncedSave(uid, dbField, value) {
  const key = uid + "_" + dbField;
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => saveField(uid, dbField, value), 800);
}

// ── Helpers ──
function getStatus(p) {
  if (p.statusOverride) return p.statusOverride;
  if (p.listingSubmittedAt) return "AMA Signed";
  if (p.finalSubmittedAt) return "AMA Signed";
  if (p.tokenDealSubmittedAt) return "Token Transferred";
  if (p.tokenSubmittedAt) return "Documents Awaited";
  if (p.visitSubmittedAt) return "Followup";
  if (p.scheduleDate) return "Scheduled";
  return "New";
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

// ── Render ──
let isRendering = false;
function render() {
  if (isRendering) return;
  isRendering = true;
  try {
    _render();
  } catch(e) {
    console.error("Render error:", e);
  } finally {
    isRendering = false;
  }
}

function _render() {
  const filtered = getFiltered();
  const counts = getCounts();
  const cities = ["All", ...new Set(DATA.map(p => p.city))];
  const pocs = ["All", ...new Set(DATA.map(p => p.assignedBy).filter(Boolean))];
  const tabStatuses = ["Scheduled","Followup","Negotiation","Offer Made","Token Transferred","Documents Awaited","AMA Signed"];

  let h = "";

  // Header
  h += '<div class="header">';
  h += '<div style="display:flex;align-items:center;gap:10px"><div class="logo">OH</div><div><div style="font-size:16px;font-weight:700">Supply Closure Tracker</div><div style="font-size:11px;color:#6b7280">All Cities &middot; '+DATA.length+' Properties</div></div></div>';
  h += '<div style="display:flex;align-items:center;gap:12px">';
  h += '<div class="tabs">';
  tabStatuses.forEach(s => {
    h += '<span class="tab'+(state.statusFilter.indexOf(s)>=0?' active':'')+'" onclick="toggleTab(\''+s+'\')">'+s+' <span style="font-weight:700;margin-left:2px">'+(counts[s]||0)+'</span></span>';
  });
  h += '</div>';
  // User bar
  if (currentUser) {
    const pendingCount = adminRequests.filter(r => r.status === 'pending').length;
    h += '<div class="user-bar">';
    h += '<span class="email">'+esc(currentUser.name || currentUser.email)+'</span>';
    if (currentUser.role === 'admin') {
      h += '<button class="admin-btn" onclick="openAdmin()">Manage Users';
      if (pendingCount > 0) h += '<span class="pending-badge">'+pendingCount+'</span>';
      h += '</button>';
    }
    h += '<button onclick="logout()">Logout</button>';
    h += '</div>';
  }
  h += '</div></div>';

  // Filters
  h += '<div class="filters">';
  h += '<input id="searchBox" value="'+esc(state.search)+'" placeholder="Search society, owner, UID..." oninput="updateSearch(this.value)">';
  h += '<select onchange="updateFilter(\'cityFilter\',this.value)"><option value="All">All Cities</option>';
  cities.filter(c=>c!=="All").sort().forEach(c => { h += '<option value="'+esc(c)+'"'+(state.cityFilter===c?' selected':'')+'>'+esc(c)+'</option>'; });
  h += '</select>';
  // Status multi-select
  h += '<div class="ms-wrap">';
  h += '<div class="ms-btn" onclick="event.stopPropagation();toggleMs(\'status\')">';
  h += state.statusFilter.length === 0 ? 'All Status' : 'Status';
  if (state.statusFilter.length > 0) h += ' <span class="ms-count">'+state.statusFilter.length+'</span>';
  h += ' &#9662;</div>';
  if (state.msOpen === 'status') {
    h += '<div class="ms-drop" onclick="event.stopPropagation()">';
    ALL_STATUSES.forEach(function(s) {
      var on = state.statusFilter.indexOf(s) >= 0;
      h += '<div class="ms-item" onclick="toggleMsItem(\'statusFilter\',\''+esc(s)+'\')">';
      h += '<div class="ms-check'+(on?' on':'')+'">'+( on?'&#10003;':'')+'</div>'+esc(s)+'</div>';
    });
    if (state.statusFilter.length > 0) h += '<div class="ms-clear" onclick="clearMs(\'statusFilter\')">Clear all</div>';
    h += '</div>';
  }
  h += '</div>';

  // POC multi-select
  h += '<div class="ms-wrap">';
  h += '<div class="ms-btn" onclick="event.stopPropagation();toggleMs(\'poc\')">';
  h += state.pocFilter.length === 0 ? 'All POC' : 'POC';
  if (state.pocFilter.length > 0) h += ' <span class="ms-count">'+state.pocFilter.length+'</span>';
  h += ' &#9662;</div>';
  if (state.msOpen === 'poc') {
    h += '<div class="ms-drop" onclick="event.stopPropagation()">';
    h += '<div class="ms-item" onclick="toggleMsItem(\'pocFilter\',\'_blank_\')">';
    var blankOn = state.pocFilter.indexOf("_blank_") >= 0;
    h += '<div class="ms-check'+(blankOn?' on':'')+'">'+(blankOn?'&#10003;':'')+'</div>(Blank)</div>';
    pocs.filter(function(p){return p!=="All"}).sort(function(a,b){return a.localeCompare(b)}).forEach(function(p) {
      var on = state.pocFilter.indexOf(p) >= 0;
      h += '<div class="ms-item" onclick="toggleMsItem(\'pocFilter\',\''+esc(p)+'\')">';
      h += '<div class="ms-check'+(on?' on':'')+'">'+( on?'&#10003;':'')+'</div>'+esc(p)+'</div>';
    });
    if (state.pocFilter.length > 0) h += '<div class="ms-clear" onclick="clearMs(\'pocFilter\')">Clear all</div>';
    h += '</div>';
  }
  h += '</div>';
  h += '<select onchange="updateFilter(\'sourceFilter\',this.value)"><option value="All">All Sources</option><option value="CP"'+(state.sourceFilter==="CP"?' selected':'')+'>CP</option><option value="Direct"'+(state.sourceFilter==="Direct"?' selected':'')+'>Direct</option></select>';
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (state.page > totalPages && totalPages > 0) state.page = totalPages;
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageEnd);

  h += '<span style="font-size:10px;color:#9ca3af;margin-left:auto">'+filtered.length+' results &middot; Page '+state.page+'/'+Math.max(totalPages,1)+'</span>';
  h += '<span id="lastUpdated" style="font-size:9px;color:#d1d5db">'+(lastRefreshed ? lastRefreshed : '')+'</span>';
  h += '<button onclick="refreshData()" style="padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;transition:all 0.15s">&#x21bb;</button>';
  if (currentUser && currentUser.role === 'admin') {
    h += '<button onclick="downloadCSV()" style="padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;transition:all 0.15s" title="Download CSV">&#x2913; CSV</button>';
  }
  h += '</div>';

  // Table
  h += '<div id="tableWrap" style="flex:1;overflow:auto"><table><thead><tr>';
  var COLS = [
    {hdr:"Society",key:"society"},{hdr:"City",key:"city"},{hdr:"Location",key:"locality"},{hdr:"Tower",key:"towerNo"},{hdr:"Unit No.",key:"unitNo"},{hdr:"Config",key:"configuration"},{hdr:"Ask (in Lakhs)",key:"demandPrice"},{hdr:"Area (in Sqft)",key:"areaSqft"},{hdr:"Floor",key:"floor"},{hdr:"Source",key:"source"},{hdr:"Name",key:"ownerName"},{hdr:"Phone",key:"contactNo"},{hdr:"Status",key:null},{hdr:"Exit Facing",key:"exitFacing"},{hdr:"Balcony View",key:null},{hdr:"POC",key:"assignedBy"},{hdr:"Offer Price",key:null},{hdr:"Key Handover",key:"keysHandoverDate"},{hdr:"Closure Team Comments",key:null},{hdr:"Rahool Comments",key:null},{hdr:"Prashant Comments",key:null},{hdr:"Demand Team Comments",key:null}
  ];
  COLS.forEach(function(col,i) {
    var sortable = col.key ? ' class="sortable" onclick="toggleSort(\''+col.key+'\')"' : '';
    var icon = '';
    if (col.key && state.sortCol === col.key) {
      icon = ' <span class="sort-icon active">'+(state.sortDir==='asc'?'\u25B2':'\u25BC')+'</span>';
    } else if (col.key) {
      icon = ' <span class="sort-icon">\u25B2</span>';
    }
    h += '<th'+sortable+(i>=18?' style="min-width:150px'+(col.key?';cursor:pointer':'')+'"':col.key?'':'')+'>'+col.hdr+icon+'</th>';
  });
  h += '</tr></thead><tbody>';

  pageRows.forEach(p => {
    // Ensure arrays are parsed (safety net for Neon JSON strings)
    p.balconyDetails = ensureArray(p.balconyDetails);
    p.documentsAvailable = ensureArray(p.documentsAvailable);

    const status = getStatus(p);
    const sc = STATUS_COLORS[status] || STATUS_COLORS["New"];
    const isExp = state.expandedId === p.uid;

    h += '<tr class="datarow'+(isExp?' expanded':'')+'" onclick="toggleExpand(\''+p.uid+'\')">';
    h += '<td class="society-cell">'+esc(p.society)+'</td>';
    h += '<td>'+esc(p.city||"\u2014")+'</td>';
    h += '<td>'+esc(p.locality)+'</td>';
    h += '<td>'+(p.towerNo||"\u2014")+'</td>';
    h += '<td class="unit-cell">'+(p.unitNo||"\u2014")+'</td>';
    h += '<td>'+(p.configuration||"\u2014")+'</td>';
    h += '<td class="ask-cell">'+(p.demandPrice||"\u2014")+'</td>';
    h += '<td>'+(p.areaSqft||"\u2014")+'</td>';
    h += '<td style="text-align:center">'+(p.floor||"\u2014")+'</td>';
    h += '<td>'+esc(p.source)+'</td>';
    h += '<td>'+esc(p.ownerName)+'</td>';
    h += '<td style="font-size:11px;white-space:nowrap">'+(p.contactNo||"\u2014")+'</td>';

    // Status
    h += '<td onclick="event.stopPropagation()">';
    if (canEdit()) {
      h += '<select class="status-select" style="background:'+sc.bg+';color:'+sc.text+'" onchange="changeStatus(\''+p.uid+'\',this.value)">';
      ALL_STATUSES.forEach(s => { h += '<option value="'+esc(s)+'"'+(status===s?' selected':'')+' style="background:#fff;color:#111827">'+esc(s)+'</option>'; });
      h += '</select>';
      h += '<span id="dot_'+p.uid+'_status_override" class="save-dot '+(saveStatus[p.uid+'_status_override']||'')+'"></span>';
    } else {
      h += '<span class="status-select" style="background:'+sc.bg+';color:'+sc.text+';display:inline-block;padding:3px 8px;border-radius:4px">'+esc(status)+'</span>';
    }
    h += '</td>';

    h += '<td>'+(p.exitFacing||"\u2014")+'</td>';
    h += '<td class="balcony-cell">'+(getBalconyView(p)||p.balconyView||"\u2014")+'</td>';
    h += '<td class="small-cell">'+esc(p.assignedBy||"\u2014")+'</td>';

    // Offer
    if (canEdit()) {
      h += '<td onclick="event.stopPropagation()"><input type="text" value="'+esc(p.offerPrice||'')+'" placeholder="\u2014" oninput="changeOffer(\''+p.uid+'\',this.value)" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;font-weight:600;color:#047857;outline:none;font-family:inherit;text-align:right"><span id="dot_'+p.uid+'_offer_price" class="save-dot '+(saveStatus[p.uid+'_offer_price']||'')+'"></span></td>';
    } else {
      h += '<td style="font-weight:600;color:#047857">'+(p.offerPrice||"\u2014")+'</td>';
    }

    // Key Handover Date
    h += '<td style="font-size:11px;white-space:nowrap">'+formatDateOnly(p.keysHandoverDate)+'</td>';

    // Comments
    const commentFields = [
      {key:"closureTeamComments", db:"closure_team_comments", tsKey:"closureTeamCommentsAt"},
      {key:"rahoolComments", db:"rahool_comments", tsKey:"rahoolCommentsAt"},
      {key:"prashantComments", db:"prashant_comments", tsKey:"prashantCommentsAt"},
      {key:"demandTeamComments", db:"demand_team_comments", tsKey:"demandTeamCommentsAt"}
    ];
    commentFields.forEach(cf => {
      const dotKey = p.uid + "_" + cf.db;
      const ts = timeAgo(p[cf.tsKey]);
      h += '<td onclick="event.stopPropagation()">';
      if (canEdit()) {
        h += '<textarea class="comment-input" placeholder="\u2014" oninput="changeComment(\''+p.uid+"','"+cf.db+"','"+cf.key+'\',this.value)">'+esc(p[cf.key]||"")+'</textarea>';
        h += '<div style="display:flex;align-items:center;gap:3px;margin-top:2px">';
        h += '<span id="dot_'+dotKey+'" class="save-dot '+(saveStatus[dotKey]||'')+'"></span>';
        if (ts) h += '<span style="font-size:9px;color:#9ca3af">'+ts+'</span>';
        h += '</div>';
      } else {
        h += '<div style="font-size:11px;color:#374151;max-width:160px">'+esc(p[cf.key]||"\u2014")+'</div>';
        if (ts) h += '<div style="font-size:9px;color:#9ca3af">'+ts+'</div>';
      }
      h += '</td>';
    });

    h += '</tr>';

    // Expanded row
    if (isExp) {
      try {
      h += '<tr class="expand-row"><td colspan="22"><div class="expand-content">';
      h += '<div class="detail-tags">';
      const rate = getRatePerSqft(p);
      if (rate) h += '<span>Rate/sqft: <b>\u20B9'+rate+'</b></span>';
      if (p.fieldExec) h += '<span>Field Exec: <b>'+esc(p.fieldExec)+'</b></span>';
      h += '<span>Visit: <b style="color:'+(p.visitSubmittedAt?'#059669':'#9ca3af')+'">'+(p.visitSubmittedAt?'Yes':'No')+'</b></span>';
      if (p.balconyDetails && p.balconyDetails.length > 0) h += '<span>Photos: <b style="color:#2563eb">'+p.balconyDetails.length+'</b></span>';
      if (p.bathrooms) h += '<span>Toilets: <b>'+esc(p.bathrooms)+'</b></span>';
      if (p.balconies) h += '<span>Balconies: <b>'+esc(p.balconies)+'</b></span>';
      if (p.parking) h += '<span>Parking: <b>'+esc(p.parking)+'</b></span>';
      if (p.furnishing) h += '<span>Furnishing: <b>'+esc(p.furnishing)+'</b></span>';
      if (p.registryStatus) h += '<span>Registry: <b>'+esc(p.registryStatus)+'</b></span>';
      if (p.occupancyStatus) h += '<span>Occupancy: <b>'+esc(p.occupancyStatus)+'</b></span>';
      if (p.guaranteedSalePrice) h += '<span>GSP: <b>\u20B9'+esc(p.guaranteedSalePrice)+'L</b></span>';
      if (p.initialPeriod) h += '<span>Contract: <b>'+esc(p.initialPeriod)+'d</b></span>';
      if (p.gracePeriod) h += '<span>Grace: <b>'+esc(p.gracePeriod)+'d</b></span>';
      if (p.tokenAmountRequested) h += '<span>Token Req: <b>\u20B9'+Number(p.tokenAmountRequested).toLocaleString()+'</b></span>';
      if (p.videoLink) h += '<a href="'+esc(p.videoLink)+'" target="_blank" style="color:#2563eb;text-decoration:none">\u25B6 Video/Photos</a>';
      h += '</div>';

      // POC edit (admin only, not legacy)
      if (currentUser && currentUser.role === 'admin') {
        var pocFromData = DATA.map(function(d){return d.assignedBy}).filter(Boolean);
        var pocFromTeam = adminTeam.map(function(t){return t.display_name}).filter(Boolean);
        var pocNames = [...new Set([...pocFromData, ...pocFromTeam])].sort();
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px" onclick="event.stopPropagation()">';
        h += '<span style="font-size:12px;font-weight:600;color:#0369a1">Change POC:</span>';
        h += '<select onchange="changePoc(\''+p.uid+'\',this.value)" style="padding:4px 8px;font-size:12px;border:1px solid #93c5fd;border-radius:4px;outline:none">';
        h += '<option value="">'+esc(p.assignedBy || "— Select —")+'</option>';
        pocNames.forEach(function(n){ if(n!==p.assignedBy) h += '<option value="'+esc(n)+'">'+esc(n)+'</option>'; });
        h += '</select>';
        h += '<span id="dot_'+p.uid+'_assigned_by" class="save-dot '+(saveStatus[p.uid+'_assigned_by']||'')+'"></span>';
        h += '</div>';
      }

      if (p.documentsAvailable && p.documentsAvailable.length > 0) {
        h += '<div style="font-size:11px;color:#6b7280;margin-bottom:12px">Docs: '+p.documentsAvailable.map(function(d){return esc(d)}).join(' \u00B7 ')+'</div>';
      }

      if (p.balconyDetails && p.balconyDetails.length > 0) {
        h += '<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Balcony Views & Compass</div>';
        h += '<div class="img-strip">';
        if (p.exitCompassImage) {
          h += '<div style="min-width:100px;text-align:center"><img src="'+esc(p.exitCompassImage)+'" width="100" height="70" data-modal="'+esc(p.exitCompassImage)+'" onclick="event.stopPropagation();showModal(this.dataset.modal)"><div style="font-size:10px;color:#6b7280;margin-top:3px">Exit Compass</div></div>';
        }
        p.balconyDetails.forEach(function(b) {
          if (!b || !b.view_image) return;
          h += '<div class="img-card"><div style="display:flex;gap:4px">';
          h += '<img src="'+esc(b.view_image)+'" width="80" height="70" data-modal="'+esc(b.view_image)+'" onclick="event.stopPropagation();showModal(this.dataset.modal)">';
          if (b.compass_image) h += '<img src="'+esc(b.compass_image)+'" width="50" height="70" data-modal="'+esc(b.compass_image)+'" onclick="event.stopPropagation();showModal(this.dataset.modal)">';
          h += '</div><div style="font-size:10px;color:#6b7280;margin-top:3px">'+esc(b.attached_to||"")+' \u00B7 '+esc(b.facing||"")+' \u00B7 '+esc(b.view||"")+'</div></div>';
        });
        h += '</div>';
      } else {
        h += '<div style="font-size:11px;color:#9ca3af;font-style:italic">Visit not completed \u2014 no images available</div>';
      }

      h += '</div></td></tr>';
      } catch(expandErr) {
        h += '<tr class="expand-row"><td colspan="22" style="padding:12px 20px;color:#ef4444;font-size:12px">Error loading details: '+esc(expandErr.message)+'</td></tr>';
        console.error("Expand error for "+p.uid+":", expandErr);
      }
    }
  });

  h += '</tbody></table>';
  if (filtered.length === 0) {
    if (DATA.length === 0 && currentUser && currentUser.role !== 'admin') {
      h += '<div style="text-align:center;padding:60px 20px;color:#6b7280"><div style="font-size:32px;margin-bottom:12px">&#128274;</div><div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px">No records visible to you</div><div style="font-size:13px">You are not assigned to any properties yet. Contact your manager or admin for access.</div></div>';
    } else {
      h += '<div style="text-align:center;padding:40px 20px;color:#9ca3af;font-size:13px">No properties match the current filters</div>';
    }
  }

  // Pagination
  if (totalPages > 1) {
    h += '<div class="pgbar">';
    var dis1 = state.page===1;
    var disL = state.page===totalPages;
    h += '<button class="pgb'+(dis1?' pgd':'')+'" onclick="goPage(1)"'+(dis1?' disabled':'')+'>\u00AB</button>';
    h += '<button class="pgb'+(dis1?' pgd':'')+'" onclick="goPage('+(state.page-1)+')"'+(dis1?' disabled':'')+'>\u2039 Prev</button>';
    var sp = Math.max(1, state.page - 3), ep = Math.min(totalPages, state.page + 3);
    if (sp > 1) h += '<span class="pgdots">...</span>';
    for (var pg = sp; pg <= ep; pg++) {
      h += pg===state.page ? '<span class="pgcur">'+pg+'</span>' : '<button class="pgb" onclick="goPage('+pg+')">'+pg+'</button>';
    }
    if (ep < totalPages) h += '<span class="pgdots">...</span>';
    h += '<button class="pgb'+(disL?' pgd':'')+'" onclick="goPage('+(state.page+1)+')"'+(disL?' disabled':'')+'> Next \u203A</button>';
    h += '<button class="pgb'+(disL?' pgd':'')+'" onclick="goPage('+totalPages+')"'+(disL?' disabled':'')+'>\u00BB</button>';
    h += '<span class="pginfo">'+(pageStart+1)+'\u2013'+Math.min(pageEnd,filtered.length)+' of '+filtered.length+'</span>';
    h += '</div>';
  }

  h += '</div>';

  var tw = document.getElementById("tableWrap");
  var scrollTop = tw ? tw.scrollTop : 0;
  var scrollLeft = tw ? tw.scrollLeft : 0;
  document.getElementById("app").innerHTML = h;
  tw = document.getElementById("tableWrap");
  if (tw) { tw.scrollTop = scrollTop; tw.scrollLeft = scrollLeft; }
  renderOverlays();
}

function renderOverlays() {
  let h = "";

  // Modal
  if (state.modalImg) {
    h += '<div class="modal-overlay" onclick="closeModal()"><img src="'+esc(state.modalImg)+'"></div>';
  }

  // Admin Panel
  if (showAdminPanel && currentUser && currentUser.role === 'admin') {
    const pending = adminRequests.filter(r => r.status === 'pending');
    h += '<div class="admin-overlay" onclick="if(event.target===this)closeAdmin()">';
    h += '<div class="admin-panel">';
    h += '<div class="admin-header"><h2>Admin Panel</h2><button class="admin-close" onclick="closeAdmin()">&times;</button></div>';

    // Tabs
    h += '<div style="display:flex;border-bottom:1px solid #e5e7eb;padding:0 20px">';
    h += '<span onclick="switchAdminTab(\'users\')" style="padding:8px 16px;font-size:13px;font-weight:'+(adminTab==='users'?'600':'400')+';cursor:pointer;border-bottom:2px solid '+(adminTab==='users'?'#111827':'transparent')+';color:'+(adminTab==='users'?'#111827':'#6b7280')+'">Users';
    if (pending.length > 0) h += ' <span class="pending-badge">'+pending.length+'</span>';
    h += '</span>';
    h += '<span onclick="switchAdminTab(\'team\')" style="padding:8px 16px;font-size:13px;font-weight:'+(adminTab==='team'?'600':'400')+';cursor:pointer;border-bottom:2px solid '+(adminTab==='team'?'#111827':'transparent')+';color:'+(adminTab==='team'?'#111827':'#6b7280')+'">Team Directory ('+adminTeam.length+')</span>';
    const openBugs = adminBugs.filter(b => b.status === 'open' || b.status === 'in_progress').length;
    h += '<span onclick="switchAdminTab(\'bugs\')" style="padding:8px 16px;font-size:13px;font-weight:'+(adminTab==='bugs'?'600':'400')+';cursor:pointer;border-bottom:2px solid '+(adminTab==='bugs'?'#111827':'transparent')+';color:'+(adminTab==='bugs'?'#111827':'#6b7280')+'">&#128027; Bugs';
    if (openBugs > 0) h += ' <span class="pending-badge">'+openBugs+'</span>';
    h += '</span>';
    h += '</div>';

    h += '<div class="admin-body">';

    if (adminTab === 'users') {
      h += '<div class="admin-section"><h3>Add User</h3>';
      h += '<div class="admin-add">';
      h += '<input id="addEmail" placeholder="email@openhouse.in">';
      h += '<select id="addRole"><option value="viewer">Viewer</option><option value="commenter">Commenter</option><option value="admin">Admin</option></select>';
      h += '<button onclick="addUser()">Add User</button>';
      h += '</div></div>';

      if (pending.length > 0) {
        h += '<div class="admin-section"><h3>Access Requests <span class="pending-badge">'+pending.length+'</span></h3>';
        h += '<div class="admin-list">';
        pending.forEach(r => {
          h += '<div class="admin-row">';
          h += '<div><span class="email">'+esc(r.email)+'</span>';
          if (r.name) h += '<span style="color:#6b7280;margin-left:6px">'+esc(r.name)+'</span>';
          h += '</div>';
          h += '<div class="req-actions">';
          h += '<button class="approve" onclick="handleRequest('+r.id+',\'approve\')">Approve</button>';
          h += '<button class="reject" onclick="handleRequest('+r.id+',\'reject\')">Reject</button>';
          h += '</div></div>';
        });
        h += '</div></div>';
      }

      h += '<div class="admin-section"><h3>Current Users ('+adminUsers.length+')</h3>';
      h += '<div style="font-size:10px;color:#6b7280;margin-bottom:6px">Viewer = read only &middot; Commenter = can edit comments, status, offer &middot; Admin = full access</div>';
      h += '<div class="admin-list">';
      adminUsers.forEach(u => {
        h += '<div class="admin-row">';
        h += '<div style="flex:1"><span class="email">'+esc(u.email)+'</span></div>';
        h += '<select class="role-select" onchange="changeUserRole(\''+esc(u.email)+'\',this.value)">';
        ["viewer","commenter","admin"].forEach(r => {
          h += '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+r+'</option>';
        });
        h += '</select>';
        h += '<button onclick="removeUser(\''+esc(u.email)+'\')" style="margin-left:6px">Remove</button>';
        h += '</div>';
      });
      h += '</div></div>';

      // Force logout
      h += '<div class="admin-section" style="border-top:2px solid #fecaca;padding-top:12px">';
      h += '<h3 style="color:#dc2626">Security</h3>';
      h += '<button onclick="forceLogoutAll()" style="padding:6px 14px;font-size:11px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500">Force Logout All Users</button>';
      h += '<div style="font-size:10px;color:#9ca3af;margin-top:4px">Invalidates all sessions. Everyone (including you) must log in again.</div>';
      h += '</div>';

    } else if (adminTab === 'team') {
      h += '<div class="admin-section"><h3>Add Team Member</h3>';
      h += '<div style="font-size:11px;color:#6b7280;margin-bottom:8px">Display name must exactly match names in assigned_by / field_exec columns</div>';
      h += '<div class="admin-add">';
      h += '<input id="teamEmail" placeholder="email@openhouse.in" style="flex:1">';
      h += '<input id="teamName" placeholder="Display Name" style="flex:1">';
      h += '</div>';
      h += '<div class="admin-add" style="margin-top:4px">';
      h += '<select id="teamManager" style="flex:1"><option value="">No Manager</option>';
      adminTeam.forEach(t => {
        h += '<option value="'+esc(t.email)+'">'+esc(t.display_name)+' ('+esc(t.email)+')</option>';
      });
      h += '</select>';
      h += '<button onclick="addTeamMember()">Add</button>';
      h += '</div></div>';

      h += '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#0369a1">';
      h += '<b>How visibility works:</b> Each person sees records where their Display Name appears in Assigned By, Field Exec, or Token By. They also see records of their direct reportees. Admins see everything.';
      h += '</div>';

      h += '<div class="admin-section"><h3>Team Directory</h3>';
      h += '<div class="admin-list">';
      if (adminTeam.length === 0) {
        h += '<div class="admin-row" style="color:#9ca3af;justify-content:center">No team members yet</div>';
      }
      adminTeam.forEach(t => {
        const mgr = adminTeam.find(m => m.email.toLowerCase() === (t.manager_email||'').toLowerCase());
        h += '<div class="admin-row" style="flex-wrap:wrap;gap:4px">';
        h += '<div style="flex:1;min-width:200px">';
        h += '<div><span class="email">'+esc(t.display_name)+'</span></div>';
        h += '<div style="font-size:11px;color:#6b7280">'+esc(t.email);
        if (mgr) h += ' &rarr; reports to <b>'+esc(mgr.display_name)+'</b>';
        h += '</div></div>';
        h += '<div style="display:flex;gap:4px">';
        h += '<button onclick="removeTeamMember('+t.id+')" style="border-color:#fecaca;color:#ef4444">Remove</button>';
        h += '</div></div>';
      });
      h += '</div></div>';
    }

    if (adminTab === 'bugs') {
      if (adminBugs.length === 0) {
        h += '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">No bug reports yet</div>';
      } else {
        const bugStats = {open:0, in_progress:0, resolved:0, closed:0};
        adminBugs.forEach(b => { bugStats[b.status] = (bugStats[b.status]||0) + 1; });
        h += '<div style="display:flex;gap:12px;margin-bottom:16px;font-size:12px">';
        h += '<span class="bug-status-badge bst-open">Open: '+bugStats.open+'</span>';
        h += '<span class="bug-status-badge bst-in_progress">In Progress: '+bugStats.in_progress+'</span>';
        h += '<span class="bug-status-badge bst-resolved">Resolved: '+bugStats.resolved+'</span>';
        h += '<span class="bug-status-badge bst-closed">Closed: '+bugStats.closed+'</span>';
        h += '</div>';

        adminBugs.forEach(b => {
          const sevClass = "sev-"+(b.severity||"medium");
          const stClass = "bst-"+(b.status||"open");
          const ago = timeAgo(b.created_at);
          h += '<div class="bug-card">';
          h += '<div class="bug-card-header"><div>';
          h += '<div class="bug-card-title">#'+b.id+' '+esc(b.title)+'</div>';
          h += '<div class="bug-card-meta">'+esc(b.reported_by)+' &middot; '+ago;
          if (b.page) h += ' &middot; '+esc(b.page);
          h += '</div></div>';
          h += '<div style="display:flex;gap:4px;flex-shrink:0">';
          h += '<span class="bug-severity '+sevClass+'">'+esc(b.severity)+'</span>';
          h += '<span class="bug-status-badge '+stClass+'">'+esc(b.status)+'</span>';
          h += '</div></div>';
          if (b.description) h += '<div class="bug-card-desc">'+esc(b.description)+'</div>';
          if (b.steps_to_reproduce) h += '<div style="font-size:11px;color:#6b7280;margin-bottom:8px;white-space:pre-wrap"><b>Steps:</b> '+esc(b.steps_to_reproduce)+'</div>';
          if (b.screenshot_url) h += '<div style="margin-bottom:8px"><a href="'+esc(b.screenshot_url)+'" target="_blank" style="font-size:11px;color:#2563eb">View Screenshot</a></div>';
          h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px">';
          h += '<select onchange="updateBugStatus('+b.id+',this.value)" style="padding:3px 6px;font-size:11px;border:1px solid #d1d5db;border-radius:4px">';
          ["open","in_progress","resolved","closed"].forEach(s => {
            h += '<option value="'+s+'"'+(b.status===s?' selected':'')+'>'+s.replace("_"," ")+'</option>';
          });
          h += '</select>';
          h += '<input value="'+esc(b.admin_notes||"")+'" placeholder="Admin notes..." oninput="debouncedBugNote('+b.id+',this.value)" style="flex:1;padding:4px 8px;font-size:11px;border:1px solid #d1d5db;border-radius:4px;outline:none">';
          if (b.resolved_by) h += '<span style="font-size:10px;color:#059669">Resolved by '+esc(b.resolved_by)+'</span>';
          h += '</div></div>';
        });
      }
    }

    h += '</div></div></div>';
  }

  // Floating Bug Report Button
  if (currentUser) {
    h += '<button class="bug-btn" onclick="openBugForm()">&#128027; Report Bug</button>';
  }

  // Bug Report Form Modal
  if (showBugForm) {
    h += '<div class="bug-overlay" onclick="if(event.target===this)closeBugForm()">';
    h += '<div class="bug-modal" style="width:420px">';
    h += '<div class="bug-header"><h2>&#128027; Report a Bug</h2><button class="admin-close" onclick="closeBugForm()">&times;</button></div>';
    h += '<div class="bug-body">';
    if (bugSubmitted) {
      h += '<div class="bug-success" style="padding:40px 20px">&#9989; Bug reported!<br><br><span style="font-size:14px;color:#111827;font-weight:600">Your issue will be resolved in the next 48 hrs.</span><br><span style="font-size:12px;color:#6b7280;margin-top:8px;display:block">We\'ll notify you once it\'s fixed.</span></div>';
      h += '<div style="text-align:center;margin-top:16px;padding-bottom:8px"><button onclick="closeBugForm()" style="padding:8px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer">Done</button></div>';
    } else {
      h += '<div class="bug-field"><label>Describe your issue *</label>';
      h += '<textarea id="bugTitle" placeholder="What went wrong? Be as specific as possible..." style="min-height:100px"></textarea></div>';
      h += '<div class="bug-field"><label>Attach screenshot (paste link)</label>';
      h += '<input id="bugScreenshot" placeholder="Google Drive / Imgur link"></div>';
      h += '<button class="bug-submit" id="bugSubmitBtn" onclick="submitBugReport()">Submit</button>';
    }
    h += '</div></div></div>';
  }

  document.getElementById("overlays").innerHTML = h;
}

// ── Event Handlers ──
function toggleTab(s) {
  var idx = state.statusFilter.indexOf(s);
  if (idx >= 0) { state.statusFilter.splice(idx, 1); }
  else { state.statusFilter.push(s); }
  state.page = 1; render();
}

function toggleMs(which) {
  state.msOpen = state.msOpen === which ? null : which;
  render();
}

function toggleMsItem(key, val) {
  var arr = state[key];
  var idx = arr.indexOf(val);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(val);
  state.page = 1;
  render();
}

function clearMs(key) {
  state[key] = [];
  state.page = 1;
  render();
}

function toggleSort(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortCol = col;
    state.sortDir = "asc";
  }
  state.page = 1;
  render();
}

async function changeUserRole(email, newRole) {
  await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, role: newRole })
  });
  await loadUsers();
  renderOverlays();
}

async function forceLogoutAll() {
  if (!confirm("This will log out ALL users (including you). Everyone must log in again. Continue?")) return;
  try {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "force_logout_all" })
    });
    if (res.ok) {
      alert("All sessions invalidated. You will be redirected to login.");
      window.location.href = "/login.html";
    } else {
      alert("Failed to force logout");
    }
  } catch(e) {
    alert("Error: " + e.message);
  }
}
let searchTimer = null;
function updateSearch(v) {
  state.search = v;
  state.page = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    const el = document.getElementById("searchBox");
    const pos = el ? el.selectionStart : 0;
    render();
    const el2 = document.getElementById("searchBox");
    if (el2) { el2.focus(); el2.selectionStart = el2.selectionEnd = pos; }
  }, 200);
}
function updateFilter(key, v) {
  state[key] = v;
  state.page = 1;
  try { render(); } catch(e) { console.error("Render error on filter:", e); }
}

function goPage(n) { state.page = n; render(); var tw = document.getElementById("tableWrap"); if (tw) tw.scrollTop = 0; }
function toggleExpand(uid) {
  state.expandedId = state.expandedId === uid ? null : uid;
  try { render(); } catch(e) { console.error("Render crash:", e); alert("Render error: " + e.message); }
}
function showModal(src) { state.modalImg = src; renderOverlays(); }
function closeModal() { state.modalImg = null; renderOverlays(); }

function changeStatus(uid, newStatus) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.statusOverride = newStatus;
  render();
  saveField(uid, "status_override", newStatus);
}

function changeComment(uid, dbField, jsField, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop[jsField] = value;
  debouncedSave(uid, dbField, value);
}

function changeOffer(uid, value) {
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.offerPrice = value;
  debouncedSave(uid, "offer_price", value);
}

async function changePoc(uid, value) {
  if (!value) return;
  const prop = DATA.find(p => p.uid === uid);
  if (prop) prop.assignedBy = value;

  const key = uid + "_assigned_by";
  saveStatus[key] = "saving";
  renderSaveDot(key);

  try {
    const res = await fetch("/api/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, field: "assigned_by", value })
    });
    if (res.ok) {
      saveStatus[key] = "saved";
      renderSaveDot(key);
      setTimeout(function(){ saveStatus[key] = ""; renderSaveDot(key); }, 2000);
      // Re-render to update POC in main table
      render();
    } else {
      saveStatus[key] = "error";
      renderSaveDot(key);
    }
  } catch {
    saveStatus[key] = "error";
    renderSaveDot(key);
  }
}

// ── Auth ──
async function logout() {
  await fetch("/api/auth/logout");
  window.location.href = "/login.html";
}

// ── Admin ──
function openAdmin() {
  showAdminPanel = true;
  adminTab = "users";
  renderOverlays();
  Promise.all([loadUsers(), loadRequests(), loadTeam(), loadBugs()]).then(() => renderOverlays());
}

function closeAdmin() { showAdminPanel = false; renderOverlays(); }

function switchAdminTab(tab) {
  adminTab = tab;
  renderOverlays();
  if (tab === "bugs") loadBugs().then(() => renderOverlays());
  else if (tab === "team") loadTeam().then(() => renderOverlays());
  else if (tab === "users") Promise.all([loadUsers(), loadRequests()]).then(() => renderOverlays());
}

async function loadUsers() {
  try {
    const res = await fetch("/api/admin/users");
    if (res.ok) adminUsers = await res.json();
  } catch {}
}

async function loadRequests() {
  try {
    const res = await fetch("/api/admin/requests");
    if (res.ok) adminRequests = await res.json();
  } catch {}
}

async function loadTeam() {
  try {
    const res = await fetch("/api/admin/team");
    if (res.ok) adminTeam = await res.json();
  } catch {}
}

async function addUser() {
  const email = document.getElementById("addEmail").value.trim();
  const role = document.getElementById("addRole").value;
  if (!email) return;

  await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role })
  });
  document.getElementById("addEmail").value = "";
  await loadUsers();
  await loadRequests();
  renderOverlays();
}

async function removeUser(email) {
  if (!confirm("Remove " + email + "?")) return;
  await fetch("/api/admin/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  await loadUsers();
  renderOverlays();
}

async function handleRequest(id, action) {
  await fetch("/api/admin/requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action })
  });
  await Promise.all([loadUsers(), loadRequests()]);
  renderOverlays();
}

async function addTeamMember() {
  const email = document.getElementById("teamEmail").value.trim();
  const display_name = document.getElementById("teamName").value.trim();
  const manager_email = document.getElementById("teamManager").value;
  if (!email || !display_name) return alert("Email and Display Name are required");

  await fetch("/api/admin/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, display_name, manager_email })
  });
  await loadTeam();
  renderOverlays();
}

async function removeTeamMember(id) {
  if (!confirm("Remove this team member? Their visibility rules will be removed.")) return;
  await fetch("/api/admin/team", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  await loadTeam();
  renderOverlays();
}

// ── Bug Reporter ──
function openBugForm() { showBugForm = true; bugSubmitted = false; renderOverlays(); }
function closeBugForm() { showBugForm = false; bugSubmitted = false; renderOverlays(); }

async function submitBugReport() {
  const title = document.getElementById("bugTitle").value.trim();
  if (!title) { document.getElementById("bugTitle").style.borderColor = "#ef4444"; return; }

  const btn = document.getElementById("bugSubmitBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }

  try {
    const res = await fetch("/api/admin/bugs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title,
        description: "",
        steps_to_reproduce: "",
        severity: "medium",
        page: window.location.pathname,
        screenshot_url: (document.getElementById("bugScreenshot").value || "").trim(),
        browser_info: navigator.userAgent.replace(/.*?(Chrome|Firefox|Safari|Edge)\/(\S+).*/, "$1 $2"),
        screen_size: window.innerWidth + "x" + window.innerHeight,
      })
    });

    if (res.ok) {
      bugSubmitted = true;
      renderOverlays();
    } else {
      const err = await res.json().catch(() => ({}));
      alert("Failed: " + (err.error || "Unknown error"));
      if (btn) { btn.disabled = false; btn.textContent = "Submit"; }
    }
  } catch(e) {
    alert("Failed to submit: " + e.message);
    if (btn) { btn.disabled = false; btn.textContent = "Submit"; }
  }
}

async function loadBugs() {
  try {
    const res = await fetch("/api/admin/bugs");
    if (res.ok) adminBugs = await res.json();
  } catch {}
}

async function updateBugStatus(id, status) {
  await fetch("/api/admin/bugs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status })
  });
  await loadBugs();
  renderOverlays();
}

const bugNoteTimers = {};
function debouncedBugNote(id, value) {
  clearTimeout(bugNoteTimers[id]);
  bugNoteTimers[id] = setTimeout(async () => {
    await fetch("/api/admin/bugs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, admin_notes: value })
    });
  }, 800);
}

// ── Init ──
async function init() {
  try {
    // Check auth with retry for cold starts
    let authRes;
    for (let i = 0; i < 2; i++) {
      try {
        authRes = await fetch("/api/auth/me");
        if (authRes.ok) break;
      } catch(e) {
        if (i === 1) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!authRes || !authRes.ok) {
      window.location.href = "/login.html";
      return;
    }
    const authData = await authRes.json();
    currentUser = authData.user;

    // If admin, preload all admin panel data in background
    if (currentUser.role === "admin") {
      loadRequests();
      loadBugs();
      loadUsers();
      loadTeam();
    }

    await fetchProperties();
    lastDataHash = quickHash(DATA);

    render();

    // Start auto-polling every 30 seconds
    startAutoRefresh();
  } catch (err) {
    document.getElementById("app").innerHTML =
      '<div class="loading" style="color:#ef4444">Failed to load data. Check your API connection.<br><br><small>'+esc(err.message)+'</small></div>';
  }
}

// ── Auto Refresh (silent background polling) ──
let autoRefreshInterval = null;

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(silentRefresh, 30000); // every 30 seconds

  // Pause when tab is hidden, resume when visible
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    } else {
      silentRefresh(); // immediate refresh on tab return
      startAutoRefresh();
    }
  });
}

let lastDataHash = "";
function quickHash(data) {
  // Lightweight: just check count + last few editable fields
  let h = data.length + "|";
  const sample = data.slice(0, 50); // only check first 50 rows
  for (let i = 0; i < sample.length; i++) {
    const d = sample[i];
    h += (d.statusOverride||"") + (d.offerPrice||"") + (d.closureTeamComments||"").length + (d.rahoolComments||"").length + (d.prashantComments||"").length + (d.demandTeamComments||"").length + "|";
  }
  return h;
}

async function silentRefresh() {
  // Don't refresh if user is actively typing
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) return;

  // Don't refresh if admin panel or bug form is open
  if (showAdminPanel || showBugForm) return;

  // Don't refresh if tab is hidden
  if (document.hidden) return;

  try {
    const res = await fetch("/api/properties");
    if (res.status === 401) { window.location.href = "/login.html"; return; }
    if (!res.ok) return;
    const newData = await res.json();
    newData.forEach(p => {
      p.balconyDetails = ensureArray(p.balconyDetails);
      p.documentsAvailable = ensureArray(p.documentsAvailable);
      p.furnishingDetails = ensureArray(p.furnishingDetails);
    });

    const newHash = quickHash(newData);
    if (newHash !== lastDataHash) {
      lastDataHash = newHash;
      DATA = newData;
      normalizePocNames();
      const now = new Date();
      lastRefreshed = now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
      render();
    }
  } catch {}
}

init();

// Close multi-select dropdown on outside click
document.addEventListener("click", function() {
  if (state.msOpen) { state.msOpen = null; render(); }
});
